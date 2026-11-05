from app.services.document_audit import record_document_activity
from app.api.tool_sources import tool_inputs, single_tool_input
from app.core.limiter import limiter
import os
import uuid
import asyncio
from pathlib import Path
from typing import Optional
from fastapi import Request, APIRouter, Depends, UploadFile, File, Form, BackgroundTasks, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import get_db, AsyncSessionLocal
from app.models.document import Document
from app.models.job import Job
from app.models.user import User
from app.core.config import settings
from app.core.concurrency import job_semaphore
from app.core.response import ok_response, fail_response
from app.core.logger import logger
from app.core.validators import validate_and_read_upload
from app.services.watermark import apply_watermark_and_security
from app.services.document_jobs import start_job, complete_job, fail_job
from app.core.workers import run_engine
from app.core.security import get_current_user

router = APIRouter(
    prefix="/api/watermark",
    tags=["Watermark"],
    dependencies=[Depends(get_current_user)],
)

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
                await start_job(db, job_id, document_id, 35)

                async def _do_watermark():
                    return await run_engine(
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

                await complete_job(db, job_id, document_id, output_path)

                logger.info(f"[job:{job_id}] Watermark/Security selesai -> {output_path}")

            except Exception as e:
                logger.error(f"[job:{job_id}] Watermark/Security error: {e}")
                await fail_job(db, job_id, document_id, e, [input_path, output_path])



@router.post("/process", status_code=202)
@limiter.shared_limit(settings.PROCESS_RATE_LIMIT, scope="document-process", override_defaults=False)
async def process_watermark_or_security(
    background_tasks: BackgroundTasks,
    request: Request,
    save_to_workspace: bool = Form(False),
    inputs: list[UploadFile] = Depends(tool_inputs),
    watermark_text: Optional[str] = Form(None, max_length=200),
    opacity: float = Form(0.25, ge=0, le=1),
    angle: float = Form(45.0),
    font_size: int = Form(44, ge=1, le=300),
    color_hex: str = Form("#64748b", pattern=r"^#[0-9a-fA-F]{6}$"),
    password: Optional[str] = Form(None, max_length=128),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    file = single_tool_input(inputs)
    if not (watermark_text and watermark_text.strip()) and not password:
        raise HTTPException(422, "Isi teks watermark atau kata sandi.")
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_WATERMARK_EXTENSIONS:
        return fail_response(
            f"Format {ext} tidak didukung. Harap unggah berkas .pdf atau .docx",
            status_code=400
        )

    content = await validate_and_read_upload(file, ext)

    original_id = str(uuid.uuid4())
    original_dir = os.path.join(settings.STORAGE_PATH, "work")
    os.makedirs(original_dir, exist_ok=True)
    original_path = os.path.join(original_dir, f"{original_id}{ext}")

    with open(original_path, "wb") as f:
        f.write(content)

    output_dir = os.path.join(settings.STORAGE_PATH, "results")
    os.makedirs(output_dir, exist_ok=True)

    user_stem = Path(file.filename).stem
    suffix = "_protected" if (password and not watermark_text) else "_watermarked"
    custom_output_name = f"{user_stem}{suffix}.pdf"
    output_filename = f"{original_id}{suffix}.pdf"
    output_path = os.path.join(output_dir, output_filename)

    doc = Document(
        id=uuid.uuid4(),
        user_id=current_user.id,
        feature="watermark",
        save_requested=save_to_workspace, is_saved=False, source_paths=[original_path],
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
    record_document_activity(db, doc, "process_queued")
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
