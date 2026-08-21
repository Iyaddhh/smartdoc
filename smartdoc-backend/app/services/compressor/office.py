import os
import io
import shutil
import zipfile
import tempfile
from pathlib import Path
from PIL import Image
from app.core.logger import logger


def _compress_image_bytes(image_bytes: bytes, quality: int = 82) -> bytes:
    """Kompres gambar embedded dalam dokumen Office."""
    try:
        img = Image.open(io.BytesIO(image_bytes))
        output = io.BytesIO()
        fmt = img.format or "JPEG"
        if fmt == "PNG":
            img.save(output, format="PNG", optimize=True)
        else:
            if img.mode in ("RGBA", "P"):
                img = img.convert("RGB")
            img.save(output, format="JPEG", quality=quality, optimize=True)
        return output.getvalue()
    except Exception as e:
        logger.warning(f"Gagal kompres embedded image: {e}")
        return image_bytes


def _compress_office_zip(input_path: str, output_path: str, image_quality: int = 82) -> bool:
    """
    Kompres file Office (.docx/.xlsx/.pptx) yang merupakan zip.
    Iterasi gambar embedded dan kompres masing-masing.
    """
    original_size = os.path.getsize(input_path)
    IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tiff"}

    try:
        with zipfile.ZipFile(input_path, 'r') as zin:
            with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zout:
                for item in zin.infolist():
                    data = zin.read(item.filename)
                    ext = Path(item.filename).suffix.lower()
                    if ext in IMAGE_EXTS:
                        compressed = _compress_image_bytes(data, quality=image_quality)
                        data = compressed if len(compressed) < len(data) else data
                    zout.writestr(item, data)
    except Exception as e:
        logger.error(f"Office compression error: {e}")
        shutil.copy2(input_path, output_path)
        return False

    compressed_size = os.path.getsize(output_path)
    if compressed_size >= original_size:
        shutil.copy2(input_path, output_path)
        logger.info("File Office sudah optimal, mengembalikan file asli.")
        return False

    logger.info(f"Office terkompresi: {original_size} -> {compressed_size} bytes")
    return True


def compress_docx(input_path: str, output_path: str, quality: int = 82) -> bool:
    return _compress_office_zip(input_path, output_path, image_quality=quality)


def compress_xlsx(input_path: str, output_path: str, quality: int = 82) -> bool:
    return _compress_office_zip(input_path, output_path, image_quality=quality)


def compress_pptx(input_path: str, output_path: str, quality: int = 82) -> bool:
    return _compress_office_zip(input_path, output_path, image_quality=quality)
