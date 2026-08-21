import os
import uuid
import asyncio
import base64
from io import BytesIO
from datetime import datetime
from pathlib import Path
from typing import Optional, List
from fastapi import APIRouter, Depends, UploadFile, File, Form, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import get_db, AsyncSessionLocal
from app.models.document import Document
from app.models.job import Job
from app.core.config import settings
from app.core.response import ok_response, fail_response
from app.core.logger import logger
from app.core.validators import validate_file_size
from app.services.converter import convert_office_to_pdf, pdf_to_word
from app.services.splitter import (
    parse_page_ranges,
    get_pdf_page_count,
    extract_pages_to_pdf,
    split_pdf_by_chunks,
    split_all_single_pages,
)

router = APIRouter(prefix="/api/splitter", tags=["Splitter"])

ALLOWED_SPLIT_EXTENSIONS = {".pdf", ".docx"}


def _generate_thumbnails(pdf_path: str, max_pages: int = 50) -> List[str]:
    """Generates base64 data URL thumbnails for document pages."""
    try:
        from pdf2image import convert_from_path
        pages = convert_from_path(pdf_path, first_page=1, last_page=max_pages, dpi=60)
        thumbs = []
        for page in pages:
            buf = BytesIO()
            page.save(buf, format="JPEG", quality=65)
            b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
            thumbs.append(f"data:image/jpeg;base64,{b64}")
        return thumbs
    except Exception as e:
        logger.warning(f"Thumbnail generation notice: {e}")
        return []


async def _run_split_job(
    job_id: str,
    document_id: str,
    input_path: str,
    is_docx: bool,
    split_mode: str,
    range_expression: Optional[str],
    chunk_size: int,
    output_format: str,
    output_path: str,
    base_name: str,
):
    async with AsyncSessionLocal() as db:
        try:
            job = await db.get(Job, uuid.UUID(job_id))
            job.status = "processing"
            job.progress = 20
            job.started_at = datetime.utcnow()
            await db.commit()

            # 1. Jika file awal adalah docx, konversi dulu ke PDF kerja sementara
            working_pdf = input_path
            temp_pdf_to_clean = None
            if is_docx:
                temp_pdf_to_clean = f"{input_path}_temp.pdf"
                job.progress = 30
                await db.commit()
                conv_ok = await asyncio.to_thread(convert_office_to_pdf, input_path, temp_pdf_to_clean)
                if not conv_ok or not os.path.exists(temp_pdf_to_clean):
                    raise RuntimeError("Gagal mengonversi berkas Word ke PDF untuk pemisahan halaman.")
                working_pdf = temp_pdf_to_clean

            # Hitung total halaman
            total_pages = await asyncio.to_thread(get_pdf_page_count, working_pdf)
            if total_pages == 0:
                raise ValueError("Berkas PDF tidak memiliki halaman yang dapat dibaca.")

            job.progress = 50
            await db.commit()

            # 2. Jalankan pemisahan sesuai mode
            success = False
            temp_output_pdf = output_path
            if output_format == "docx" and split_mode == "extract_range":
                temp_output_pdf = f"{output_path}_temp.pdf"

            if split_mode == "extract_range":
                page_indices = parse_page_ranges(range_expression or "1", total_pages)
                if not page_indices:
                    raise ValueError("Rentang halaman yang dimasukkan tidak valid.")
                success = await asyncio.to_thread(
                    extract_pages_to_pdf, working_pdf, page_indices, temp_output_pdf
                )

                # Jika pengguna menginginkan output DOCX untuk rentang yang diekstrak
                if success and output_format == "docx":
                    job.progress = 75
                    await db.commit()
                    conv_docx_ok = await asyncio.to_thread(pdf_to_word, temp_output_pdf, output_path)
                    if not conv_docx_ok:
                        raise RuntimeError("Gagal mengonversi halaman hasil ekstrak kembali ke format Word (.docx).")
                    if os.path.exists(temp_output_pdf):
                        try:
                            os.remove(temp_output_pdf)
                        except Exception:
                            pass

            elif split_mode == "fixed_interval":
                c_size = max(1, chunk_size)
                success = await asyncio.to_thread(
                    split_pdf_by_chunks, working_pdf, c_size, output_path, base_name
                )

            elif split_mode == "all_single":
                success = await asyncio.to_thread(
                    split_all_single_pages, working_pdf, output_path, base_name
                )
            else:
                raise ValueError(f"Mode split '{split_mode}' tidak dikenali.")

            # Hapus PDF temporary jika dari docx
            if temp_pdf_to_clean and os.path.exists(temp_pdf_to_clean):
                try:
                    os.remove(temp_pdf_to_clean)
                except Exception:
                    pass

            if not success or not os.path.exists(output_path):
                raise RuntimeError("Proses pemisahan dokumen gagal menghasilkan berkas output.")

            # 3. Update database
            doc = await db.get(Document, uuid.UUID(document_id))
            output_size = os.path.getsize(output_path)
            doc.output_size = output_size
            doc.status = "done"

            job.status = "done"
            job.progress = 100
            job.finished_at = datetime.utcnow()
            await db.commit()

            logger.info(f"[job:{job.id}] Pemisahan dokumen berhasil: {output_path}")

        except Exception as e:
            logger.error(f"[job:{job_id}] Pemisahan dokumen gagal: {e}")
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
async def get_document_info(file: UploadFile = File(...)):
    """
    Mengambil informasi berkas (total halaman dan preview thumbnail) sebelum eksekusi split.
    """
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_SPLIT_EXTENSIONS:
        return fail_response(
            f"Format {ext} tidak didukung. Harap unggah berkas .pdf atau .docx",
            status_code=400
        )

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
        if ext == ".docx":
            temp_pdf_to_clean = f"{temp_path}_converted.pdf"
            await asyncio.to_thread(convert_office_to_pdf, temp_path, temp_pdf_to_clean)
            working_pdf = temp_pdf_to_clean

        total_pages = await asyncio.to_thread(get_pdf_page_count, working_pdf)
        thumbnails = await asyncio.to_thread(_generate_thumbnails, working_pdf, 50)

        return ok_response(
            data={
                "filename": file.filename,
                "format": ext.replace(".", "").upper(),
                "total_pages": total_pages,
                "file_size": len(content),
                "thumbnails": thumbnails,
            },
            message="Informasi berkas berhasil dimuat"
        )
    finally:
        # Cleanup temp files
        for p in (temp_path, f"{temp_path}_converted.pdf"):
            if os.path.exists(p):
                try:
                    os.remove(p)
                except Exception:
                    pass


