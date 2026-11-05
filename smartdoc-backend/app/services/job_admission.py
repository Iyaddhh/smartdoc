"""Serialize admission until the job transaction commits; reject overload early."""
import shutil
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import select, func, text

from app.core.config import settings
from app.models.document import Document
from app.models.job import Job


async def admit_job(db, user_id):
    # Acquire before account/document locks. Never wait with uploaded source copies.
    acquired = (await db.execute(text("SELECT pg_try_advisory_xact_lock(734015921)"))).scalar_one()
    if not acquired:
        raise HTTPException(429, "Penerimaan proses sedang sibuk. Coba lagi.", headers={"Retry-After": "2"})
    active = select(func.count(Job.id)).join(Document, Job.document_id == Document.id).where(
        Job.status.in_(("pending", "processing")))
    total = (await db.execute(active)).scalar_one()
    owned = (await db.execute(active.where(Document.user_id == user_id))).scalar_one()
    if total >= settings.MAX_ACTIVE_JOBS_GLOBAL or owned >= settings.MAX_ACTIVE_JOBS_PER_USER:
        raise HTTPException(429, "Antrean proses penuh. Tunggu pekerjaan selesai.", headers={"Retry-After": "5"})
    root = Path(settings.STORAGE_PATH).resolve()
    while not root.exists():
        root = root.parent
    max_upload_mb = max(settings.MAX_TOTAL_UPLOAD_MB, settings.MAX_FILE_SIZE_PPTX_MB)
    required = (settings.MIN_FREE_DISK_MB + max_upload_mb) * 1024 * 1024
    if shutil.disk_usage(root).free < required:
        raise HTTPException(503, "Penyimpanan pemrosesan sedang penuh. Coba lagi nanti.", headers={"Retry-After": "60"})
