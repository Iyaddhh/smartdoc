import os
import uuid
import asyncio
from datetime import datetime
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, Depends, UploadFile, File, Form, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import get_db, AsyncSessionLocal
from app.models.document import Document
from app.models.job import Job
from app.core.config import settings
from app.core.response import ok_response, fail_response
from app.core.logger import logger
from app.core.validators import validate_file_size
from app.services.merger import merge_documents, insert_document
from app.services.splitter import get_pdf_page_count
from app.services.converter import convert_office_to_pdf

router = APIRouter(prefix="/api/merger", tags=["Merger"])

ALLOWED_MERGE_EXTENSIONS = {".pdf", ".docx", ".xlsx", ".pptx", ".jpg", ".jpeg", ".png"}


async def _run_merge_job(
    job_id: str,
    document_id: str,
    merge_mode: str,
    input_paths: List[str],
    insert_position: str,
    after_page: int,
    output_path: str,
):
    async with AsyncSessionLocal() as db:
        try:
            job = await db.get(Job, uuid.UUID(job_id))
            job.status = "processing"
            job.progress = 30
            job.started_at = datetime.utcnow()
            await db.commit()

            if merge_mode == "insert" and len(input_paths) >= 2:
                # Mode penyisipan ke dokumen utama
                main_path = input_paths[0]
                insert_path = input_paths[1]
                success = await asyncio.to_thread(
                    insert_document, main_path, insert_path, output_path, insert_position, after_page
                )
            else:
                # Mode penggabungan sekuensial multi-file
                success = await asyncio.to_thread(merge_documents, input_paths, output_path)

            if not success or not os.path.exists(output_path):
                raise RuntimeError("Gagal menggabungkan atau menyisipkan dokumen yang dipilih.")

            output_size = os.path.getsize(output_path)

            doc = await db.get(Document, uuid.UUID(document_id))
            doc.output_size = output_size
            doc.status = "done"

            job.status = "done"
            job.progress = 100
            job.finished_at = datetime.utcnow()
            await db.commit()

            logger.info(f"[job:{job_id}] Penggabungan dokumen sukses -> {output_path}")

        except Exception as e:
            logger.error(f"[job:{job_id}] Penggabungan dokumen gagal: {e}")
            job = await db.get(Job, uuid.UUID(job_id))
            if job:
                job.status = "failed"
                job.error = str(e)
                job.finished_at = datetime.utcnow()
            doc = await db.get(Document, uuid.UUID(document_id))
            if doc:
                doc.status = "failed"
            await db.commit()


@router.post("/info")
async def get_merger_document_info(file: UploadFile = File(...)):
    """
    Mengambil informasi jumlah halaman dokumen utama untuk membantu konfigurasi penyisipan custom.
    """
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_MERGE_EXTENSIONS:
        return fail_response(f"Format {ext} tidak didukung.", status_code=400)

    content = await file.read()
    validate_file_size(len(content), max_mb=settings.MAX_FILE_SIZE_MB)

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
            await asyncio.to_thread(convert_office_to_pdf, temp_path, temp_pdf_to_clean)
            working_pdf = temp_pdf_to_clean

        total_pages = 1
        if ext in {".pdf", ".docx", ".xlsx", ".pptx"}:
            total_pages = await asyncio.to_thread(get_pdf_page_count, working_pdf)

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


@router.post("/process")
async def merge_files(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    merge_mode: str = Form("sequence", description="'sequence' atau 'insert'"),
    insert_position: str = Form("end", description="'start', 'end', 'custom'"),
    after_page: int = Form(1, description="Nomor halaman setelahnya jika insert_position='custom'"),
    custom_title: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
):
    """
    Menggabungkan beberapa berkas atau menyisipkan dokumen ke posisi tertentu (awal, akhir, custom).
    """
    if not files or len(files) < 2:
        return fail_response("Harap unggah minimal 2 berkas untuk digabungkan/disisipkan.", status_code=400)

    original_dir = os.path.join(settings.STORAGE_PATH, "documents", "originals")
    os.makedirs(original_dir, exist_ok=True)

    input_paths: List[str] = []
    total_input_size = 0

    for file in files:
        ext = Path(file.filename).suffix.lower()
        if ext not in ALLOWED_MERGE_EXTENSIONS:
            return fail_response(
                f"Format {ext} pada berkas '{file.filename}' tidak didukung.",
                status_code=400
            )

        content = await file.read()
        validate_file_size(len(content), max_mb=settings.MAX_FILE_SIZE_MB)
        total_input_size += len(content)

        file_id = str(uuid.uuid4())
        file_path = os.path.join(original_dir, f"{file_id}{ext}")
        with open(file_path, "wb") as f:
            f.write(content)
        input_paths.append(file_path)

    # Output path
    output_dir = os.path.join(settings.STORAGE_PATH, "documents", "outputs")
    os.makedirs(output_dir, exist_ok=True)

    doc_id = uuid.uuid4()
    output_filename = f"{doc_id}_merged.pdf"
    output_path = os.path.join(output_dir, output_filename)

    user_name = custom_title.strip() if custom_title and custom_title.strip() else "Dokumen_Gabungan"
    if not user_name.lower().endswith(".pdf"):
        user_name += ".pdf"

    # Simpan record document
    doc = Document(
        id=doc_id,
        feature="merger",
        custom_name=user_name,
        original_file=input_paths[0],  # Primary reference
        output_file=output_path,
        original_size=total_input_size,
        status="pending",
    )
    db.add(doc)
    await db.flush()

    # Buat job
    job = Job(
        id=uuid.uuid4(),
        document_id=doc.id,
        feature="merger",
        status="pending",
        progress=0,
    )
    db.add(job)
    await db.commit()

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

    logger.info(f"[job:{job.id}] Merge dijadwalkan: {len(files)} berkas (mode: {merge_mode}, pos: {insert_position}) -> {user_name}")

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