@router.post("/process")
async def split_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    split_mode: str = Form(..., description="'extract_range', 'fixed_interval', 'all_single'"),
    range_expression: Optional[str] = Form(None, description="cth: '1-3, 5, 8-10'"),
    chunk_size: int = Form(1, description="Interval halaman untuk mode fixed_interval"),
    output_format: str = Form("pdf", description="'pdf' atau 'docx'"),
    db: AsyncSession = Depends(get_db),
):
    """
    Endpoint pemrosesan pemisahan berkas PDF / Word.
    """
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_SPLIT_EXTENSIONS:
        return fail_response(
            f"Format {ext} tidak didukung. Harap unggah berkas .pdf atau .docx",
            status_code=400
        )

    content = await file.read()
    validate_file_size(len(content), max_mb=settings.MAX_FILE_SIZE_MB)

    # Simpan file original ke storage
    original_id = str(uuid.uuid4())
    original_dir = os.path.join(settings.STORAGE_PATH, "documents", "originals")
    os.makedirs(original_dir, exist_ok=True)
    original_path = os.path.join(original_dir, f"{original_id}{ext}")

    with open(original_path, "wb") as f:
        f.write(content)

    # Tentukan output path & nama berkas custom
    output_dir = os.path.join(settings.STORAGE_PATH, "documents", "outputs")
    os.makedirs(output_dir, exist_ok=True)

    user_stem = Path(file.filename).stem

    if split_mode == "extract_range":
        out_ext = ".docx" if output_format == "docx" else ".pdf"
        output_filename = f"{original_id}_extracted{out_ext}"
        custom_output_name = f"{user_stem}_extracted{out_ext}"
    else:
        out_ext = ".zip"
        output_filename = f"{original_id}_split.zip"
        custom_output_name = f"{user_stem}_split_parts.zip"

    output_path = os.path.join(output_dir, output_filename)

    # Buat record document
    doc = Document(
        id=uuid.uuid4(),
        feature="splitter",
        custom_name=custom_output_name,
        original_file=original_path,
        output_file=output_path,
        original_size=len(content),
        status="pending",
    )
    db.add(doc)
    await db.flush()

    # Buat record job
    job = Job(
        id=uuid.uuid4(),
        document_id=doc.id,
        feature="splitter",
        status="pending",
        progress=0,
    )
    db.add(job)
    await db.commit()

    # Jadwalkan background task
    background_tasks.add_task(
        _run_split_job,
        str(job.id),
        str(doc.id),
        original_path,
        (ext == ".docx"),
        split_mode,
        range_expression,
        chunk_size,
        output_format,
        output_path,
        user_stem,
    )

    logger.info(f"[job:{job.id}] Pemisahan dijadwalkan: {file.filename} (mode: {split_mode})")

    return ok_response(
        data={
            "job_id": str(job.id),
            "document_id": str(doc.id),
            "original_filename": file.filename,
            "split_mode": split_mode,
        },
        message="Job pemisahan dokumen berhasil dijadwalkan",
        status_code=202,
    )
