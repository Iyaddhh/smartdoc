from app.services.document_audit import record_document_activity
from app.api.tool_sources import tool_inputs, single_tool_input
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
from fastapi import Request, HTTPException, APIRouter, Depends, Query, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, func
from app.models.document_audit import DocumentAudit
from starlette.background import BackgroundTask

from app.db.base import get_db
from app.models.document import Document
from app.services.documents import list_owned_documents
from app.services.document_policy import require_document, document_scope, DocumentAction
from app.services.document_storage import download_available, locked_document, remove_files, save_result
from app.models.job import Job
from app.core.storage import is_storage_file
from app.core.config import settings
from app.core.response import ok_response, fail_response
from app.core.logger import logger
from app.core.validators import validate_and_read_upload, validate_image_dimensions, validate_pdf_pages
from app.services.converter import convert_office_to_pdf
from app.services.pdf_rendering import render_pdf_page
from app.core.workers import run_engine
from app.core.security import get_current_user
from app.models.user import User

router = APIRouter(
    prefix="/api/documents",
    tags=["Documents"],
    dependencies=[Depends(get_current_user)],
)


import zipfile

from app.schemas.documents import RenameRequest, BatchRequest


@router.get("")
async def list_documents(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=10, ge=1, le=100),
    feature: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    total_items, docs = await list_owned_documents(
        db, current_user.id, page=page, limit=limit, feature=feature,
        search=search or "", search_original=True,
    )
    total_pages = max(1, math.ceil(total_items / limit))

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
async def generate_first_page_preview(request: Request, inputs: list[UploadFile] = Depends(tool_inputs), page: int = Form(1, ge=1)):
    """
    Menghasilkan thumbnail base64 untuk seluruh halaman dokumen (multi-page preview)
    beserta thumbnail halaman pertama (Hal 1) untuk dokumen apa pun (PDF, DOCX, XLSX, PPTX, Gambar).
    """
    file = single_tool_input(inputs)
    ext = Path(file.filename).suffix.lower()
    content = await validate_and_read_upload(file, ext)

    # 1. Jika gambar, kembalikan langsung sebagai data URL (1 halaman)
    if ext in {".jpg", ".jpeg", ".png"}:
        if page != 1:
            raise HTTPException(422, "Berkas gambar hanya memiliki satu halaman.")
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

    # 2. Office is converted first; PDF pages render with the shared Python engine.
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
        total_pages = await run_engine(validate_pdf_pages, working_pdf)
        if page > total_pages:
            raise HTTPException(422, "Nomor halaman melebihi jumlah halaman dokumen.")

        # Render HANYA halaman pertama untuk thumbnail awal (performa optimal)
        # Gunakan DPI 120 PNG — cukup tajam untuk preview, jauh lebih ringan dari DPI 160
        image = await run_engine(render_pdf_page, working_pdf, page - 1, 120)

        buf = io.BytesIO()
        try:
            image.save(buf, format="PNG", optimize=True)
        finally:
            image.close()
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
    doc = await require_document(db, doc_id, current_user.id, DocumentAction.DOWNLOAD)
    if not doc:
        return fail_response("Dokumen tidak ditemukan", status_code=404)

    if doc.status != "done":
        return fail_response("Hasil belum tersedia. Tunggu hingga proses selesai.", status_code=409)

    file_path = doc.output_file

    if not download_available(doc):
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
    doc = await require_document(db, doc_id, current_user.id, DocumentAction.PREVIEW)
    if not doc:
        return fail_response("Dokumen tidak ditemukan", status_code=404)

    if doc.status != "done":
        return fail_response("Hasil belum tersedia. Tunggu hingga proses selesai.", status_code=409)

    file_path = doc.output_file
    if not download_available(doc):
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


@router.get("/{doc_id}/activity")
async def document_activity(doc_id: uuid.UUID, page: int = Query(1, ge=1),
                            limit: int = Query(25, ge=1, le=100),
                            current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await require_document(db, doc_id, current_user.id)
    filters = (DocumentAudit.document_id == doc_id, DocumentAudit.owner_id == current_user.id)
    total = (await db.execute(select(func.count()).select_from(DocumentAudit).where(*filters))).scalar_one()
    rows = (await db.execute(select(DocumentAudit).where(*filters)
                            .order_by(DocumentAudit.created_at.desc(), DocumentAudit.id.desc())
                            .offset((page - 1) * limit).limit(limit))).scalars().all()
    return ok_response(data={"page": page, "total": total, "limit": limit, "items": [
        {"id": str(row.id), "document_id": str(row.document_id),
         "actor_id": str(row.actor_id) if row.actor_id else None,
         "action": row.action, "outcome": row.outcome, "code": row.code,
         "created_at": row.created_at.isoformat() + "Z"} for row in rows]})


@router.get("/{doc_id}")
async def get_document(
    doc_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    doc = await require_document(db, doc_id, current_user.id)
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
    doc = await require_document(db, doc_id, current_user.id, DocumentAction.UPDATE, lock=True)
    if not doc:
        return fail_response("Dokumen tidak ditemukan", status_code=404)

    if doc.custom_name != body.custom_name:
        record_document_activity(db, doc, "renamed")
    doc.custom_name = body.custom_name
    await db.commit()
    await db.refresh(doc)
    logger.info(f"Dokumen {doc_id} direname menjadi: {body.custom_name}")
    return ok_response(data=_doc_to_dict(doc), message="Nama dokumen berhasil diperbarui")


@router.post("/{doc_id}/save")
async def save_document(doc_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    document = await locked_document(db, doc_id, current_user.id, DocumentAction.SAVE)
    try:
        await save_result(db, document)
    except HTTPException as error:
        if error.status_code == 413:
            await db.commit()  # Persist the allowlisted quota failure event.
        raise
    await db.commit()
    return ok_response(data=_doc_to_dict(document), message="Hasil disimpan ke workspace.")


@router.delete("/{doc_id}")
async def delete_document(doc_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    document = await locked_document(db, doc_id, current_user.id, DocumentAction.DELETE)
    await remove_files(db, document)
    record_document_activity(db, document, "deleted")
    await db.commit()
    return ok_response(message="Berkas dihapus dan kuota dikembalikan. Riwayat aktivitas tetap tersedia.")


@router.post("/batch-delete")
async def batch_delete_documents(body: BatchRequest, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    documents = []
    for document_id in sorted(set(body.ids)):
        document = await locked_document(db, document_id, current_user.id, DocumentAction.DELETE)
        if document.status in {"pending", "processing"}:
            raise HTTPException(409, "Tunggu seluruh proses selesai sebelum menghapus berkas.")
        documents.append(document)
    for document in documents:
        await remove_files(db, document)
        record_document_activity(db, document, "deleted")
    await db.commit()
    return ok_response(data={"deleted_count": len(documents)}, message="Berkas dihapus. Riwayat aktivitas tetap tersedia.")


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
        select(Document).where(Document.id.in_(body.ids), document_scope(current_user.id, DocumentAction.DOWNLOAD), Document.status == "done")
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
                if not download_available(doc):
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
        "is_saved": doc.is_saved,
        "stored_size_bytes": doc.stored_size_bytes,
        "download_available": download_available(doc),
        "expires_at": doc.expires_at.isoformat()+"Z" if doc.expires_at else None,
        "storage_notice": doc.storage_notice,
        "created_at": doc.created_at.isoformat(),
    }
