import os
import io
import zipfile
import asyncio
from typing import List, Optional
import filetype
from fastapi import UploadFile, HTTPException
from pypdf import PdfReader
from PIL import Image
from app.core.config import settings

# Supported extensions per feature
ALLOWED_CONVERTER_EXTENSIONS = {".pdf", ".docx", ".xlsx", ".pptx", ".jpg", ".jpeg", ".png"}
ALLOWED_COMPRESSOR_EXTENSIONS = {".pdf", ".docx", ".xlsx", ".pptx", ".jpg", ".jpeg", ".png"}
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
    validate_file_extension(file.filename or "", ALLOWED_CONVERTER_EXTENSIONS)
    max_bytes = min(max_size_bytes or settings.get_max_size_for_extension(ext), settings.get_max_size_for_extension(ext))
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

    content = b"".join(chunks)
    await asyncio.to_thread(validate_file_magic_bytes, content, ext)
    if ext == ".pdf":
        await asyncio.to_thread(validate_pdf_content, content)
    elif ext in {".jpg", ".jpeg", ".png"}:
        await asyncio.to_thread(validate_image_dimensions, content)
    return content


def validate_image_dimensions(content: bytes, max_dimension: Optional[int] = None) -> None:
    """
    Validasi dimensi gambar (lebar & tinggi) agar tidak melebihi batas maksimum pixel (default 10000px).
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
        validate_office_archive(content, ext_lower)


def validate_office_archive(content: bytes, ext: str) -> None:
    """Check the ZIP directory before any entry is decompressed or passed to an engine."""
    required = {"docx": "word/document.xml", "xlsx": "xl/workbook.xml", "pptx": "ppt/presentation.xml"}
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            entries = archive.infolist()
            names = {entry.filename for entry in entries}
            if "[Content_Types].xml" not in names or required[ext.lstrip(".")] not in names:
                raise HTTPException(status_code=400, detail="Struktur dokumen Office tidak sesuai ekstensi.")
            if len(entries) > settings.MAX_OFFICE_ENTRIES or len(names) != len(entries):
                raise HTTPException(status_code=413, detail="Jumlah entri dokumen Office tidak diizinkan.")
            total = 0
            for entry in entries:
                total += entry.file_size
                if entry.flag_bits & 1:
                    raise HTTPException(status_code=400, detail="Dokumen Office terenkripsi tidak didukung.")
                if (entry.file_size > settings.MAX_OFFICE_ENTRY_MB * 1024 * 1024
                    or total > settings.MAX_OFFICE_UNCOMPRESSED_MB * 1024 * 1024
                    or entry.file_size / max(1, entry.compress_size) > settings.MAX_OFFICE_COMPRESSION_RATIO):
                    raise HTTPException(status_code=413, detail="Dokumen Office melebihi batas dekompresi aman.")
    except HTTPException:
        raise
    except (zipfile.BadZipFile, KeyError, OSError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Container dokumen Office tidak valid.") from exc


def validate_pdf_reader(reader: PdfReader, max_pages: Optional[int] = None) -> int:
    if reader.is_encrypted:
        raise HTTPException(status_code=400, detail="File PDF terenkripsi/password-protected. Harap unlock terlebih dahulu.")
    count = len(reader.pages)
    maximum = settings.MAX_PDF_PAGES if max_pages is None else max_pages
    if not count:
        raise HTTPException(status_code=400, detail="Dokumen PDF tidak memiliki halaman.")
    if count > maximum:
        raise HTTPException(status_code=413, detail=f"Jumlah halaman PDF ({count}) melebihi batas maksimum {maximum} halaman.")
    for page in reader.pages:
        if max(abs(float(page.mediabox.width)), abs(float(page.mediabox.height))) > settings.MAX_PDF_PAGE_EDGE_POINTS:
            raise HTTPException(status_code=413, detail="Dimensi halaman PDF melebihi batas render aman.")
    return count


def validate_pdf_content(content: bytes) -> int:
    try:
        return validate_pdf_reader(PdfReader(io.BytesIO(content)))
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail="File PDF corrupt atau tidak valid.") from exc


def validate_pdf_pages(file_path: str) -> int:
    try:
        reader = PdfReader(file_path)
        return validate_pdf_reader(reader)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"File PDF corrupt atau tidak valid: {str(e)}"
        )
