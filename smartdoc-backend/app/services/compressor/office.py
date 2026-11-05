import os
import io
import shutil
import zipfile
from copy import copy
from pathlib import Path
from PIL import Image
from app.core.logger import logger
from app.core.config import settings
from app.core.validators import validate_image_dimensions, validate_office_archive
from app.services.compressor.pptx_archive import compress_preserved_pptx


def _compress_image_bytes(image_bytes: bytes, quality: int | None = None) -> bytes:
    """Kompres gambar embedded dalam dokumen Office."""
    target_quality = quality or settings.COMPRESSION_IMAGE_QUALITY
    img = None
    try:
        validate_image_dimensions(image_bytes)
        img = Image.open(io.BytesIO(image_bytes))
        output = io.BytesIO()
        fmt = img.format
        # Other formats may carry animation or multiple pages. Retain their bytes
        # and relationships rather than replacing e.g. a GIF/TIFF with a JPEG.
        if fmt not in {"JPEG", "PNG"}:
            return image_bytes
        if fmt == "PNG":
            img.save(output, format="PNG", optimize=True)
        else:
            if img.mode in ("RGBA", "P"):
                img = img.convert("RGB")
            img.save(output, format="JPEG", quality=target_quality, optimize=True,
                     exif=img.info.get("exif", b""), icc_profile=img.info.get("icc_profile"))
        return output.getvalue()
    except Exception as e:
        logger.warning(f"Gagal kompres embedded image: {e}")
        return image_bytes
    finally:
        if img:
            try:
                img.close()
            except Exception:
                pass


def _compress_office_zip(input_path: str, output_path: str, image_quality: int | None = None) -> bool:
    """
    Kompres file Office (.docx/.xlsx/.pptx) yang merupakan zip.
    Iterasi gambar embedded dan kompres masing-masing.
    """
    target_quality = image_quality or settings.COMPRESSION_IMAGE_QUALITY
    if Path(input_path).resolve() == Path(output_path).resolve():
        raise ValueError("Hasil kompresi harus disimpan terpisah dari berkas asli.")
    original_size = os.path.getsize(input_path)
    IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tiff"}

    try:
        validate_office_archive(Path(input_path), Path(input_path).suffix)
        with zipfile.ZipFile(input_path, 'r') as zin:
            with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as zout:
                zout.comment = zin.comment
                for item in zin.infolist():
                    data = zin.read(item.filename)
                    ext = Path(item.filename).suffix.lower()
                    if ext in IMAGE_EXTS:
                        compressed = _compress_image_bytes(data, quality=target_quality)
                        data = compressed if len(compressed) < len(data) else data
                    output_item = copy(item)
                    zout.writestr(output_item, data, compresslevel=9)
    except Exception as e:
        logger.error(f"Office compression error pada {input_path}: {e}")
        shutil.copy2(input_path, output_path)
        return False

    compressed_size = os.path.getsize(output_path) if os.path.exists(output_path) else original_size
    if compressed_size >= original_size:
        shutil.copy2(input_path, output_path)
        logger.info("File Office sudah optimal, mengembalikan file asli.")
        return False

    logger.info(f"Office terkompresi: {original_size} -> {compressed_size} bytes")
    return True


def compress_docx(input_path: str, output_path: str, quality: int | None = None) -> bool:
    return _compress_office_zip(input_path, output_path, image_quality=quality)


def compress_xlsx(input_path: str, output_path: str, quality: int | None = None) -> bool:
    return _compress_office_zip(input_path, output_path, image_quality=quality)


def compress_pptx(input_path: str, output_path: str, quality: int | None = None, *, mode: str | None = None) -> bool:
    mode = mode or settings.COMPRESSION_PPTX_MODE
    if mode not in {"balanced", "lossless"}:
        raise ValueError("Mode kompresi PPTX tidak dikenal.")
    return compress_preserved_pptx(input_path, output_path, quality or settings.COMPRESSION_IMAGE_QUALITY, balanced=mode == "balanced")
