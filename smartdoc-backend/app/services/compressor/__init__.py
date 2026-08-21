# Compressor services
from app.services.compressor.pdf import compress_pdf
from app.services.compressor.image import compress_jpg, compress_png
from app.services.compressor.office import compress_docx, compress_xlsx, compress_pptx

__all__ = [
    "compress_pdf",
    "compress_jpg",
    "compress_png",
    "compress_docx",
    "compress_xlsx",
    "compress_pptx",
]
