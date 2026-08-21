import os
import shutil
import subprocess
from pypdf import PdfWriter, PdfReader
from app.core.logger import logger


def compress_pdf(input_path: str, output_path: str, dpi: int = 150) -> bool:
    """
    Kompres PDF menggunakan Ghostscript.
    Jika output lebih besar dari input, kembalikan file asli.
    Returns True jika berhasil dikompresi, False jika file asli dikembalikan.
    """
    original_size = os.path.getsize(input_path)

    gs_command = [
        "gs",
        "-sDEVICE=pdfwrite",
        "-dCompatibilityLevel=1.4",
        "-dPDFSETTINGS=/ebook",
        f"-dColorImageResolution={dpi}",
        f"-dGrayImageResolution={dpi}",
        f"-dMonoImageResolution={dpi}",
        "-dColorImageDownsampleType=/Bicubic",
        "-dGrayImageDownsampleType=/Bicubic",
        "-dDetectDuplicateImages=true",
        "-dCompressFonts=true",
        "-dNOPAUSE",
        "-dQUIET",
        "-dBATCH",
        f"-sOutputFile={output_path}",
        input_path,
    ]

    try:
        result = subprocess.run(gs_command, capture_output=True, text=True, timeout=300)
        if result.returncode != 0:
            logger.error(f"Ghostscript error: {result.stderr}")
            shutil.copy2(input_path, output_path)
            return False
    except (subprocess.TimeoutExpired, FileNotFoundError, Exception) as e:
        logger.warning(f"Ghostscript tidak tersedia ({e}), fallback ke pypdf...")
        try:
            reader = PdfReader(input_path)
            writer = PdfWriter()
            for page in reader.pages:
                page.compress_content_streams()
                writer.add_page(page)
            with open(output_path, "wb") as f:
                writer.write(f)
        except Exception as pypdf_err:
            logger.error(f"pypdf compression error: {pypdf_err}")
            shutil.copy2(input_path, output_path)
            return False

    # Quality check: kembalikan asli jika output lebih besar
    compressed_size = os.path.getsize(output_path)
    if compressed_size >= original_size:
        logger.info("PDF sudah optimal, mengembalikan file asli.")
        shutil.copy2(input_path, output_path)
        return False

    logger.info(f"PDF terkompresi: {original_size} -> {compressed_size} bytes ({(1 - compressed_size/original_size)*100:.1f}% hemat)")
    return True
