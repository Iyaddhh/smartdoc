"""Render one page in Python without a system Poppler executable."""
from functools import wraps
from threading import RLock

from PIL import Image
from app.core.config import settings

_engine_lock = RLock()


def serialized_pdf_engine(function):
    """PyMuPDF and pdf2docx share a native engine: serialize their thread work."""
    @wraps(function)
    def wrapped(*args, **kwargs):
        with _engine_lock:
            return function(*args, **kwargs)
    return wrapped


@serialized_pdf_engine
def render_pdf_page(path: str, page_index: int = 0, dpi: int = 150) -> Image.Image:
    import pymupdf

    with pymupdf.open(path) as document:
        page = document.load_page(page_index)
        width, height = page.rect.width * dpi / 72, page.rect.height * dpi / 72
        if width * height > settings.MAX_TOTAL_IMAGE_PIXELS:
            raise ValueError("Dimensi render halaman melebihi batas pemrosesan.")
        pixmap = page.get_pixmap(dpi=dpi, colorspace=pymupdf.csRGB, alpha=False)
        return Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)
