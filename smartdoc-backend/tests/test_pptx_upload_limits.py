"""PPTX compression limits across upload, request, archive and guest processing."""
import io
import uuid
import zipfile
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException, UploadFile
from httpx import ASGITransport, AsyncClient
from pptx import Presentation
from starlette.datastructures import Headers
from starlette.requests import Request

from app.core.config import settings
from app.core.validators import validate_and_read_upload, validate_office_archive
from app.main import app
from app.api.tool_sources import tool_inputs

MB = 1024 * 1024


def pptx_bytes():
    stream = io.BytesIO()
    presentation = Presentation()
    presentation.slides.add_slide(presentation.slide_layouts[6])
    presentation.save(stream)
    return stream.getvalue()


@pytest.mark.asyncio
async def test_pptx_size_header_rejects_over_200_mb_without_reading():
    upload = UploadFile(file=io.BytesIO(), filename="large.pptx",
                        headers=Headers({"content-length": str(200 * MB + 1)}))
    upload.read = AsyncMock()
    with pytest.raises(HTTPException) as error:
        await validate_and_read_upload(upload, ".pptx")
    assert error.value.status_code == 413
    assert "200 MB" in error.value.detail
    upload.read.assert_not_called()


@pytest.mark.asyncio
async def test_request_accepts_200_mb_declaration_and_rejects_over_request_limit(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "STORAGE_PATH", str(tmp_path))
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Use the real request middleware without allocating a 200 MB fixture.
        response = await client.post("/api/guest/compressor", headers={"content-length": str(200 * MB)},
                                     files={"files": ("slides.pptx", pptx_bytes())})
        assert response.status_code == 200, response.text[:300]
        assert len(Presentation(io.BytesIO(response.content)).slides) == 1
        response = await client.post("/api/guest/compressor",
                                     headers={"content-length": str(settings.MAX_REQUEST_SIZE_MB * MB + 1)})
        assert response.status_code == 413


@pytest.mark.asyncio
async def test_real_200_mb_pptx_upload_compresses_and_one_byte_over_is_rejected(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "STORAGE_PATH", str(tmp_path / "storage"))
    source = tmp_path / "slides.pptx"
    source.write_bytes(pptx_bytes())
    media_name = "ppt/media/large-media.bin"
    # A stored ZIP member has a local header (30 bytes) and directory entry (46).
    # Stream the payload to disk so fixture creation uses only a 1 MB buffer.
    payload_size = 200 * MB - source.stat().st_size - 76 - 2 * len(media_name)
    with zipfile.ZipFile(source, "a", compression=zipfile.ZIP_STORED) as archive:
        with archive.open(media_name, "w") as payload:
            chunk = b"x" * MB
            while payload_size:
                length = min(payload_size, len(chunk))
                payload.write(chunk[:length])
                payload_size -= length
    assert source.stat().st_size == 200 * MB
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        with source.open("rb") as stream:
            response = await client.post("/api/guest/compressor", files={"files": ("slides.pptx", stream)})
        assert response.status_code == 200, response.text[:300]
        assert len(response.content) < source.stat().st_size
        assert len(Presentation(io.BytesIO(response.content)).slides) == 1
        with source.open("ab") as stream:
            stream.write(b"x")
        with source.open("rb") as stream:
            response = await client.post("/api/guest/compressor", files={"files": ("slides.pptx", stream)})
        assert response.status_code == 413
        assert "200 MB" in response.text
    assert list((tmp_path / "storage" / "temp" / "guest").iterdir()) == []


@pytest.mark.asyncio
@pytest.mark.parametrize("feature,expected", [("compressor", 200), ("converter", 413)])
async def test_guest_pptx_compression_can_exceed_batch_limit(tmp_path, monkeypatch, feature, expected):
    monkeypatch.setattr(settings, "STORAGE_PATH", str(tmp_path))
    # Scale the old batch cap below a valid PPTX; the new file cap stays 200 MB.
    monkeypatch.setattr(settings, "MAX_TOTAL_UPLOAD_MB", 0)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(f"/api/guest/{feature}", files={"files": ("slides.PPTX", pptx_bytes())})
    assert response.status_code == expected, response.text[:300]
    if expected == 200:
        assert len(Presentation(io.BytesIO(response.content)).slides) == 1
    assert list((tmp_path / "temp" / "guest").iterdir()) == []


@pytest.mark.parametrize("entry_mb,total_mb,accepted", [(200, 512, True), (201, 512, False), (200, 513, False)])
def test_pptx_archive_limits_allow_large_media_but_remain_bounded(monkeypatch, entry_mb, total_mb, accepted):
    entries = [SimpleNamespace(filename="[Content_Types].xml", file_size=0, compress_size=0, flag_bits=0),
               SimpleNamespace(filename="ppt/presentation.xml", file_size=0, compress_size=0, flag_bits=0)]
    remaining = total_mb
    while remaining:
        size = min(entry_mb, remaining)
        entries.append(SimpleNamespace(filename=f"ppt/media/{len(entries)}.bin", file_size=size * MB,
                                       compress_size=size * MB, flag_bits=0))
        remaining -= size
    class Archive:
        def __enter__(self):
            return self
        def __exit__(self, *_args):
            pass
        def infolist(self):
            return entries
    monkeypatch.setattr("app.core.validators.zipfile.ZipFile", lambda *_args: Archive())
    if accepted:
        validate_office_archive(b"", ".pptx")
    else:
        with pytest.raises(HTTPException) as error:
            validate_office_archive(b"", ".pptx")
        assert error.value.status_code == 413


def test_pptx_archive_still_rejects_excessive_compression_ratio():
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", b"<Types/>")
        archive.writestr("ppt/presentation.xml", b"<presentation/>")
        archive.writestr("ppt/media/bomb.bin", b"0" * MB)
    with pytest.raises(HTTPException) as error:
        validate_office_archive(stream.getvalue(), ".pptx")
    assert error.value.status_code == 413


@pytest.mark.asyncio
@pytest.mark.parametrize("feature,accepted", [("compressor", True), ("converter", False)])
async def test_saved_pptx_uses_compression_limit(tmp_path, monkeypatch, feature, accepted):
    source = tmp_path / "slides.pptx"
    source.write_bytes(pptx_bytes())
    document = SimpleNamespace(is_saved=True, output_file=str(source), custom_name="Slides")
    monkeypatch.setattr(settings, "MAX_TOTAL_UPLOAD_MB", 0)
    monkeypatch.setattr("app.services.job_admission.admit_job", AsyncMock())
    monkeypatch.setattr("app.api.tool_sources.require_document", AsyncMock(return_value=document))
    monkeypatch.setattr("app.api.tool_sources.download_available", lambda _doc: True)
    request = Request({"type": "http", "path": f"/api/{feature}/process", "headers": []})
    sources = tool_inputs(request, file=None, files=[], source_document_id=uuid.uuid4(), source_document_ids=[],
                          user=SimpleNamespace(id=uuid.uuid4()), db=object())
    try:
        if accepted:
            inputs = await anext(sources)
            assert len(inputs) == 1
            assert await inputs[0].read() == source.read_bytes()
        else:
            with pytest.raises(HTTPException) as error:
                await anext(sources)
            assert error.value.status_code == 413
    finally:
        await sources.aclose()
