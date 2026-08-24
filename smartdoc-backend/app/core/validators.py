import os
import io
import zipfile
from typing import List, Optional
import filetype
from fastapi import UploadFile, HTTPException
from pypdf import PdfReader
from docxtpl import DocxTemplate
from PIL import Image
from app.core.config import settings

# Supported extensions per feature
ALLOWED_CONVERTER_EXTENSIONS = {".pdf", ".docx", ".xlsx", ".pptx", ".jpg", ".jpeg", ".png"}
ALLOWED_COMPRESSOR_EXTENSIONS = {".pdf", ".docx", ".xlsx", ".pptx", ".jpg", ".jpeg", ".png"}
ALLOWED_OCR_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png"}
ALLOWED_MERGE_EXTENSIONS = {".pdf", ".docx", ".xlsx", ".pptx", ".jpg", ".jpeg", ".png"}
ALLOWED_SPLIT_EXTENSIONS = {".pdf", ".docx"}


def validate_file_extension(filename: str, allowed_extensions: set) -> str:
    _, ext = os.path.splitext(filename.lower())
    if ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Format file '{ext}' tidak didukung. Format yang diterima: {', '.join(allowed_extensions)}"
        )
    return ext


async def validate_and_read_upload(file: UploadFile, ext: str, max_size_bytes: Optional[int] = None) -> bytes:
    """
    Membaca berkas upload secara streaming (chunk 1MB) dan langsung menolak jika ukuran
    melebihi limit kategori sebelum seluruh berkas membebani memori RAM.
    """
    max_bytes = max_size_bytes or settings.get_max_size_for_extension(ext)
    max_mb = max_bytes // (1024 * 1024)

    # 1. Cek Content-Length header jika tersedia dari client
    content_length = file.headers.get("content-length")
    if content_length:
        try:
            cl_int = int(content_length)
            if cl_int > max_bytes:
                raise HTTPException(
                    status_code=413,
                    detail=f"Ukuran berkas melebihi batas maksimal {max_mb} MB untuk format {ext.upper()}."
                )
        except ValueError:
            pass

    # 2. Chunked stream reading dengan early abort
    chunks: List[bytes] = []
    total_size = 0
    chunk_size = 1024 * 1024  # 1MB per chunk

    while True:
        chunk = await file.read(chunk_size)
        if not chunk:
            break
        total_size += len(chunk)
        if total_size > max_bytes:
            raise HTTPException(
                status_code=413,
                detail=f"Ukuran berkas melebihi batas maksimal {max_mb} MB untuk format {ext.upper()}."
            )
        chunks.append(chunk)

    if total_size == 0:
        raise HTTPException(status_code=400, detail="Berkas yang diunggah kosong (0 bytes).")

    return b"".join(chunks)


def validate_image_dimensions(content: bytes, max_dimension: Optional[int] = None) -> None:
    """
    Validasi dimensi gambar (lebar & tinggi) agar tidak melebihi batas maksimum pixel (default 6000px).
    Mencegah lonjakan konsumsi RAM saat rendering / uncompressing gambar beresolusi raksasa.
    """
    max_dim = max_dimension or settings.MAX_IMAGE_DIMENSION_PX
    img = None
    try:
        img = Image.open(io.BytesIO(content))
        width, height = img.size
        if width > max_dim or height > max_dim:
            raise HTTPException(
                status_code=413,
                detail=f"Dimensi gambar ({width}x{height}px) melebihi batas maksimum {max_dim}px."
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Berkas gambar tidak valid atau corrupt: {e}")
    finally:
        if img:
            try:
                img.close()
            except Exception:
                pass


def validate_file_magic_bytes(content: bytes, ext: str) -> None:
    """
    Validasi integritas biner (magic bytes) untuk mencegah berkas corrupt atau format palsu.
    """
    if not content:
        raise HTTPException(status_code=400, detail="Berkas kosong (0 bytes).")

    ext_lower = ext.lower().lstrip(".")
    kind = filetype.guess(content[:4096])

    if ext_lower == "pdf":
        if not content.startswith(b"%PDF") and (not kind or kind.extension != "pdf"):
            raise HTTPException(status_code=400, detail="Berkas PDF tidak valid atau corrupt.")
    elif ext_lower in ("jpg", "jpeg"):
        if not (content.startswith(b"\xff\xd8\xff") or (kind and kind.extension in ("jpg", "jpeg"))):
            raise HTTPException(status_code=400, detail="Berkas JPEG/JPG tidak valid atau corrupt.")
    elif ext_lower == "png":
        if not (content.startswith(b"\x89PNG\r\n\x1a\n") or (kind and kind.extension == "png")):
            raise HTTPException(status_code=400, detail="Berkas PNG tidak valid atau corrupt.")
    elif ext_lower in ("docx", "xlsx", "pptx"):
        # Berkas Office XML berbasis container ZIP
        if not (content.startswith(b"PK\x03\x04") or (kind and kind.extension == "zip") or zipfile.is_zipfile(io.BytesIO(content))):
            raise HTTPException(status_code=400, detail=f"Berkas Office .{ext_lower} tidak valid atau corrupt.")


def validate_pdf_pages(file_path: str) -> int:
    try:
        reader = PdfReader(file_path)
        if reader.is_encrypted:
            raise HTTPException(
                status_code=400,
                detail="File PDF terenkripsi/password-protected. Harap unlock terlebih dahulu."
            )
        num_pages = len(reader.pages)
        if num_pages > settings.MAX_PDF_PAGES:
            raise HTTPException(
                status_code=400,
                detail=f"Jumlah halaman PDF ({num_pages}) melebihi batas maksimum {settings.MAX_PDF_PAGES} halaman."
            )
        return num_pages
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"File PDF corrupt atau tidak valid: {str(e)}"
        )


def validate_docx_template(file_path: str, expected_field_keys: List[str]) -> bool:
    try:
        doc = DocxTemplate(file_path)
        undeclared_tags = doc.get_undeclared_template_variables()
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"File template .docx corrupt atau tidak valid: {str(e)}"
        )

    missing = set(expected_field_keys) - undeclared_tags
    if missing:
        raise HTTPException(
            status_code=422,
            detail=f"Field zona berikut tidak ditemukan sebagai tag {{field}} di file .docx: {list(missing)}"
        )
    return True
