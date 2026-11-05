import uuid
from datetime import timedelta
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.core.config import settings
from app.core.datetime_utils import utc_now
from app.core.limiter import rate_limit_identity
from app.core.security import create_access_token
from app.db.base import AsyncSessionLocal
from app.models.document import Document
from app.services.document_storage import cleanup_expired_results
from app.services.job_admission import admit_job
from app.services.job_recovery import recover_interrupted_jobs
from test_job_recovery import seed_job
from conftest import TEST_USER_ID


@pytest.mark.asyncio
async def test_admission_serializes_and_releases_on_rollback(monkeypatch):
    monkeypatch.setattr(settings, "MAX_ACTIVE_JOBS_GLOBAL", 10000)
    monkeypatch.setattr(settings, "MAX_ACTIVE_JOBS_PER_USER", 10000)
    async with AsyncSessionLocal() as first, AsyncSessionLocal() as second:
        await admit_job(first, uuid.UUID(TEST_USER_ID))
        with pytest.raises(HTTPException) as error:
            await admit_job(second, uuid.UUID(TEST_USER_ID))
        assert error.value.status_code == 429
        await first.rollback()
        await admit_job(second, uuid.UUID(TEST_USER_ID))


@pytest.mark.asyncio
@pytest.mark.parametrize("scope", ["user", "global", "disk"])
async def test_admission_rejects_capacity(monkeypatch, scope):
    await seed_job("pending")
    monkeypatch.setattr(settings, "MAX_ACTIVE_JOBS_GLOBAL", 1 if scope == "global" else 10000)
    monkeypatch.setattr(settings, "MAX_ACTIVE_JOBS_PER_USER", 1 if scope == "user" else 10000)
    if scope == "disk":
        monkeypatch.setattr("app.services.job_admission.shutil.disk_usage", lambda path: SimpleNamespace(free=0))
    async with AsyncSessionLocal() as db:
        with pytest.raises(HTTPException) as error:
            await admit_job(db, uuid.UUID(TEST_USER_ID))
        assert error.value.status_code == (503 if scope == "disk" else 429)


@pytest.mark.asyncio
async def test_interrupted_files_expire_after_retention():
    _, document_id, source = await seed_job("processing")
    async with AsyncSessionLocal() as db:
        await recover_interrupted_jobs(db)
        document = await db.get(Document, document_id)
        assert document.expires_at > utc_now()
        await cleanup_expired_results(db)
        assert source.exists()
        document.expires_at = utc_now() - timedelta(seconds=1)
        await db.commit()
        await cleanup_expired_results(db)
        assert not source.exists()
        await db.refresh(document)
        assert document.storage_notice == "expired"


def test_cookie_accounts_have_separate_rate_buckets():
    identities = []
    for _ in range(2):
        user_id = str(uuid.uuid4())
        token = create_access_token({"sub": user_id, "sid": str(uuid.uuid4()), "ver": 0, "role": "user"})
        request = Request({"type": "http", "headers": [(b"cookie", f"smartdoc_access={token}".encode())], "client": ("127.0.0.1", 1000)})
        identities.append(rate_limit_identity(request))
        assert identities[-1] == f"account:{user_id}"
    assert identities[0] != identities[1]
    invalid = Request({"type": "http", "headers": [(b"cookie", b"smartdoc_access=invalid")], "client": ("127.0.0.1", 1000)})
    assert rate_limit_identity(invalid) == "ip:127.0.0.1"
