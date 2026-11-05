from app.services.document_audit import record_document_activity
from app.api.tool_sources import tool_inputs, single_tool_input
from app.core.limiter import limiter
import uuid
import asyncio
from pathlib import Path
from fastapi import Request, APIRouter, Depends, UploadFile, File, BackgroundTasks, Form
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import get_db, AsyncSessionLocal
from app.models.document import Document
from app.models.job import Job
from app.models.user import User
from app.core.config import settings
from app.core.concurrency import job_semaphore
from app.core.response import ok_response
from app.core.logger import logger
from app.core.validators import (
    validate_file_extension, validate_and_read_upload,
    ALLOWED_COMPRESSOR_EXTENSIONS
)
from app.services.compressor import (
    async_compress_pdf, compress_jpg, async_compress_png,
    compress_docx, compress_xlsx, compress_pptx
)
from app.services.document_jobs import start_job, complete_job, fail_job
from app.core.workers import run_engine, run_sync
from app.core.uploads import stage_pptx_upload
from app.services.compressor.pptx_archive import pptx_staging_path
from app.core.security import get_current_user

router = APIRouter(
    prefix="/api/compressor",
    tags=["Compressor"],
    dependencies=[Depends(get_current_user)],
)


async def _run_compress_job(job_id: str, document_id: str, input_path: str, output_path: str, ext: str, quality: int, dpi: int):
    """Background task untuk menjalankan proses kompresi."""
    async with job_semaphore:
        async with AsyncSessionLocal() as db:
            try:
                await start_job(db, job_id, document_id, 25)

                success = False

                async def _do_compression():
                    nonlocal success
                    if ext in (".jpg", ".jpeg"):
                        success = await run_engine(compress_jpg, input_path, output_path, quality)
                    elif ext == ".png":
                        success = await async_compress_png(input_path, output_path)
                    elif ext == ".pdf":
                        success = await async_compress_pdf(input_path, output_path, dpi)
                    elif ext == ".docx":
                        success = await run_engine(compress_docx, input_path, output_path, quality)
                    elif ext == ".xlsx":
                        success = await run_engine(compress_xlsx, input_path, output_path, quality)
                    elif ext == ".pptx":
                        success = await run_engine(compress_pptx, input_path, output_path, quality)

                await asyncio.wait_for(_do_compression(), timeout=settings.JOB_TIMEOUT_SECONDS)

                await complete_job(db, job_id, document_id, output_path)

                logger.info(f"[job:{job_id}] Kompres selesai. Compressed: {success}")

            except BaseException as e:
                logger.error(f"[job:{job_id}] Kompresi gagal: {e}")
                await fail_job(db, job_id, document_id, e, [input_path, output_path])
                if not isinstance(e, Exception):
                    raise



@router.post("/process", status_code=202)
@limiter.shared_limit(settings.PROCESS_RATE_LIMIT, scope="document-process", override_defaults=False)
async def compress_file(
    background_tasks: BackgroundTasks,
    request: Request,
    save_to_workspace: bool = Form(False),
    inputs: list[UploadFile] = Depends(tool_inputs),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    file = single_tool_input(inputs)
    ext = validate_file_extension(file.filename, ALLOWED_COMPRESSOR_EXTENSIONS)
    original_id = str(uuid.uuid4())
    original_path = Path(settings.STORAGE_PATH) / "work" / f"{original_id}{ext}"
    output_path = Path(settings.STORAGE_PATH) / "results" / f"{original_id}_compressed{ext}"
    doc_id, job_id = uuid.uuid4(), uuid.uuid4()
    try:
        original_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        if ext == ".pptx":
            original_size = await stage_pptx_upload(file, original_path)
        else:
            content = await validate_and_read_upload(file, ext)
            original_size = len(content)
            await run_sync(original_path.write_bytes, content)
            del content
        custom_output_name = f"{Path(file.filename).stem}_compressed{ext}"
        doc = Document(
            id=doc_id, user_id=current_user.id, feature="compressor",
            save_requested=save_to_workspace, is_saved=False,
            source_paths=[str(original_path), *([str(pptx_staging_path(output_path))] if ext == ".pptx" else [])], custom_name=custom_output_name,
            original_file=str(original_path), output_file=str(output_path),
            original_size=original_size, status="pending",
        )
        db.add(doc)
        db.add(Job(id=job_id, document_id=doc_id, feature="compressor", status="pending", progress=0))
        record_document_activity(db, doc, "process_queued")
        await db.commit()
    except BaseException:
        try:
            await db.rollback()
        finally:
            original_path.unlink(missing_ok=True)
            output_path.unlink(missing_ok=True)
        raise

    background_tasks.add_task(
        _run_compress_job,
        str(job_id),
        str(doc_id),
        str(original_path),
        str(output_path),
        ext,
        settings.COMPRESSION_IMAGE_QUALITY,
        settings.COMPRESSION_IMAGE_DPI,
    )

    return ok_response(
        data={
            "job_id": str(job_id),
            "document_id": str(doc_id),
            "original_filename": file.filename,
            "original_size": original_size,
        },
        message="Proses kompresi dijadwalkan.",
        status_code=202,
    )
