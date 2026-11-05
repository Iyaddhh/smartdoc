"""Startup recovery for the single-process, in-process document worker."""
from contextlib import asynccontextmanager
from datetime import timedelta
from app.core.config import settings

from sqlalchemy import select, text, update

from app.core.datetime_utils import utc_now
from app.db.base import engine
from app.models.document import Document
from app.models.job import Job
from app.services.document_audit import record_document_activity

PROCESSING_LOCK_KEY = 0x534D415254444F43  # SMARTDOC; scoped to this database.
INTERRUPTED_JOB_MESSAGE = (
    "Proses terhenti karena backend dimulai ulang. "
    "Unggah kembali berkas untuk mencoba lagi."
)
ACTIVE_STATUSES = ("pending", "processing")


@asynccontextmanager
async def processing_runtime_lock():
    """Hold one PostgreSQL session lock for the entire backend lifespan.

    A second backend must not reconcile jobs belonging to a live process.
    PostgreSQL releases this lock when the owning connection/process dies.
    """
    async with engine.connect() as connection:
        acquired = False
        try:
            acquired = bool((await connection.execute(
                text("SELECT pg_try_advisory_lock(:key)"), {"key": PROCESSING_LOCK_KEY}
            )).scalar_one())
            await connection.commit()  # Session locks survive transaction commits.
            if not acquired:
                raise RuntimeError(
                    "Backend SmartDoc lain masih aktif pada database ini. "
                    "Jalankan satu proses backend (--workers 1) untuk pemrosesan dokumen."
                )
            yield
        finally:
            if acquired:
                try:
                    await connection.execute(
                        text("SELECT pg_advisory_unlock(:key)"), {"key": PROCESSING_LOCK_KEY}
                    )
                    await connection.commit()
                except BaseException:
                    # Never return a potentially locked connection to the pool.
                    await connection.invalidate()
                    raise


async def recover_interrupted_jobs(db):
    """Reconcile unfinished records before serving requests, under runtime lock.

    Do not infer success from a partial output or automatically rerun engines.
    Retain interrupted working files for one TTL, then expire them through the
    normal cleanup flow. Incomplete outputs are never downloadable.
    """
    rows = (await db.execute(
        select(Job).where(Job.status.in_(ACTIVE_STATUSES)).with_for_update()
    )).scalars().all()
    if not rows:
        return 0
    finished_at = utc_now()
    for job in rows:
        document = await db.get(Document, job.document_id)
        if document:
            record_document_activity(db, document, "process_finished", outcome="failed", code="PROCESS_INTERRUPTED", system=True)
        job.status = "failed"
        job.error = INTERRUPTED_JOB_MESSAGE
        job.finished_at = finished_at
    await db.execute(
        update(Document).where(
            Document.id.in_({job.document_id for job in rows}),
            Document.status.in_(ACTIVE_STATUSES),
            Document.is_saved.is_(False),
        ).values(status="failed", output_size=None,
                 expires_at=finished_at + timedelta(hours=settings.TEMP_FILE_TTL_HOURS))
    )
    await db.commit()
    return len(rows)
