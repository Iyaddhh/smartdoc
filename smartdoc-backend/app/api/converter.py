from app.services.document_audit import record_document_activity
from app.api.tool_sources import tool_inputs, single_tool_input
from app.core.limiter import limiter
import os
import uuid
import shutil
import zipfile
import asyncio
from pathlib import Path
from fastapi import Request, APIRouter, Depends, UploadFile, File, Form, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import get_db, AsyncSessionLocal
from app.models.document import Document
from app.models.job import Job
from app.models.user import User
from app.core.config import settings
from app.core.concurrency import job_semaphore
from app.core.response import ok_response, fail_response
from app.core.logger import logger
from app.core.validators import (
    validate_file_extension, validate_and_read_upload,
    validate_image_dimensions, validate_pdf_pages, ALLOWED_CONVERTER_EXTENSIONS
)
from app.services.converter import (
    async_convert_office_to_pdf, pdf_to_word, pdf_to_images, images_to_pdf
)
from app.services.document_jobs import start_job, complete_job, fail_job
from app.core.workers import run_engine
from app.core.security import get_current_user

router = APIRouter(
    prefix="/api/converter",
    tags=["Converter"],
    dependencies=[Depends(get_current_user)],
)

from typing import List, Optional

OFFICE_TO_PDF_EXTS = {".docx", ".xlsx", ".pptx"}
IMAGE_EXTS = {".jpg", ".jpeg", ".png"}


def _detect_output_ext(output_format: str) -> str:
    fmt_map = {
        "pdf": ".pdf",
        "docx": ".docx",
        "doc": ".docx",
        "jpg": ".jpg",
        "jpeg": ".jpg",
        "png": ".png",
        "xlsx": ".xlsx",
        "pptx": ".pptx",
    }
    return fmt_map.get(output_format.lower(), ".pdf")


