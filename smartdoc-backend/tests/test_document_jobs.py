"""Regression checks for job completion, failure and engine cancellation."""
import asyncio
import shutil
import threading
import uuid
from pathlib import Path

import pytest
from sqlalchemy import select

from app.api.compressor import _run_compress_job
from app.core.config import settings
from app.core.workers import run_sync
from app.db.base import AsyncSessionLocal
from app.models.document import Document
from app.models.job import Job
from conftest import TEST_USER_ID


@pytest.mark.asyncio
@pytest.mark.parametrize("output", ["missing", "empty", "unchanged", "partial-error"])
async def test_compression_requires_downloadable_output(monkeypatch, output):
    assert "/smartdoc_test_" in settings.DATABASE_URL, "Run via python run_tests.py"
    directory = Path(settings.STORAGE_PATH) / uuid.uuid4().hex
    directory.mkdir(parents=True)
    source, target = directory / "input.jpg", directory / "output.jpg"
    source.write_bytes(b"test-input")
    document_id, job_id = uuid.uuid4(), uuid.uuid4()
    async with AsyncSessionLocal() as db:
        db.add(Document(id=document_id, user_id=uuid.UUID(TEST_USER_ID), feature="compressor",
                        original_file=str(source), output_file=str(target), original_size=10, status="pending"))
        await db.flush()
        db.add(Job(id=job_id, document_id=document_id, feature="compressor", status="pending"))
        await db.commit()

    def engine(*args):
        if output == "empty":
            target.touch()
        elif output == "unchanged":
            shutil.copyfile(source, target)
        elif output == "partial-error":
            target.write_bytes(b"partial")
            raise RuntimeError("Engine failed")
        return False  # False can mean already optimal, not failure.

    monkeypatch.setattr("app.api.compressor.compress_jpg", engine)
    # This test exercises job state transitions with injected engine outcomes.
    # Real subprocess execution/cancellation is covered by test_engine_workers.
    monkeypatch.setattr("app.api.compressor.run_engine", run_sync)
    await _run_compress_job(str(job_id), str(document_id), str(source), str(target), ".jpg", 80, 120)
    async with AsyncSessionLocal() as db:
        job = (await db.execute(select(Job).where(Job.id == job_id))).scalar_one()
        document = await db.get(Document, document_id)
        assert job.status == document.status == ("done" if output == "unchanged" else "failed")
        assert job.finished_at is not None
        if output == "unchanged":
            assert job.progress == 100 and job.error is None
            assert document.output_size == len(b"test-input")
            assert target.read_bytes() == b"test-input"
            assert not source.exists()  # Processing copies are removed after completion.
        else:
            assert job.error and document.output_size is None
            assert not target.exists() and not source.exists()


@pytest.mark.asyncio
async def test_cancelled_thread_finishes_before_cleanup(tmp_path):
    started, release = threading.Event(), threading.Event()
    target = tmp_path / "output"

    def engine():
        started.set()
        assert release.wait(5)
        target.write_text("finished")

    task = asyncio.create_task(run_sync(engine))
    try:
        for _ in range(100):
            if started.is_set():
                break
            await asyncio.sleep(.01)
        assert started.is_set()
        task.cancel()
        await asyncio.sleep(.01)
        assert not task.done()
    finally:
        release.set()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert target.read_text() == "finished"


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["pending", "processing", "failed"])
async def test_partial_output_cannot_be_downloaded(auth_client, status):
    assert "/smartdoc_test_" in settings.DATABASE_URL, "Run via python run_tests.py"
    document_id = uuid.uuid4()
    path = Path(settings.STORAGE_PATH) / f"{document_id}.pdf"
    path.write_bytes(b"unfinished-output")
    async with AsyncSessionLocal() as db:
        db.add(Document(id=document_id, user_id=uuid.UUID(TEST_USER_ID), feature="converter",
                        original_file=str(path), output_file=str(path), original_size=17, status=status))
        await db.commit()
    for action in ("download", "preview"):
        assert (await auth_client.get(f"/api/documents/{document_id}/{action}")).status_code == 409
    assert (await auth_client.post("/api/documents/batch-download", json={"ids": [str(document_id)]})).status_code == 404
    async with AsyncSessionLocal() as db:
        document = await db.get(Document, document_id)
        document.status = "done"
        await db.commit()
    assert (await auth_client.get(f"/api/documents/{document_id}/download")).content == b"unfinished-output"
