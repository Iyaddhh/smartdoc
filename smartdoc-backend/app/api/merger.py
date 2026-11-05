from app.services.document_audit import record_document_activity
from app.api.tool_sources import tool_inputs, single_tool_input
from app.core.limiter import limiter
from typing import Literal
import os
import uuid
import asyncio
from pathlib import Path
from typing import List, Optional
from fastapi import Request, APIRouter, Depends, UploadFile, File, Form, BackgroundTasks, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import get_db, AsyncSessionLocal
from app.models.document import Document
from app.models.job import Job
from app.models.user import User
from app.core.config import settings
from app.core.concurrency import job_semaphore, preview_capacity
from app.core.response import ok_response, fail_response
from app.core.logger import logger
from app.core.validators import (
    validate_and_read_upload,
    validate_image_dimensions, validate_pdf_pages, ALLOWED_MERGE_EXTENSIONS
)
from app.services.merger import merge_documents, insert_document
from app.services.converter import async_convert_office_to_pdf
from app.services.document_jobs import start_job, complete_job, fail_job
from app.core.workers import run_engine
from app.core.security import get_current_user

router = APIRouter(
    prefix="/api/merger",
    tags=["Merger"],
    dependencies=[Depends(get_current_user)],
)


async def _run_merge_job(
    job_id: str,
    document_id: str,
    merge_mode: str,
    input_paths: List[str],
    insert_position: str,
    after_page: int,
    output_path: str,
):
    async with job_semaphore:
        async with AsyncSessionLocal() as db:
            try:
                await start_job(db, job_id, document_id, 30)

                success = False

                async def _do_merge():
                    nonlocal success
                    if merge_mode == "insert" and len(input_paths) >= 2:
                        main_path = input_paths[0]
                        insert_path = input_paths[1]
                        success = await run_engine(
                            insert_document, main_path, insert_path, output_path, insert_position, after_page
                        )
                    else:
                        success = await run_engine(merge_documents, input_paths, output_path)

                await asyncio.wait_for(_do_merge(), timeout=settings.JOB_TIMEOUT_SECONDS)

                if not success or not os.path.exists(output_path):
                    raise RuntimeError("Gagal menggabungkan atau menyisipkan dokumen yang dipilih.")

                await complete_job(db, job_id, document_id, output_path)

                logger.info(f"[job:{job_id}] Penggabungan dokumen sukses -> {output_path}")

            except Exception as e:
                logger.error(f"[job:{job_id}] Penggabungan dokumen gagal: {e}")
                await fail_job(db, job_id, document_id, e, input_paths + [output_path])



@router.post("/info", dependencies=[Depends(preview_capacity)])
@limiter.shared_limit(settings.PREVIEW_RATE_LIMIT, scope="document-preview", override_defaults=False)
async def get_merger_document_info(request: Request, inputs: list[UploadFile] = Depends(tool_inputs)):
    file = single_tool_input(inputs)
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_MERGE_EXTENSIONS:
        return fail_response(f"Format {ext} tidak didukung.", status_code=400)

    content = await validate_and_read_upload(file, ext)
    if ext.lower() in (".jpg", ".jpeg", ".png"):
        validate_image_dimensions(content)

    temp_id = str(uuid.uuid4())
    temp_dir = os.path.join(settings.STORAGE_PATH, "temp")
    os.makedirs(temp_dir, exist_ok=True)
    temp_path = os.path.join(temp_dir, f"{temp_id}{ext}")

    with open(temp_path, "wb") as f:
        f.write(content)

    try:
        working_pdf = temp_path
        temp_pdf_to_clean = None
        if ext in {".docx", ".xlsx", ".pptx"}:
            temp_pdf_to_clean = f"{temp_path}_conv.pdf"
            converted = await async_convert_office_to_pdf(temp_path, temp_pdf_to_clean)
            if not converted or not os.path.isfile(temp_pdf_to_clean):
                raise HTTPException(422, "Dokumen Office tidak dapat dibaca untuk pratinjau.")
            working_pdf = temp_pdf_to_clean

        total_pages = 1
        if ext in {".pdf", ".docx", ".xlsx", ".pptx"}:
            total_pages = await run_engine(validate_pdf_pages, working_pdf)

        return ok_response(
            data={
                "filename": file.filename,
                "total_pages": max(1, total_pages),
                "file_size": len(content),
            },
            message="Informasi berkas berhasil dimuat",
        )
    finally:
        for p in (temp_path, f"{temp_path}_conv.pdf"):
            if os.path.exists(p):
                try:
                    os.remove(p)
                except Exception:
                    pass


