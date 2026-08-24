import os
import shutil
import asyncio
from pathlib import Path
from pypdf import PdfWriter, PdfReader
from app.core.logger import logger
from app.core.config import settings


async def async_compress_pdf(input_path: str, output_path: str, dpi: int | None = None, timeout: int | None = None) -> bool:
    """
    Kompres PDF menggunakan Ghostscript (non-blocking subprocess) dengan fallback ke pypdf.
    Anti-zombie timeout & quality retention.
    """
    target_dpi = dpi or settings.COMPRESSION_IMAGE_DPI
    timeout_seconds = timeout or settings.JOB_TIMEOUT_SECONDS
    original_size = os.path.getsize(input_path)

    gs_bin = shutil.which("gs") or shutil.which("gswin64c") or shutil.which("gswin32c")

    if gs_bin:
        gs_command = [
            gs_bin,
            "-sDEVICE=pdfwrite",
            "-dCompatibilityLevel=1.4",
            "-dPDFSETTINGS=/ebook",
            f"-dColorImageResolution={target_dpi}",
            f"-dGrayImageResolution={target_dpi}",
            f"-dMonoImageResolution={target_dpi}",
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
            proc = await asyncio.create_subprocess_exec(
                *gs_command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            try:
                stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout_seconds)
            except asyncio.TimeoutError:
                try:
                    proc.kill()
                    await proc.wait()
                except Exception:
                    pass
                logger.error(f"Ghostscript timeout ({timeout_seconds}s) pada {input_path}")
                shutil.copy2(input_path, output_path)
                return False

            if proc.returncode != 0:
                err_msg = stderr.decode('utf-8', errors='ignore') if stderr else 'Unknown error'
                logger.error(f"Ghostscript error: {err_msg}")
                # Fallback to pypdf below
            else:
                compressed_size = os.path.getsize(output_path) if os.path.exists(output_path) else original_size
                if compressed_size >= original_size:
                    logger.info("PDF sudah optimal, mengembalikan file asli.")
                    shutil.copy2(input_path, output_path)
                    return False
                logger.info(f"PDF terkompresi via Ghostscript: {original_size} -> {compressed_size} bytes ({(1 - compressed_size/original_size)*100:.1f}% hemat)")
                return True

        except Exception as e:
            logger.warning(f"Ghostscript execution failed ({e}), fallback ke pypdf...")

    # Fallback to pypdf in worker thread
    def _pypdf_compress():
        reader = PdfReader(input_path)
        writer = PdfWriter()
        for page in reader.pages:
            p = writer.add_page(page)
            try:
                p.compress_content_streams()
            except Exception:
                pass
        with open(output_path, "wb") as f:
            writer.write(f)

    try:
        await asyncio.wait_for(asyncio.to_thread(_pypdf_compress), timeout=timeout_seconds)
    except Exception as pypdf_err:
        logger.error(f"pypdf compression error: {pypdf_err}")
        shutil.copy2(input_path, output_path)
        return False

    compressed_size = os.path.getsize(output_path) if os.path.exists(output_path) else original_size
    if compressed_size >= original_size:
        logger.info("PDF sudah optimal via pypdf, mengembalikan file asli.")
        shutil.copy2(input_path, output_path)
        return False

    logger.info(f"PDF terkompresi via pypdf: {original_size} -> {compressed_size} bytes ({(1 - compressed_size/original_size)*100:.1f}% hemat)")
    return True


def compress_pdf(input_path: str, output_path: str, dpi: int = 150) -> bool:
    """Synchronous fallback helper that runs the async compressor."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                return pool.submit(lambda: asyncio.run(async_compress_pdf(input_path, output_path, dpi=dpi))).result()
        return loop.run_until_complete(async_compress_pdf(input_path, output_path, dpi=dpi))
    except Exception:
        return asyncio.run(async_compress_pdf(input_path, output_path, dpi=dpi))
