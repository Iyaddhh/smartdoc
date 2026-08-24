import os
import uuid
import asyncio
from datetime import datetime
from pathlib import Path
from fastapi import APIRouter, Depends, UploadFile, File, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import get_db, AsyncSessionLocal
from app.models.document import Document
from app.models.job import Job
from app.core.config import settings
from app.core.concurrency import job_semaphore
from app.core.response import ok_response
from app.core.logger import logger
from app.core.validators import (
    validate_file_extension, validate_and_read_upload, validate_file_magic_bytes,
    validate_image_dimensions, validate_pdf_pages, ALLOWED_COMPRESSOR_EXTENSIONS
)
from app.services.compressor import (
    async_compress_pdf, compress_jpg, async_compress_png,
    compress_docx, compress_xlsx, compress_pptx
)

router = APIRouter(prefix="/api/compressor", tags=["Compressor"])


async def _run_compress_job(job_id: str, document_id: str, input_path: str, output_path: str, ext: str, quality: int, dpi: int):
    """Background task untuk menjalankan proses kompresi."""
    async with job_semaphore:
        async with AsyncSessionLocal() as db:
            try:
                job = await db.get(Job, uuid.UUID(job_id))
                job.status = "processing"
                job.progress = 25
                job.started_at = datetime.utcnow()
                await db.commit()

                success = False

                async def _do_compression():
                    nonlocal success
                    if ext in (".jpg", ".jpeg"):
                        success = await asyncio.to_thread(compress_jpg, input_path, output_path, quality)
                    elif ext == ".png":
                        success = await async_compress_png(input_path, output_path)
                    elif ext == ".pdf":
                        success = await async_compress_pdf(input_path, output_path, dpi)
                    elif ext == ".docx":
                        success = await asyncio.to_thread(compress_docx, input_path, output_path, quality)
                    elif ext == ".xlsx":
                        success = await asyncio.to_thread(compress_xlsx, input_path, output_path, quality)
                    elif ext == ".pptx":
                        success = await asyncio.to_thread(compress_pptx, input_path, output_path, quality)

                await asyncio.wait_for(_do_compression(), timeout=settings.JOB_TIMEOUT_SECONDS)

                job = await db.get(Job, uuid.UUID(job_id))
                job.status = "done"
                job.progress = 100
                job.finished_at = datetime.utcnow()
                await db.commit()

                doc = await db.get(Document, uuid.UUID(document_id))
                output_size = os.path.getsize(output_path) if os.path.exists(output_path) else None
                doc.output_size = output_size
                doc.status = "done"
                await db.commit()

                logger.info(f"[job:{job_id}] Kompres selesai. Compressed: {success}")

            except Exception as e:
                logger.error(f"[job:{job_id}] Kompresi gagal: {e}")
                job = await db.get(Job, uuid.UUID(job_id))
                if job:
                    job.status = "failed"
                    job.error = str(e)
                    job.finished_at = datetime.utcnow()
                doc = await db.get(Document, uuid.UUID(document_id))
                if doc:
                    doc.status = "failed"
                await db.commit()


@router.post("/process")
async def compress_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    ext = validate_file_extension(file.filename, ALLOWED_COMPRESSOR_EXTENSIONS)
    content = await validate_and_read_upload(file, ext)
    validate_file_magic_bytes(content, ext)
    if ext.lower() in (".jpg", ".jpeg", ".png"):
        validate_image_dimensions(content)

    original_id = str(uuid.uuid4())
    original_dir = os.path.join(settings.STORAGE_PATH, "documents", "originals")
    os.makedirs(original_dir, exist_ok=True)
    original_filename = f"{original_id}{ext}"
    original_path = os.path.join(original_dir, original_filename)

    with open(original_path, "wb") as f:
        f.write(content)

    if ext == ".pdf":
        validate_pdf_pages(original_path)

    output_dir = os.path.join(settings.STORAGE_PATH, "documents", "outputs")
    os.makedirs(output_dir, exist_ok=True)
    output_filename = f"{original_id}_compressed{ext}"
    output_path = os.path.join(output_dir, output_filename)

    doc_id = uuid.uuid4()
    job_id = uuid.uuid4()

    user_stem = Path(file.filename).stem
    custom_output_name = f"{user_stem}_compressed{ext}"

    doc = Document(
        id=doc_id,
        feature="compressor",
        custom_name=custom_output_name,
        original_file=original_path,
        output_file=output_path,
        original_size=len(content),
        status="pending",
    )
    db.add(doc)

    job = Job(
        id=job_id,
        document_id=doc_id,
        feature="compressor",
        status="pending",
        progress=0,
    )
    db.add(job)
    await db.commit()

    background_tasks.add_task(
        _run_compress_job,
        str(job_id),
        str(doc_id),
        original_path,
        output_path,
        ext,
        settings.COMPRESSION_IMAGE_QUALITY,
        settings.COMPRESSION_IMAGE_DPI,
    )

    return ok_response(
        data={
            "job_id": str(job_id),
            "document_id": str(doc_id),
            "original_filename": file.filename,
            "original_size": len(content),
        },
        message="Proses kompresi dijadwalkan.",
        status_code=202,
    )