@router.post("/process", status_code=202)
@limiter.shared_limit(settings.PROCESS_RATE_LIMIT, scope="document-process", override_defaults=False)
async def merge_files(
    background_tasks: BackgroundTasks,
    request: Request,
    save_to_workspace: bool = Form(False),
    files: List[UploadFile] = Depends(tool_inputs),
    merge_mode: Literal["sequence", "insert"] = Form("sequence", description="'sequence' atau 'insert'"),
    insert_position: Literal["start", "end", "custom"] = Form("end", description="'start', 'end', 'custom'"),
    after_page: int = Form(1, ge=1, description="Nomor halaman setelahnya jika insert_position='custom'"),
    custom_title: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not files or len(files) < 2:
        return fail_response("Harap unggah minimal 2 berkas untuk digabungkan/disisipkan.", status_code=400)
    if len(files) > settings.MAX_UPLOAD_FILES:
        return fail_response("Jumlah berkas melebihi batas pemrosesan.", status_code=400)
    if merge_mode == "insert" and len(files) != 2:
        return fail_response("Mode sisip membutuhkan tepat dua berkas: dokumen utama dan sisipan.", status_code=400)

    original_dir = os.path.join(settings.STORAGE_PATH, "work")
    os.makedirs(original_dir, exist_ok=True)

    input_paths: List[str] = []
    total_input_size = 0

    persisted = False
    try:
        for file in files:
            ext = Path(file.filename).suffix.lower()
            if ext not in ALLOWED_MERGE_EXTENSIONS:
                return fail_response(
                    f"Format {ext} pada berkas '{file.filename}' tidak didukung.",
                    status_code=400
                )

            content = await validate_and_read_upload(file, ext)
            if ext.lower() in (".jpg", ".jpeg", ".png"):
                validate_image_dimensions(content)
            total_input_size += len(content)
            if total_input_size > settings.MAX_TOTAL_UPLOAD_MB * 1024 * 1024:
                return fail_response("Ukuran total berkas melebihi batas pemrosesan.", status_code=413)

            file_id = str(uuid.uuid4())
            file_path = os.path.join(original_dir, f"{file_id}{ext}")
            input_paths.append(file_path)
            with open(file_path, "wb") as f:
                f.write(content)

        # Output path
        output_dir = os.path.join(settings.STORAGE_PATH, "results")
        os.makedirs(output_dir, exist_ok=True)

        doc_id = uuid.uuid4()
        output_filename = f"{doc_id}_merged.pdf"
        output_path = os.path.join(output_dir, output_filename)

        user_name = custom_title.strip() if custom_title and custom_title.strip() else "Dokumen_Gabungan"
        if not user_name.lower().endswith(".pdf"):
            user_name += ".pdf"

        doc = Document(
            id=doc_id,
            user_id=current_user.id,
            feature="merger",
            save_requested=save_to_workspace, is_saved=False, source_paths=input_paths,
            custom_name=user_name,
            original_file=input_paths[0],
            output_file=output_path,
            original_size=total_input_size,
            status="pending",
        )
        db.add(doc)
        await db.flush()

        job = Job(
            id=uuid.uuid4(),
            document_id=doc.id,
            feature="merger",
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
        _run_merge_job,
        str(job.id),
        str(doc.id),
        merge_mode,
        input_paths,
        insert_position,
        after_page,
        output_path,
    )

    logger.info(f"[job:{job.id}] Merge dijadwalkan: {len(files)} berkas -> {user_name}")

    return ok_response(
        data={
            "job_id": str(job.id),
            "document_id": str(doc.id),
            "file_count": len(files),
            "custom_name": user_name,
            "merge_mode": merge_mode,
        },
        message="Job penggabungan dokumen berhasil dijadwalkan",
        status_code=202,
    )
