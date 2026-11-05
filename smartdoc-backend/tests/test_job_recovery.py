"""Restart recovery uses the disposable database from run_tests.py."""
import uuid
from pathlib import Path

import pytest

from app.core.config import settings
from app.core.datetime_utils import utc_now
from app.db.base import AsyncSessionLocal
from app.main import app, lifespan
from app.models.document import Document
from app.models.job import Job
from app.services.job_recovery import (
    INTERRUPTED_JOB_MESSAGE, processing_runtime_lock, recover_interrupted_jobs,
)
from conftest import TEST_USER_ID


async def seed_job(status, document_status=None):
    assert "/smartdoc_test_" in settings.DATABASE_URL, "Run via python run_tests.py"
    document_id, job_id = uuid.uuid4(), uuid.uuid4()
    source = Path(settings.STORAGE_PATH) / f"{document_id}.pdf"
    source.write_bytes(b"preserve-original")
    async with AsyncSessionLocal() as db:
        db.add(Document(id=document_id, user_id=uuid.UUID(TEST_USER_ID), feature="converter",
                        original_file=str(source), output_file=str(source)+".output.pdf",
                        original_size=17, output_size=12, status=document_status or status))
        await db.flush()
        db.add(Job(id=job_id, document_id=document_id, feature="converter", status=status,
                   progress=100 if status=="done" else 25,
                   error="original failure" if status=="failed" else None,
                   finished_at=utc_now() if status in ("done", "failed") else None))
        await db.commit()
    return job_id, document_id, source


@pytest.mark.asyncio
async def test_startup_recovers_pending_and_processing_only():
    records = {status: await seed_job(status) for status in ("pending", "processing", "done", "failed")}
    async with lifespan(app):
        async with AsyncSessionLocal() as db:
            for status, (job_id, document_id, source) in records.items():
                job, document = await db.get(Job,job_id), await db.get(Document,document_id)
                assert source.read_bytes() == b"preserve-original"
                if status in ("pending", "processing"):
                    assert job.status == document.status == "failed"
                    assert job.error == INTERRUPTED_JOB_MESSAGE
                    assert job.finished_at is not None and document.output_size is None
                else:
                    assert job.status == document.status == status
                    assert document.output_size == 12
                    assert job.error == ("original failure" if status=="failed" else None)
            timestamp = (await db.get(Job, records["processing"][0])).finished_at
            assert await recover_interrupted_jobs(db) == 0
        async with AsyncSessionLocal() as db:
            assert (await db.get(Job, records["processing"][0])).finished_at == timestamp


@pytest.mark.asyncio
async def test_recovery_preserves_a_completed_document():
    job_id, document_id, _ = await seed_job("processing", document_status="done")
    async with processing_runtime_lock():
        async with AsyncSessionLocal() as db:
            await recover_interrupted_jobs(db)
        async with AsyncSessionLocal() as db:
            assert (await db.get(Job,job_id)).status == "failed"
            document = await db.get(Document,document_id)
            assert document.status == "done" and document.output_size == 12


@pytest.mark.asyncio
async def test_second_runtime_is_rejected_and_lock_released_on_error():
    async with processing_runtime_lock():
        with pytest.raises(RuntimeError, match="Backend SmartDoc lain"):
            async with processing_runtime_lock():
                pytest.fail("A second backend must not recover live jobs")
    with pytest.raises(ValueError, match="startup failed"):
        async with processing_runtime_lock():
            raise ValueError("startup failed")
    async with processing_runtime_lock():
        pass  # Startup errors must not leak a PostgreSQL session lock.


@pytest.mark.asyncio
async def test_recovery_changes_roll_back_when_commit_fails(monkeypatch):
    job_id, document_id, _ = await seed_job("processing")
    async with processing_runtime_lock():
        async with AsyncSessionLocal() as db:
            async def fail_commit():
                raise RuntimeError("database commit failed")
            monkeypatch.setattr(db, "commit", fail_commit)
            with pytest.raises(RuntimeError, match="database commit failed"):
                await recover_interrupted_jobs(db)
        async with AsyncSessionLocal() as db:
            assert (await db.get(Job,job_id)).status == "processing"
            assert (await db.get(Document,document_id)).status == "processing"
