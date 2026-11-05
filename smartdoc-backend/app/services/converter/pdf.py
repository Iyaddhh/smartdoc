import os
from pathlib import Path
from PIL import Image, ImageOps
from app.core.logger import logger
from app.core.config import settings
from app.core.validators import validate_pdf_pages
from app.services.pdf_rendering import render_pdf_page, serialized_pdf_engine


@serialized_pdf_engine
def pdf_to_word(input_path: str, output_path: str) -> bool:
    """Convert a text-based PDF without rewriting the generated document content."""
    try:
        from pdf2docx import Converter
        cv = Converter(input_path)
        try:
            cv.convert(output_path, start=0, end=None)
        finally:
            cv.close()
        logger.info(f"PDF -> DOCX: {input_path} -> {output_path}")
        return True
    except Exception as e:
        logger.error(f"pdf2docx error pada {input_path}: {e}")
        return False


def pdf_to_images(input_path: str, output_dir: str, fmt: str = "jpg", dpi: int = 150) -> list[str]:
    """
    Konversi PDF ke list gambar (satu gambar per halaman).
    Returns list path gambar hasil konversi.
    """
    try:
        total_pages = validate_pdf_pages(input_path)
        os.makedirs(output_dir, exist_ok=True)
        paths = []
        fmt_clean = "jpg" if fmt.lower() in ("jpg", "jpeg") else "png"
        for i in range(total_pages):
            # Render one page at a time rather than retaining every decoded page in RAM.
            page = render_pdf_page(input_path, page_index=i, dpi=dpi)
            try:
                filename = f"page_{i + 1:03d}.{fmt_clean}"
                out_path = os.path.join(output_dir, filename)
                if fmt_clean == "jpg":
                    page.save(out_path, "JPEG", quality=90)
                else:
                    page.save(out_path, "PNG")
                paths.append(out_path)
            finally:
                try:
                    page.close()
                except Exception:
                    pass
        logger.info(f"PDF -> Images ({len(paths)} halaman): {input_path}")
        return paths
    except Exception as e:
        logger.error(f"PDF image rendering error pada {input_path}: {e}")
        return []


def images_to_pdf(image_paths: list[str], output_path: str) -> bool:
    """Gabungkan satu atau lebih gambar menjadi satu file PDF."""
    opened_images = []
    total_pixels = 0
    try:
        for p in image_paths:
            with Image.open(p) as source:
                total_pixels += source.width * source.height
                if total_pixels > settings.MAX_TOTAL_IMAGE_PIXELS:
                    raise ValueError("Total dimensi gambar melebihi batas pemrosesan.")
                with ImageOps.exif_transpose(source) as oriented:
                    if "A" in oriented.getbands() or "transparency" in oriented.info:
                        with oriented.convert("RGBA") as rgba:
                            image = Image.new("RGB", rgba.size, "white")
                            image.paste(rgba, mask=rgba.getchannel("A"))
                    else:
                        image = oriented.convert("RGB")
                    opened_images.append(image)
        if not opened_images:
            return False
        opened_images[0].save(
            output_path,
            format="PDF",
            save_all=True,
            append_images=opened_images[1:]
        )
        logger.info(f"Images -> PDF: {len(opened_images)} gambar -> {output_path}")
        return True
    except Exception as e:
        logger.error(f"images_to_pdf error: {e}")
        return False
    finally:
        for img in opened_images:
            try:
                img.close()
            except Exception:
                pass
