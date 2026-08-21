import os
import uuid
import shutil
import zipfile
import asyncio
from datetime import datetime
from pathlib import Path
from fastapi import APIRouter, Depends, UploadFile, File, Form, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import get_db, AsyncSessionLocal
from app.models.document import Document
from app.models.job import Job
from app.core.config import settings
from app.core.response import ok_response
from app.core.logger import logger
from app.core.validators import (
    validate_file_extension, validate_file_size, validate_pdf_pages,
    ALLOWED_CONVERTER_EXTENSIONS
)
from app.services.converter import (
    convert_office_to_pdf, pdf_to_word, pdf_to_images, images_to_pdf
)

router = APIRouter(prefix="/api/converter", tags=["Converter"])

OFFICE_TO_PDF_EXTS = {".docx", ".xlsx", ".pptx"}
IMAGE_EXTS = {".jpg", ".jpeg", ".png"}


def _detect_output_ext(output_format: str) -> str:
    fmt_map = {
        "pdf": ".pdf",
        "docx": ".docx",
        "jpg": ".jpg",
        "png": ".png",
    }
    return fmt_map.get(output_format.lower(), ".pdf")


async def _run_convert_job(
    job_id: str, document_id: str,
    input_path: str, output_path: str,
    input_ext: str, output_format: str
):
    async with AsyncSessionLocal() as db:
        try:
            job = await db.get(Job, uuid.UUID(job_id))
            job.status = "processing"
            job.progress = 25
            job.started_at = datetime.utcnow()
            await db.commit()

            success = False

            if input_ext in OFFICE_TO_PDF_EXTS and output_format == "pdf":
                success = await asyncio.to_thread(convert_office_to_pdf, input_path, output_path)

            elif input_ext == ".pdf" and output_format == "docx":
                success = await asyncio.to_thread(pdf_to_word, input_path, output_path)

            elif input_ext == ".pdf" and output_format in ("jpg", "png"):
                images_dir = output_path + "_pages"
                pages = await asyncio.to_thread(pdf_to_images, input_path, images_dir, output_format)
                if pages:
                    # Package images into zip for multi-page download
                    zip_path = output_path + ".zip"
                    with zipfile.ZipFile(zip_path, 'w') as zf:
                        for p in pages:
                            zf.write(p, os.path.basename(p))
                    # Set output_path to zip
                    shutil.move(zip_path, output_path)
                    shutil.rmtree(images_dir, ignore_errors=True)
                    success = True

            elif input_ext in IMAGE_EXTS and output_format == "pdf":
                success = await asyncio.to_thread(images_to_pdf, [input_path], output_path)

            job.status = "done" if success else "failed"
            job.progress = 100 if success else job.progress
            job.error = None if success else "Konversi gagal. Cek log untuk detail."
            job.finished_at = datetime.utcnow()
            await db.commit()

            doc = await db.get(Document, uuid.UUID(document_id))
            doc.status = "done" if success else "failed"
            doc.output_size = os.path.getsize(output_path) if success and os.path.exists(output_path) else 0
            await db.commit()

            logger.info(f"[job:{job_id}] Konversi {'berhasil' if success else 'gagal'}")
        except Exception as e:
            logger.error(f"[job:{job_id}] Konversi error: {e}")
            try:
                job = await db.get(Job, uuid.UUID(job_id))
                job.status = "failed"
                job.error = str(e)
                job.finished_at = datetime.utcnow()
                doc = await db.get(Document, uuid.UUID(document_id))
                doc.status = "failed"
                await db.commit()
            except Exception:
                pass


@router.post("/process")
async def convert_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    output_format: str = Form(...),
    db: AsyncSession = Depends(get_db),
):
    input_ext = validate_file_extension(file.filename, ALLOWED_CONVERTER_EXTENSIONS)
    content = await file.read()
    validate_file_size(len(content))

    # Simpan file original
    original_id = str(uuid.uuid4())
    original_dir = os.path.join(settings.STORAGE_PATH, "documents", "originals")
    os.makedirs(original_dir, exist_ok=True)
    original_path = os.path.join(original_dir, f"{original_id}{input_ext}")
    with open(original_path, "wb") as f:
        f.write(content)

    if input_ext == ".pdf":
        validate_pdf_pages(original_path)

    # Tentukan output path
    output_ext = _detect_output_ext(output_format)
    output_dir = os.path.join(settings.STORAGE_PATH, "documents", "outputs")
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, f"{original_id}_converted{output_ext}")

    user_stem = Path(file.filename).stem
    custom_output_name = f"{user_stem}{output_ext}"

    doc = Document(
        id=uuid.uuid4(),
        feature="converter",
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
        feature="converter",
        status="pending",
        progress=0,
    )
    db.add(job)
    await db.commit()

    background_tasks.add_task(
        _run_convert_job,
        str(job.id), str(doc.id),
        original_path, output_path, input_ext, output_format,
    )

    logger.info(f"[job:{job.id}] Konversi dijadwalkan: {file.filename} -> {output_format}")

    return ok_response(
        data={
            "job_id": str(job.id),
            "document_id": str(doc.id),
            "original_filename": file.filename,
            "output_format": output_format,
        },
        message="Job konversi berhasil dijadwalkan",
        status_code=202,
    )
