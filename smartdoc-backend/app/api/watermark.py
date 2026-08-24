import os
import uuid
import asyncio
from datetime import datetime
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, Depends, UploadFile, File, Form, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import get_db, AsyncSessionLocal
from app.models.document import Document
from app.models.job import Job
from app.core.config import settings
from app.core.concurrency import job_semaphore
from app.core.response import ok_response, fail_response
from app.core.logger import logger
from app.core.validators import validate_and_read_upload, validate_file_magic_bytes
from app.services.watermark import apply_watermark_and_security

router = APIRouter(prefix="/api/watermark", tags=["Watermark"])

ALLOWED_WATERMARK_EXTENSIONS = {".pdf", ".docx"}


async def _run_watermark_job(
    job_id: str,
    document_id: str,
    input_path: str,
    output_path: str,
    is_docx: bool,
    watermark_text: Optional[str],
    opacity: float,
    angle: float,
    font_size: int,
    color_hex: str,
    password: Optional[str],
):
    async with job_semaphore:
        async with AsyncSessionLocal() as db:
            try:
                job = await db.get(Job, uuid.UUID(job_id))
                job.status = "processing"
                job.progress = 35
                job.started_at = datetime.utcnow()
                await db.commit()

                async def _do_watermark():
                    return await asyncio.to_thread(
                        apply_watermark_and_security,
                        input_path,
                        output_path,
                        is_docx,
                        watermark_text,
                        opacity,
                        angle,
                        font_size,
                        color_hex,
                        password,
                    )

                success = await asyncio.wait_for(_do_watermark(), timeout=settings.JOB_TIMEOUT_SECONDS)

                if not success or not os.path.exists(output_path):
                    raise RuntimeError("Gagal memproses watermark atau proteksi kata sandi pada dokumen.")

                output_size = os.path.getsize(output_path)

                doc = await db.get(Document, uuid.UUID(document_id))
                doc.output_size = output_size
                doc.status = "done"

                job = await db.get(Job, uuid.UUID(job_id))
                job.status = "done"
                job.progress = 100
                job.finished_at = datetime.utcnow()
                await db.commit()

                logger.info(f"[job:{job_id}] Watermark/Security selesai -> {output_path}")

            except Exception as e:
                logger.error(f"[job:{job_id}] Watermark/Security error: {e}")
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
async def process_watermark_or_security(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    watermark_text: Optional[str] = Form(None),
    opacity: float = Form(0.25),
    angle: float = Form(45.0),
    font_size: int = Form(44),
    color_hex: str = Form("#64748b"),
    password: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
):
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_WATERMARK_EXTENSIONS:
        return fail_response(
            f"Format {ext} tidak didukung. Harap unggah berkas .pdf atau .docx",
            status_code=400
        )

    content = await validate_and_read_upload(file, ext)
    validate_file_magic_bytes(content, ext)

    original_id = str(uuid.uuid4())
    original_dir = os.path.join(settings.STORAGE_PATH, "documents", "originals")
    os.makedirs(original_dir, exist_ok=True)
    original_path = os.path.join(original_dir, f"{original_id}{ext}")

    with open(original_path, "wb") as f:
        f.write(content)

    output_dir = os.path.join(settings.STORAGE_PATH, "documents", "outputs")
    os.makedirs(output_dir, exist_ok=True)

    user_stem = Path(file.filename).stem
    suffix = "_protected" if (password and not watermark_text) else "_watermarked"
    custom_output_name = f"{user_stem}{suffix}.pdf"
    output_filename = f"{original_id}{suffix}.pdf"
    output_path = os.path.join(output_dir, output_filename)

    doc = Document(
        id=uuid.uuid4(),
        feature="watermark",
        custom_name=custom_output_name,
        original_file=original_path,
        output_file=output_path,
        original_size=len(content),
        status="pending",
    )
    db.add(doc)
    await db.flush()

    job = Job(
        id=uuid.uuid4(),
        document_id=doc.id,
        feature="watermark",
        status="pending",
        progress=0,
    )
    db.add(job)
    await db.commit()

    background_tasks.add_task(
        _run_watermark_job,
        str(job.id),
        str(doc.id),
        original_path,
        output_path,
        (ext == ".docx"),
        watermark_text,
        opacity,
        angle,
        font_size,
        color_hex,
        password,
    )

    logger.info(f"[job:{job.id}] Watermark/Security dijadwalkan: {file.filename} -> {custom_output_name}")

    return ok_response(
        data={
            "job_id": str(job.id),
            "document_id": str(doc.id),
            "original_filename": file.filename,
            "custom_name": custom_output_name,
        },
        message="Job watermark / security berhasil dijadwalkan",
        status_code=202,
    )
