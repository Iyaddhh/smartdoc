import os
from typing import Tuple, List, Optional
from fastapi import UploadFile, HTTPException
from pypdf import PdfReader
from docxtpl import DocxTemplate
from app.core.config import settings

# Supported extensions per feature
ALLOWED_CONVERTER_EXTENSIONS = {".pdf", ".docx", ".xlsx", ".pptx", ".jpg", ".jpeg", ".png"}
ALLOWED_COMPRESSOR_EXTENSIONS = {".pdf", ".docx", ".xlsx", ".pptx", ".jpg", ".jpeg", ".png"}
ALLOWED_OCR_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png"}

def validate_file_size(file_size_bytes: int, max_mb: Optional[int] = None) -> None:
    limit_mb = max_mb or settings.MAX_FILE_SIZE_MB
    limit_bytes = limit_mb * 1024 * 1024
    if file_size_bytes > limit_bytes:
        raise HTTPException(
            status_code=400,
            detail=f"Ukuran file melebihi batas maksimum {limit_mb} MB."
        )

def validate_file_extension(filename: str, allowed_extensions: set) -> str:
    _, ext = os.path.splitext(filename.lower())
    if ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Format file '{ext}' tidak didukung. Format yang diterima: {', '.join(allowed_extensions)}"
        )
    return ext

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