async def _run_convert_job(
    job_id: str, document_id: str,
    input_paths: list[str], output_path: str,
    input_ext: str, output_format: str
):
    async with job_semaphore:
        async with AsyncSessionLocal() as db:
            final_output_path = output_path
            try:
                await start_job(db, job_id, document_id, 25)

                success = False
                final_custom_name = None

                async def _do_conversion():
                    nonlocal success, final_output_path, final_custom_name
                    # Multi-image or single-image to PDF
                    if all(Path(p).suffix.lower() in IMAGE_EXTS for p in input_paths) and output_format == "pdf":
                        success = await run_engine(images_to_pdf, input_paths, output_path)

                    elif input_ext in OFFICE_TO_PDF_EXTS and output_format == "pdf":
                        success = await async_convert_office_to_pdf(input_paths[0], output_path)

                    elif input_ext == ".pdf" and output_format == "docx":
                        success = await run_engine(pdf_to_word, input_paths[0], output_path)

                    elif input_ext == ".pdf" and output_format.lower() in ("jpg", "jpeg", "png"):
                        images_dir = output_path + "_pages"
                        fmt_norm = "jpg" if output_format.lower() in ("jpg", "jpeg") else "png"
                        pages = await run_engine(pdf_to_images, input_paths[0], images_dir, fmt_norm)
                        if pages:
                            doc = await db.get(Document, uuid.UUID(document_id))
                            user_stem = Path(doc.custom_name).stem if (doc and doc.custom_name) else Path(input_paths[0]).stem

                            if len(pages) == 1:
                                single_img_path = f"{os.path.splitext(output_path)[0]}.{fmt_norm}"
                                shutil.move(pages[0], single_img_path)
                                shutil.rmtree(images_dir, ignore_errors=True)
                                final_output_path = single_img_path
                                final_custom_name = f"{user_stem}.{fmt_norm}"
                                success = True
                            else:
                                base_output = os.path.splitext(output_path)[0]
                                zip_output_path = f"{base_output}.zip"
                                with zipfile.ZipFile(zip_output_path, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
                                    for p in pages:
                                        zf.write(p, os.path.basename(p))
                                shutil.rmtree(images_dir, ignore_errors=True)
                                final_output_path = zip_output_path
                                final_custom_name = f"{user_stem}.zip"
                                success = True

                await asyncio.wait_for(_do_conversion(), timeout=settings.JOB_TIMEOUT_SECONDS)

                if not success:
                    raise RuntimeError("Konversi gagal. Periksa format dan isi dokumen.")
                await complete_job(db, job_id, document_id, final_output_path, final_custom_name)

                logger.info(f"[job:{job_id}] Konversi {'berhasil' if success else 'gagal'}: {final_output_path}")
            except Exception as e:
                logger.error(f"[job:{job_id}] Konversi error: {e}")
                await fail_job(db, job_id, document_id, e, input_paths + [output_path, final_output_path])



@router.post("/process", status_code=202)
@limiter.shared_limit(settings.PROCESS_RATE_LIMIT, scope="document-process", override_defaults=False)
async def convert_file(
    background_tasks: BackgroundTasks,
    request: Request,
    save_to_workspace: bool = Form(False),
    inputs: List[UploadFile] = Depends(tool_inputs),
    output_format: str = Form(...),
    custom_title: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    upload_list = [upload for upload in inputs if upload.filename]

    if not upload_list:
        return fail_response("Harap pilih setidaknya satu berkas untuk dikonversi.", status_code=400)

    output_format = output_format.lower()
    output_format = {"jpeg": "jpg", "doc": "docx"}.get(output_format, output_format)
    for upload in upload_list:
        ext = validate_file_extension(upload.filename, ALLOWED_CONVERTER_EXTENSIONS)
        allowed = {"docx", "jpg", "png"} if ext == ".pdf" else {"pdf"}
        if output_format not in allowed:
            return fail_response(f"Konversi {ext} ke {output_format} tidak didukung.", status_code=400)

    # Validasi multi-file
    if len(upload_list) > 1:
        if len(upload_list) > min(settings.MAX_PDF_PAGES, settings.MAX_UPLOAD_FILES):
            return fail_response(
                f"Jumlah berkas gambar yang dipilih ({len(upload_list)}) melebihi batas maksimum {min(settings.MAX_PDF_PAGES, settings.MAX_UPLOAD_FILES)} gambar.",
                status_code=400
            )

        # Multi-file hanya diizinkan untuk gambar (JPG / JPEG / PNG) dengan target PDF
        for f in upload_list:
            ext = validate_file_extension(f.filename, ALLOWED_CONVERTER_EXTENSIONS)
            if ext.lower() not in IMAGE_EXTS:
                return fail_response(
                    f"Konversi banyak berkas sekaligus hanya didukung untuk gambar (.jpg, .jpeg, .png). Berkas '{f.filename}' bukan gambar.",
                    status_code=400
                )
        if output_format.lower() != "pdf":
            return fail_response("Format output untuk penggabungan banyak gambar harus berupa PDF.", status_code=400)

    original_dir = os.path.join(settings.STORAGE_PATH, "work")
    os.makedirs(original_dir, exist_ok=True)

    input_paths: List[str] = []
    total_size = 0

    persisted = False
    try:
        for f in upload_list:
            input_ext = validate_file_extension(f.filename, ALLOWED_CONVERTER_EXTENSIONS)
            content = await validate_and_read_upload(f, input_ext)
            if input_ext.lower() in IMAGE_EXTS:
                validate_image_dimensions(content)

            total_size += len(content)
            if total_size > settings.MAX_TOTAL_UPLOAD_MB * 1024 * 1024:
                return fail_response("Ukuran total berkas melebihi batas pemrosesan.", status_code=413)

            original_id = str(uuid.uuid4())
            original_path = os.path.join(original_dir, f"{original_id}{input_ext}")
            input_paths.append(original_path)
            with open(original_path, "wb") as out_f:
                out_f.write(content)

            if input_ext == ".pdf":
                validate_pdf_pages(original_path)


        # Output path
        output_ext = _detect_output_ext(output_format)
        output_dir = os.path.join(settings.STORAGE_PATH, "results")
        os.makedirs(output_dir, exist_ok=True)
        doc_id = uuid.uuid4()
        output_path = os.path.join(output_dir, f"{doc_id}_converted{output_ext}")

        if len(upload_list) > 1:
            if custom_title and custom_title.strip():
                user_stem = custom_title.strip()
            else:
                first_stem = Path(upload_list[0].filename).stem
                user_stem = f"{first_stem}_gabungan"
        else:
            user_stem = Path(upload_list[0].filename).stem

        custom_output_name = f"{user_stem}{output_ext}"
        first_ext = Path(upload_list[0].filename).suffix.lower()

        doc = Document(
            id=doc_id,
            user_id=current_user.id,
            feature="converter",
            save_requested=save_to_workspace, is_saved=False, source_paths=input_paths,
            custom_name=custom_output_name,
            original_file=input_paths[0],
            output_file=output_path,
            original_size=total_size,
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
        record_document_activity(db, doc, "process_queued")
        await db.commit()
        persisted = True
    finally:
        if not persisted:
            for path in input_paths:
                Path(path).unlink(missing_ok=True)

    background_tasks.add_task(
        _run_convert_job,
        str(job.id), str(doc.id),
        input_paths, output_path, first_ext, output_format,
    )

    logger.info(f"[job:{job.id}] Konversi dijadwalkan: {len(upload_list)} berkas -> {output_format}")

    return ok_response(
        data={
            "job_id": str(job.id),
            "document_id": str(doc.id),
            "original_filename": upload_list[0].filename,
            "file_count": len(upload_list),
            "output_format": output_format,
        },
        message="Job konversi berhasil dijadwalkan",
        status_code=202,
    )
