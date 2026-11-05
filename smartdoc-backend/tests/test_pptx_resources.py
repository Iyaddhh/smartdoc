"""Bounded PPTX I/O, verified fallback, atomic output and failure cleanup."""
import asyncio
import io
import threading
import uuid
import zipfile
from hashlib import file_digest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException, UploadFile
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.uploads import stage_pptx_upload, UPLOAD_CHUNK_BYTES
from app.core.validators import validate_office_archive
from app.db.base import AsyncSessionLocal
from app.main import app
from app.models.document import Document
from app.models.job import Job
from app.core.config import Settings
from pydantic import ValidationError
from app.services.compressor.office import compress_pptx
from app.services.compressor.pptx_archive import pptx_staging_path
from app.services.compressor.pptx_images import optimize_pptx_image
from app.api.tool_sources import tool_inputs
from starlette.requests import Request
from starlette.datastructures import Headers
from test_pptx_preservation import presentation_file
from test_pptx_balanced import png_bytes
from test_pptx_upload_limits import pptx_bytes

MB = 1024 * 1024


@pytest.mark.parametrize("file_mb,request_mb,accepted", [(200, 202, True), (200, 200, False), (201, 202, False), (201, 203, True)])
def test_request_config_cannot_block_the_advertised_file_limit(file_mb, request_mb, accepted):
    if accepted:
        Settings(_env_file=None, MAX_FILE_SIZE_PPTX_MB=file_mb, MAX_REQUEST_SIZE_MB=request_mb)
    else:
        with pytest.raises(ValidationError, match="margin multipart"):
            Settings(_env_file=None, MAX_FILE_SIZE_PPTX_MB=file_mb, MAX_REQUEST_SIZE_MB=request_mb)


