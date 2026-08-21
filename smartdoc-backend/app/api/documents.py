import os
import uuid
import base64
import io
import asyncio
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, Depends, Query, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, delete
from pydantic import BaseModel

from app.db.base import get_db
from app.models.document import Document
from app.models.job import Job
from app.core.config import settings
from app.core.response import ok_response, fail_response
from app.core.logger import logger
from app.services.converter import convert_office_to_pdf

router = APIRouter(prefix="/api/documents", tags=["Documents"])


class RenameRequest(BaseModel):
    custom_name: str


@router.get("")
async def list_documents(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    feature: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Document).order_by(desc(Document.created_at))
    if feature:
        stmt = stmt.where(Document.feature == feature)
    stmt = stmt.offset((page - 1) * limit).limit(limit)
    result = await db.execute(stmt)
    docs = result.scalars().all()

    return ok_response(
        data={
            "page": page,
            "limit": limit,
            "items": [_doc_to_dict(d) for d in docs],
        },
        message=f"{len(docs)} dokumen ditemukan"
    )


@router.post("/first-page-preview")
async def generate_first_page_preview(file: UploadFile = File(...)):
    """
    Menghasilkan thumbnail base64 untuk seluruh halaman dokumen (multi-page preview)
    beserta thumbnail halaman pertama (Hal 1) untuk dokumen apa pun (PDF, DOCX, XLSX, PPTX, Gambar).
    """
    ext = Path(file.filename).suffix.lower()
    content = await file.read()

    # 1. Jika gambar, kembalikan langsung sebagai data URL (1 halaman)
    if ext in {".jpg", ".jpeg", ".png", ".webp"}:
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

        from pdf2image import convert_from_path
        # Render pages at 160 DPI in lossless PNG format for 100% crystal-clear, sharp text
        pages = await asyncio.to_thread(convert_from_path, working_pdf, dpi=160, last_page=50)
        if not pages:
            return fail_response("Dokumen tidak memiliki halaman yang dapat dirender.", status_code=400)

        thumbnails: list[str] = []
        for p in pages:
            buf = io.BytesIO()
            p.save(buf, format="PNG", optimize=True)
            b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
            thumbnails.append(f"data:image/png;base64,{b64}")

        return ok_response(
            data={
                "thumbnail": thumbnails[0] if thumbnails else None,
                "thumbnails": thumbnails,
                "total_pages": len(thumbnails),
                "filename": file.filename,
            },
            message=f"Pratinjau {len(thumbnails)} halaman berhasil dimuat"
        )
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
    fmt: Optional[str] = Query(default=None, description="'docx' atau 'pdf' untuk dokumen OCR"),
    db: AsyncSession = Depends(get_db),
):
    doc = await db.get(Document, doc_id)
    if not doc:
        return fail_response("Dokumen tidak ditemukan", status_code=404)

    if doc.feature == "ocr":
        if fmt == "docx":
            file_path = doc.output_docx
        else:
            file_path = doc.output_pdf
    else:
        file_path = doc.output_file

    if not file_path or not os.path.exists(file_path):
        return fail_response("File output tidak ditemukan", status_code=404)

    download_name = doc.custom_name or os.path.basename(file_path)

    return FileResponse(
        path=file_path,
        filename=download_name,
        media_type="application/octet-stream"
    )


@router.get("/{doc_id}")
async def get_document(doc_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    doc = await db.get(Document, doc_id)
    if not doc:
        return fail_response("Dokumen tidak ditemukan", status_code=404)
    return ok_response(data=_doc_to_dict(doc), message="Detail dokumen berhasil diambil")


@router.patch("/{doc_id}")
async def rename_document(
    doc_id: uuid.UUID,
    body: RenameRequest,
    db: AsyncSession = Depends(get_db),
):
    doc = await db.get(Document, doc_id)
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
    db: AsyncSession = Depends(get_db),
):
    try:
        doc = await db.get(Document, doc_id)
        if not doc:
            return fail_response("Dokumen tidak ditemukan", status_code=404)

        for attr in ("original_file", "output_file", "output_docx", "output_pdf"):
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


def _doc_to_dict(doc: Document) -> dict:
    return {
        "id": str(doc.id),
        "feature": doc.feature,
        "custom_name": doc.custom_name,
        "original_file": os.path.basename(doc.original_file) if doc.original_file else None,
        "output_file": os.path.basename(doc.output_file) if doc.output_file else None,
        "output_docx": os.path.basename(doc.output_docx) if doc.output_docx else None,
        "output_pdf": os.path.basename(doc.output_pdf) if doc.output_pdf else None,
        "original_size": doc.original_size,
        "output_size": doc.output_size,
        "status": doc.status,
        "confidence_score": doc.confidence_score,
        "created_at": doc.created_at.isoformat(),
    }
