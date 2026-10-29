from app.core.limiter import limiter
from app.core.concurrency import preview_capacity
import os
import uuid
import base64
import io
import math
import asyncio
from pathlib import Path
from typing import Optional
from datetime import datetime, timezone
from fastapi import Request, HTTPException, APIRouter, Depends, Query, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, delete, func, or_
from starlette.background import BackgroundTask

from app.db.base import get_db
from app.models.document import Document
from app.models.job import Job
from app.core.storage import is_storage_file
from app.core.config import settings
from app.core.response import ok_response, fail_response
from app.core.logger import logger
from app.core.validators import validate_and_read_upload, validate_file_magic_bytes, validate_image_dimensions
from app.services.converter import convert_office_to_pdf
from app.core.security import get_current_user
from app.models.user import User

router = APIRouter(
    prefix="/api/documents",
    tags=["Documents"],
    dependencies=[Depends(get_current_user)],
)


import zipfile

from app.schemas.documents import RenameRequest, BatchRequest


async def _get_user_doc(db: AsyncSession, doc_id: uuid.UUID, user_id: uuid.UUID) -> Optional[Document]:
    """Helper untuk mengambil dokumen yang hanya dimiliki oleh user yang sedang login."""
    stmt = select(Document).where(Document.id == doc_id, Document.user_id == user_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


@router.get("")
async def list_documents(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=10, ge=1, le=100),
    feature: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    base_filters = [Document.user_id == current_user.id, Document.feature != "ocr"]
    if feature:
        base_filters.append(Document.feature == feature)
    if search and search.strip():
        term = f"%{search.strip()}%"
        base_filters.append(or_(Document.custom_name.ilike(term), Document.original_file.ilike(term)))

    # 1. Total hitung dokumen untuk pagination
    count_stmt = select(func.count(Document.id)).where(*base_filters)
    total_res = await db.execute(count_stmt)
    total_items = total_res.scalar() or 0
    total_pages = math.ceil(total_items / limit) if total_items > 0 else 1

    # 2. Ambil dokumen dengan offset & limit
    stmt = select(Document).where(*base_filters).order_by(desc(Document.created_at))
    stmt = stmt.offset((page - 1) * limit).limit(limit)
    result = await db.execute(stmt)
    docs = result.scalars().all()

    return ok_response(
        data={
            "page": page,
            "limit": limit,
            "total_items": total_items,
            "total_pages": total_pages,
            "items": [_doc_to_dict(d) for d in docs],
        },
        message=f"{len(docs)} dokumen ditemukan"
    )


@router.post("/first-page-preview", dependencies=[Depends(preview_capacity)])
@limiter.shared_limit(settings.PREVIEW_RATE_LIMIT, scope="document-preview", override_defaults=False)
async def generate_first_page_preview(request: Request, file: UploadFile = File(...)):
    """
    Menghasilkan thumbnail base64 untuk seluruh halaman dokumen (multi-page preview)
    beserta thumbnail halaman pertama (Hal 1) untuk dokumen apa pun (PDF, DOCX, XLSX, PPTX, Gambar).
    """
    ext = Path(file.filename).suffix.lower()
    content = await validate_and_read_upload(file, ext)

    # 1. Jika gambar, kembalikan langsung sebagai data URL (1 halaman)
    if ext in {".jpg", ".jpeg", ".png"}:
        validate_image_dimensions(content)
        mime = "image/png" if ext == ".png" else "image/jpeg"
        b64 = base64.b64encode(content).decode("utf-8")
        data_url = f"data:{mime};base64,{b64}"
        return ok_response(
            data={
                "thumbnail": data_url,
                "thumbnails": [data_url],
                "total_pages": 1,
                "filename": file.filename,
            },
            message="Pratinjau gambar berhasil dimuat"
        )

    # 2. Jika dokumen (PDF / Office), render halaman menggunakan Poppler / LibreOffice
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

        if not os.path.exists(working_pdf):
            return fail_response("Gagal membaca dokumen untuk pratinjau.", status_code=400)

        # Ambil total halaman terlebih dahulu menggunakan pypdf (ringan)
        from pypdf import PdfReader
        try:
            reader = PdfReader(working_pdf)
            total_pages = len(reader.pages)
        except Exception:
            total_pages = 1

        # Render HANYA halaman pertama untuk thumbnail awal (performa optimal)
        # Gunakan DPI 120 PNG — cukup tajam untuk preview, jauh lebih ringan dari DPI 160
        from pdf2image import convert_from_path
        pages = await asyncio.to_thread(
            convert_from_path, working_pdf, dpi=120, first_page=1, last_page=1, timeout=settings.JOB_TIMEOUT_SECONDS
        )
        if not pages:
            return fail_response("Dokumen tidak memiliki halaman yang dapat dirender.", status_code=400)

        buf = io.BytesIO()
        pages[0].save(buf, format="PNG", optimize=True)
        try:
            pages[0].close()
        except Exception:
            pass
        thumbnail_b64 = f"data:image/png;base64,{base64.b64encode(buf.getvalue()).decode('utf-8')}"

        return ok_response(
            data={
                "thumbnail": thumbnail_b64,
                "thumbnails": [thumbnail_b64],
                "total_pages": total_pages,
                "filename": file.filename,
            },
            message=f"Pratinjau halaman pertama berhasil dimuat (total {total_pages} halaman)"
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"Gagal merender pratinjau untuk {file.filename}: {e}")
        return fail_response(f"Gagal merender pratinjau: {str(e)}", status_code=500)
    finally:
        for p in (temp_path, f"{temp_path}_conv.pdf"):
            if os.path.exists(p):
                try:
                    os.remove(p)
                except Exception:
                    pass


@router.get("/{doc_id}/download")
async def download_document(
    doc_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    doc = await _get_user_doc(db, doc_id, current_user.id)
    if not doc:
        return fail_response("Dokumen tidak ditemukan", status_code=404)

    file_path = doc.output_file

    if not file_path or not os.path.exists(file_path):
        return fail_response("File output tidak ditemukan", status_code=404)

    # 🔒 Path traversal guard: pastikan file berada di dalam STORAGE_PATH
    real_file_path = os.path.realpath(file_path)
    if not is_storage_file(real_file_path):
        logger.warning(f"Path traversal attempt blocked: {file_path}")
        return fail_response("Akses file tidak diizinkan.", status_code=403)

    download_name = doc.custom_name or os.path.basename(file_path)
    return FileResponse(
        path=real_file_path,
        filename=download_name,
        media_type="application/octet-stream"
    )


@router.get("/{doc_id}/preview")
async def preview_document(
    doc_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    doc = await _get_user_doc(db, doc_id, current_user.id)
    if not doc:
        return fail_response("Dokumen tidak ditemukan", status_code=404)

    file_path = doc.output_file
    if not file_path or not os.path.exists(file_path):
        return fail_response("Berkas pratinjau tidak ditemukan", status_code=404)

    # 🔒 Path traversal guard
    real_file_path = os.path.realpath(file_path)
    if not is_storage_file(real_file_path):
        logger.warning(f"Path traversal attempt blocked: {file_path}")
        return fail_response("Akses file tidak diizinkan.", status_code=403)

    ext = Path(real_file_path).suffix.lower()
    media_map = {
        ".pdf": "application/pdf",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
    }
    media_type = media_map.get(ext, "application/octet-stream")

    return FileResponse(
        path=real_file_path,
        media_type=media_type,
        content_disposition_type="inline",
    )


@router.get("/{doc_id}")
async def get_document(
    doc_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    doc = await _get_user_doc(db, doc_id, current_user.id)
    if not doc:
        return fail_response("Dokumen tidak ditemukan", status_code=404)
    return ok_response(data=_doc_to_dict(doc), message="Detail dokumen berhasil diambil")


@router.patch("/{doc_id}")
async def rename_document(
    doc_id: uuid.UUID,
    body: RenameRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    doc = await _get_user_doc(db, doc_id, current_user.id)
    if not doc:
        return fail_response("Dokumen tidak ditemukan", status_code=404)

    doc.custom_name = body.custom_name
    await db.commit()
    await db.refresh(doc)
    logger.info(f"Dokumen {doc_id} direname menjadi: {body.custom_name}")
    return ok_response(data=_doc_to_dict(doc), message="Nama dokumen berhasil diperbarui")


@router.delete("/{doc_id}")
async def delete_document(
    doc_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        doc = await _get_user_doc(db, doc_id, current_user.id)
        if not doc:
            return fail_response("Dokumen tidak ditemukan", status_code=404)

        for attr in ("original_file", "output_file"):
            path = getattr(doc, attr, None)
            if path and os.path.exists(path):
                try:
                    os.remove(path)
                    logger.info(f"File dihapus: {path}")
                except Exception as e:
                    logger.warning(f"Gagal hapus file {path}: {e}")

        await db.execute(delete(Job).where(Job.document_id == doc_id))
        await db.delete(doc)
        await db.commit()
        logger.info(f"Document {doc_id} berhasil dihapus")

        return ok_response(message="Dokumen berhasil dihapus")
    except Exception as e:
        logger.error(f"Error saat menghapus dokumen {doc_id}: {e}")
        await db.rollback()
        return fail_response(f"Gagal menghapus dokumen: {str(e)}", status_code=500)


@router.post("/batch-delete")
async def batch_delete_documents(
    body: BatchRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not body.ids:
        return fail_response("Tidak ada dokumen yang dipilih", status_code=400)

    try:
        # Ambil semua dokumen dalam 1 query milik user ini (menghindari N+1 & isolasi user)
        result = await db.execute(
            select(Document).where(Document.id.in_(body.ids), Document.user_id == current_user.id)
        )
        docs = result.scalars().all()

        deleted_count = 0
        doc_ids_found = []
        for doc in docs:
            for attr in ("original_file", "output_file"):
                path = getattr(doc, attr, None)
                if path and os.path.exists(path):
                    try:
                        os.remove(path)
                        logger.info(f"File dihapus: {path}")
                    except Exception as e:
                        logger.warning(f"Gagal hapus file {path}: {e}")
            doc_ids_found.append(doc.id)
            await db.delete(doc)
            deleted_count += 1

        # Hapus semua jobs terkait dalam 1 query
        if doc_ids_found:
            await db.execute(delete(Job).where(Job.document_id.in_(doc_ids_found)))

        await db.commit()
        logger.info(f"{deleted_count} dokumen milik {current_user.username} berhasil dihapus secara batch")
        return ok_response(data={"deleted_count": deleted_count}, message=f"{deleted_count} dokumen berhasil dihapus")
    except Exception as e:
        logger.error(f"Batch delete error: {e}")
        await db.rollback()
        return fail_response(f"Gagal menghapus dokumen secara massal: {str(e)}", status_code=500)


@router.post("/batch-download")
async def batch_download_documents(
    body: BatchRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not body.ids:
        return fail_response("Tidak ada dokumen yang dipilih", status_code=400)

    # Ambil dokumen sekaligus dalam 1 query (eliminasi N+1 & pastikan kepemilikan user)
    result = await db.execute(
        select(Document).where(Document.id.in_(body.ids), Document.user_id == current_user.id)
    )
    docs = result.scalars().all()

    if not docs:
        return fail_response("Tidak ada dokumen yang valid untuk diunduh", status_code=404)

    temp_zip_id = str(uuid.uuid4())
    temp_dir = os.path.join(settings.STORAGE_PATH, "temp")
    os.makedirs(temp_dir, exist_ok=True)
    temp_zip_path = os.path.join(temp_dir, f"batch_download_{temp_zip_id}.zip")

    def _build_zip_archive() -> int:
        added = 0
        used_names: set[str] = set()
        with zipfile.ZipFile(temp_zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for doc in docs:
                file_path = doc.output_file
                if not file_path or not is_storage_file(file_path) or not os.path.exists(file_path):
                    continue

                base_name = doc.custom_name or os.path.basename(file_path)
                stem, ext = os.path.splitext(base_name)
                final_name = base_name
                counter = 1
                while final_name in used_names:
                    final_name = f"{stem} ({counter}){ext}"
                    counter += 1

                used_names.add(final_name)
                zf.write(file_path, final_name)
                added += 1
        return added

    # Jalankan penulisan ZIP secara asinkron di worker thread agar tidak memblokir event loop
    added_files = await asyncio.to_thread(_build_zip_archive)

    if added_files == 0:
        if os.path.exists(temp_zip_path):
            os.remove(temp_zip_path)
        return fail_response("Tidak ada berkas hasil yang valid untuk diunduh", status_code=404)

    return FileResponse(
        path=temp_zip_path,
        filename="smartdoc_batch_download.zip",
        media_type="application/zip",
        background=BackgroundTask(os.remove, temp_zip_path),
    )



def _doc_to_dict(doc: Document) -> dict:
    return {
        "id": str(doc.id),
        "feature": doc.feature,
        "custom_name": doc.custom_name,
        "original_file": os.path.basename(doc.original_file) if doc.original_file else None,
        "output_file": os.path.basename(doc.output_file) if doc.output_file else None,
        "original_size": doc.original_size,
        "output_size": doc.output_size,
        "status": doc.status,
        "created_at": doc.created_at.isoformat(),
    }