def large_part(path, name="ppt/media/large.bin", size=3 * MB):
    presentation_file(path)
    with zipfile.ZipFile(path, "a", compression=zipfile.ZIP_STORED) as archive:
        with archive.open(name, "w") as stream:
            for _ in range(size // MB):
                stream.write(b"x" * MB)
    return path


@pytest.mark.asyncio
async def test_disk_staging_bounds_reads_and_accepts_path_validation(tmp_path):
    source = large_part(tmp_path / "source.pptx")
    class Bounded(io.BytesIO):
        def read(self, size=-1):
            assert 0 < size <= UPLOAD_CHUNK_BYTES
            return super().read(size)
    upload = UploadFile(file=Bounded(source.read_bytes()), filename="slides.PPTX")
    destination = tmp_path / "staged.pptx"
    assert await stage_pptx_upload(upload, destination) == source.stat().st_size
    validate_office_archive(destination, ".PPTX")
    assert destination.read_bytes() == source.read_bytes()


@pytest.mark.asyncio
@pytest.mark.parametrize("fault", ["empty", "invalid", "over-limit", "read-failure", "zero-capacity"])
async def test_failed_staging_removes_partial_files(tmp_path, fault):
    class Broken(io.BytesIO):
        def read(self, size=-1):
            if self.tell():
                raise OSError("synthetic read failure")
            return super().read(size)
    raw = b"" if fault == "empty" else b"invalid" if fault == "invalid" else pptx_bytes()
    stream = Broken(raw) if fault == "read-failure" else io.BytesIO(raw)
    upload = UploadFile(file=stream, filename="slides.pptx")
    destination = tmp_path / "failed.pptx"
    cap = 0 if fault == "zero-capacity" else len(raw) - 1 if fault == "over-limit" else None
    with pytest.raises((HTTPException, OSError)):
        await stage_pptx_upload(upload, destination, cap)
    assert not destination.exists()


@pytest.mark.asyncio
async def test_staging_header_limit_and_existing_destination_never_overwrite(tmp_path):
    upload = UploadFile(file=io.BytesIO(pptx_bytes()), filename="slides.pptx", headers=Headers({"content-length": str(200 * MB + 1)}))
    destination = tmp_path / "existing.pptx"
    destination.write_bytes(b"existing output")
    with pytest.raises(HTTPException) as error:
        await stage_pptx_upload(upload, destination)
    assert error.value.status_code == 413
    upload.headers = Headers()
    with pytest.raises(FileExistsError):
        await stage_pptx_upload(upload, destination)
    assert destination.read_bytes() == b"existing output"


@pytest.mark.asyncio
async def test_cancelled_staging_waits_for_writer_and_removes_its_file(tmp_path):
    started, release = threading.Event(), threading.Event()
    class Blocking(io.BytesIO):
        def read(self, size=-1):
            if self.tell():
                started.set()
                assert release.wait(5)
            return super().read(size)
    upload = UploadFile(file=Blocking(pptx_bytes()), filename="slides.pptx")
    destination = tmp_path / "cancelled.pptx"
    task = asyncio.create_task(stage_pptx_upload(upload, destination))
    assert await asyncio.to_thread(started.wait, 5)
    task.cancel()
    release.set()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert not destination.exists()


@pytest.mark.parametrize("media_name", ["ppt/media/large.bin", "ppt/media/large.png"])
def test_large_parts_are_streamed_and_result_can_be_validated_again(tmp_path, monkeypatch, media_name):
    source = large_part(tmp_path / "source.pptx", media_name)
    output = tmp_path / "result.pptx"
    read = zipfile.ZipFile.read
    def bounded_read(archive, name, *args, **kwargs):
        entry = name if isinstance(name, zipfile.ZipInfo) else archive.getinfo(name)
        assert entry.file_size <= MB, "large part was buffered"
        return read(archive, name, *args, **kwargs)
    monkeypatch.setattr(zipfile.ZipFile, "read", bounded_read)
    monkeypatch.setattr("app.services.compressor.pptx_archive.MAX_IMAGE_BYTES", MB)
    assert compress_pptx(str(source), str(output)) is True
    validate_office_archive(output, ".pptx")
    with zipfile.ZipFile(source) as before, zipfile.ZipFile(output) as after:
        assert before.namelist() == after.namelist()
        assert after.getinfo(media_name).compress_type == zipfile.ZIP_STORED
        for name in before.namelist():
            if name.startswith("ppt/media/") and name != media_name:
                continue  # Other small raster images may be optimized in balanced mode.
            with before.open(name) as first, after.open(name) as second:
                assert file_digest(first, "sha256").digest() == file_digest(second, "sha256").digest()
    assert not pptx_staging_path(output).exists()


@pytest.mark.parametrize("existing", [False, True])
def test_corrupt_source_crc_never_becomes_successful_fallback(tmp_path, existing):
    source = large_part(tmp_path / "source.pptx")
    output = tmp_path / "result.pptx"
    if existing:
        output.write_bytes(b"prior output")
    with zipfile.ZipFile(source) as archive:
        info = archive.getinfo("ppt/media/large.bin")
    with source.open("r+b") as stream:
        stream.seek(info.header_offset + 30 + len(info.filename.encode()) + len(info.extra))
        stream.write(b"!")
    with pytest.raises(zipfile.BadZipFile):
        compress_pptx(str(source), str(output))
    assert output.read_bytes() == b"prior output" if existing else not output.exists()


def test_atomic_publish_failure_preserves_existing_output_and_cleans_temp(tmp_path, monkeypatch):
    source = presentation_file(tmp_path / "source.pptx")
    output = tmp_path / "result.pptx"
    output.write_bytes(b"prior output")
    def fail_publish(*_args):
        raise OSError("synthetic publish failure")
    monkeypatch.setattr("app.services.compressor.pptx_archive.os.replace", fail_publish)
    with pytest.raises(OSError):
        compress_pptx(str(source), str(output))
    assert output.read_bytes() == b"prior output"
    assert not pptx_staging_path(output).exists()


def test_image_over_pixel_budget_is_retained_without_decode(tmp_path, monkeypatch):
    raw = png_bytes(alpha=True)
    monkeypatch.setattr(settings, "MAX_PPTX_IMAGE_PIXELS", 10)
    assert optimize_pptx_image(raw, ".png") == raw


@pytest.mark.asyncio
async def test_saved_snapshot_rolls_to_disk_and_closes_on_exit(tmp_path, monkeypatch):
    source = large_part(tmp_path / "source.pptx")
    monkeypatch.setattr("app.services.job_admission.admit_job", AsyncMock())
    monkeypatch.setattr("app.api.tool_sources.require_document", AsyncMock(return_value=SimpleNamespace(is_saved=True, output_file=str(source), custom_name="Review")))
    monkeypatch.setattr("app.api.tool_sources.download_available", lambda _document: True)
    generator = tool_inputs(Request({"type": "http", "path": "/api/compressor/process", "headers": []}), file=None, files=[],
        source_document_id=uuid.uuid4(), source_document_ids=[], user=SimpleNamespace(id=uuid.uuid4()), db=object())
    snapshot = (await anext(generator))[0]
    assert snapshot.file._rolled and snapshot.size == source.stat().st_size
    assert snapshot.file.read(4) == b"PK\x03\x04"
    await generator.aclose()
    assert snapshot.file.closed and source.exists()


@pytest.mark.asyncio
@pytest.mark.parametrize("fault", ["commit", "write"])
async def test_private_compressor_failure_cleans_staging_and_does_not_create_job(auth_headers, tmp_path, monkeypatch, fault):
    monkeypatch.setattr(settings, "STORAGE_PATH", str(tmp_path))
    async with AsyncSessionLocal() as db:
        before = (await db.execute(select(func.count(Job.id)))).scalar_one()
    if fault == "commit":
        async def fail_commit(_db):
            raise RuntimeError("synthetic commit failure")
        monkeypatch.setattr(AsyncSession, "commit", fail_commit)
    else:
        async def fail_write(_file, destination, *_args):
            destination.write_bytes(b"partial write")
            raise OSError("synthetic disk failure")
        monkeypatch.setattr("app.api.compressor.stage_pptx_upload", fail_write)
    async with AsyncClient(transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://test", headers=auth_headers) as client:
        response = await client.post("/api/compressor/process", files={"file": ("Review.pptx", pptx_bytes())})
    assert response.status_code == 500
    assert not list((tmp_path / "work").iterdir()) and not list((tmp_path / "results").iterdir())
    async with AsyncSessionLocal() as db:
        assert (await db.execute(select(func.count(Job.id)))).scalar_one() == before


@pytest.mark.asyncio
async def test_compressor_cancellation_cleans_registered_partial_output(tmp_path, monkeypatch):
    from app.api.compressor import _run_compress_job
    from conftest import TEST_USER_ID
    monkeypatch.setattr(settings, "STORAGE_PATH", str(tmp_path))
    source = presentation_file(tmp_path / "work.pptx")
    output = tmp_path / "result.pptx"
    staging = pptx_staging_path(output)
    document_id, job_id = uuid.uuid4(), uuid.uuid4()
    async with AsyncSessionLocal() as db:
        db.add(Document(id=document_id, user_id=uuid.UUID(TEST_USER_ID), feature="compressor", status="pending",
            original_size=source.stat().st_size, original_file=str(source), output_file=str(output), source_paths=[str(source), str(staging)]))
        db.add(Job(id=job_id, document_id=document_id, feature="compressor", status="pending", progress=0))
        await db.commit()
    async def interrupted(*_args):
        staging.write_bytes(b"partial worker output")
        raise asyncio.CancelledError()
    monkeypatch.setattr("app.api.compressor.run_engine", interrupted)
    with pytest.raises(asyncio.CancelledError):
        await _run_compress_job(str(job_id), str(document_id), str(source), str(output), ".pptx", 85, 150)
    assert not source.exists() and not staging.exists() and not output.exists()
    async with AsyncSessionLocal() as db:
        assert (await db.get(Job, job_id)).status == "failed"


@pytest.mark.asyncio
async def test_failed_saved_source_compression_preserves_workspace_original(auth_client, auth_headers, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "STORAGE_PATH", str(tmp_path))
    raw = pptx_bytes()
    uploaded = await auth_client.post("/api/workspace/documents", files={"file": ("Review.pptx", raw)})
    assert uploaded.status_code == 201
    source_id = uuid.UUID(uploaded.json()["data"]["id"])
    async def fail_commit(_db):
        raise RuntimeError("synthetic saved-source commit failure")
    monkeypatch.setattr(AsyncSession, "commit", fail_commit)
    async with AsyncClient(transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://test", headers=auth_headers) as client:
        response = await client.post("/api/compressor/process", data={"source_document_id": str(source_id)})
    assert response.status_code == 500
    async with AsyncSessionLocal() as db:
        source = await db.get(Document, source_id)
        assert source.is_saved and Path(source.output_file).read_bytes() == raw
    assert not list((tmp_path / "work").iterdir()) and not list((tmp_path / "results").iterdir())


@pytest.mark.asyncio
@pytest.mark.parametrize("saved", [False, True])
async def test_real_200_mb_private_upload_and_workspace_source(auth_client, tmp_path, monkeypatch, saved):
    monkeypatch.setattr(settings, "STORAGE_PATH", str(tmp_path / "storage"))
    source = tmp_path / "large.pptx"
    source.write_bytes(pptx_bytes())
    name = "ppt/media/large.bin"
    remaining = 200 * MB - source.stat().st_size - 76 - 2 * len(name)
    with zipfile.ZipFile(source, "a", compression=zipfile.ZIP_STORED) as archive:
        with archive.open(name, "w") as stream:
            while remaining:
                length = min(remaining, MB)
                stream.write(b"x" * length)
                remaining -= length
    assert source.stat().st_size == 200 * MB
    if saved:
        with source.open("rb") as stream:
            uploaded = await auth_client.post("/api/workspace/documents", files={"file": ("Review.pptx", stream)})
        assert uploaded.status_code == 201, uploaded.text
        source_id = uploaded.json()["data"]["id"]
        response = await auth_client.post("/api/compressor/process", data={"source_document_id": source_id})
    else:
        with source.open("rb") as stream:
            response = await auth_client.post("/api/compressor/process", files={"file": ("Review.pptx", stream)})
    assert response.status_code == 202, response.text
    result = response.json()["data"]
    job = (await auth_client.get(f"/api/jobs/{result['job_id']}")).json()["data"]
    assert job["status"] == "done" and job["download_available"] and job["original_size"] == 200 * MB
    async with AsyncSessionLocal() as db:
        document = await db.get(Document, uuid.UUID(result["document_id"]))
        validate_office_archive(Path(document.output_file), ".pptx")
        with zipfile.ZipFile(source) as before, zipfile.ZipFile(document.output_file) as after:
            assert before.namelist() == after.namelist()
            for name in before.namelist():
                with before.open(name) as first, after.open(name) as second:
                    assert file_digest(first, "sha256").digest() == file_digest(second, "sha256").digest()
        if saved:
            original = await db.get(Document, uuid.UUID(source_id))
            assert original.is_saved and Path(original.output_file).stat().st_size == 200 * MB
    with source.open("ab") as stream:
        stream.write(b"!")
    with source.open("rb") as stream:
        over = await auth_client.post("/api/workspace/documents" if saved else "/api/compressor/process", files={"file": ("Review.pptx", stream)})
    assert over.status_code == 413
