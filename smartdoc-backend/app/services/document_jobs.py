from app.services.document_audit import record_document_activity
"""Shared state transitions for private document jobs.

Job and document status are committed together. An engine's boolean is not a
substitute for checking its output (compression may return an unchanged copy).
"""
import uuid
from datetime import timedelta
from fastapi import HTTPException
from pathlib import Path

from app.core.datetime_utils import utc_now
from app.core.logger import logger
from app.core.storage import is_storage_file
from app.models.document import Document
from app.models.job import Job
from app.core.config import settings
from app.services.document_storage import locked_document, save_result


async def job_records(db, job_id, document_id):
    job = await db.get(Job, uuid.UUID(str(job_id)))
    document = await db.get(Document, uuid.UUID(str(document_id)))
    if not job or not document or job.document_id != document.id:
        raise RuntimeError("Data proses atau dokumen tidak tersedia.")
    return job, document


async def start_job(db, job_id, document_id, progress=25):
    job, document = await job_records(db, job_id, document_id)
    job.status = document.status = "processing"
    job.progress = progress
    job.error = None
    job.started_at = utc_now()
    record_document_activity(db, document, "process_started", system=True)
    await db.commit()
    return job


def output_size(output_path):
    path = Path(output_path)
    if not path.is_file() or path.stat().st_size == 0:
        raise RuntimeError("Proses tidak menghasilkan berkas yang dapat diunduh.")
    return path.stat().st_size


async def complete_job(db, job_id, document_id, output_path, custom_name=None):
    size = output_size(output_path)
    job, document = await job_records(db, job_id, document_id)
    document = await locked_document(db, document.id, document.user_id)
    document.output_file = str(output_path)
    document.output_size = size
    if custom_name is not None:
        document.custom_name = custom_name
    job.status = document.status = "done"
    job.progress = 100
    job.error = None
    job.finished_at = utc_now()
    document.is_saved = False
    document.stored_size_bytes = 0
    document.expires_at = utc_now() + timedelta(hours=settings.TEMP_FILE_TTL_HOURS)
    if document.save_requested:
        try:
            await save_result(db, document)
        except HTTPException as error:
            if error.status_code != 413:
                raise
            document.storage_notice = "quota_exceeded"
    for path in set([document.original_file, *(document.source_paths or [])]):
        if path and is_storage_file(path) and Path(path).resolve() != Path(output_path).resolve():
            Path(path).unlink(missing_ok=True)
    document.original_file = ""
    document.source_paths = []
    record_document_activity(db, document, "process_finished", system=True)
    await db.commit()


async def fail_job(db, job_id, document_id, error, paths=()):
    # A failed transaction must be rolled back before recording the failure.
    await db.rollback()
    job = await db.get(Job, uuid.UUID(str(job_id)))
    document = await db.get(Document, uuid.UUID(str(document_id)))
    if job and job.document_id == uuid.UUID(str(document_id)):
        job.status = "failed"
        job.error = str(error) or "Proses dokumen gagal."
        job.finished_at = utc_now()
    if document:
        paths = [*paths, document.original_file, document.output_file, *(document.source_paths or [])]
        document.status = "failed"
        document.output_size = None
        document.is_saved = False
        document.stored_size_bytes = 0
        document.original_file = ""
        document.output_file = None
        document.source_paths = []
        document.expires_at = None
        record_document_activity(db, document, "process_finished", outcome="failed", code="PROCESS_FAILED", system=True)
    await db.commit()
    for value in set(paths):
        if value and is_storage_file(value):
            try:
                Path(value).unlink(missing_ok=True)
            except OSError:
                logger.warning("Could not remove failed job file: %s", value)
