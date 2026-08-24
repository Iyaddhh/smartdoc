import os
import shutil
import tempfile
import asyncio
from pathlib import Path
from app.core.logger import logger
from app.core.concurrency import libreoffice_semaphore
from app.core.config import settings


def _find_libreoffice_binary() -> str | None:
    """Deteksi binary LibreOffice di Linux maupun Windows."""
    candidates = [
        "libreoffice",
        "soffice",
        r"C:\Program Files\LibreOffice\program\soffice.exe",
        r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
    ]
    for cand in candidates:
        if shutil.which(cand) or os.path.exists(cand):
            return cand
    return None


async def async_convert_office_to_pdf(input_path: str, output_path: str, timeout: int | None = None) -> bool:
    """
    Konversi dokumen Office (.docx/.xlsx/.pptx) ke PDF via LibreOffice headless (Non-blocking & Concurrency Safe).
    Menggunakan isolated profile dan anti-zombie subprocess reaping.
    """
    timeout_seconds = timeout or settings.JOB_TIMEOUT_SECONDS
    output_dir = str(Path(output_path).parent)
    os.makedirs(output_dir, exist_ok=True)

    lo_bin = _find_libreoffice_binary()

    if not lo_bin:
        # Fallback docx2pdf jika format input adalah .docx di Windows
        if input_path.lower().endswith(".docx"):
            try:
                def _run_docx2pdf():
                    import sys
                    venv_site = os.path.join(sys.prefix, "Lib", "site-packages")
                    for p in [os.path.join(venv_site, "win32"), os.path.join(venv_site, "win32", "lib"), os.path.join(venv_site, "Pythonwin")]:
                        if os.path.exists(p) and p not in sys.path:
                            sys.path.insert(0, p)
                    import pythoncom
                    import docx2pdf
                    pythoncom.CoInitialize()
                    try:
                        docx2pdf.convert(os.path.abspath(input_path), os.path.abspath(output_path))
                    finally:
                        pythoncom.CoUninitialize()

                await asyncio.wait_for(asyncio.to_thread(_run_docx2pdf), timeout=timeout_seconds)
                if os.path.exists(output_path):
                    logger.info(f"DOCX -> PDF via docx2pdf: {input_path} -> {output_path}")
                    return True
            except Exception as d2p_err:
                logger.warning(f"docx2pdf fallback gagal: {d2p_err}")

        logger.error("LibreOffice/soffice executable tidak ditemukan di sistem host.")
        return False

    # Create temporary isolated profile directory for this job
    profile_dir = tempfile.mkdtemp(prefix="lo_profile_")
    profile_uri = Path(profile_dir).as_uri()

    try:
        async with libreoffice_semaphore:
            cmd = [
                lo_bin,
                f"-env:UserInstallation={profile_uri}",
                "--headless",
                "--convert-to", "pdf",
                "--outdir", output_dir,
                input_path,
            ]

            proc = await asyncio.create_subprocess_exec(
                *cmd,
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
                logger.error(f"LibreOffice timeout ({timeout_seconds}s) pada {input_path}")
                return False

            if proc.returncode != 0:
                err_msg = stderr.decode('utf-8', errors='ignore') if stderr else 'Unknown error'
                logger.error(f"LibreOffice returncode {proc.returncode}: {err_msg}")
                return False

            input_stem = Path(input_path).stem
            generated = Path(output_dir) / f"{input_stem}.pdf"
            if generated.exists() and str(generated) != output_path:
                shutil.move(str(generated), output_path)

            logger.info(f"Office -> PDF sukses: {input_path} -> {output_path}")
            return True

    except Exception as e:
        logger.error(f"LibreOffice exception pada {input_path}: {e}")
        return False
    finally:
        # Guarantee profile directory cleanup
        if os.path.exists(profile_dir):
            try:
                shutil.rmtree(profile_dir, ignore_errors=True)
            except Exception as cleanup_err:
                logger.warning(f"Gagal membersihkan profile temp LibreOffice {profile_dir}: {cleanup_err}")


def convert_office_to_pdf(input_path: str, output_path: str) -> bool:
    """Synchronous fallback helper that runs the async converter."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                return pool.submit(lambda: asyncio.run(async_convert_office_to_pdf(input_path, output_path))).result()
        return loop.run_until_complete(async_convert_office_to_pdf(input_path, output_path))
    except Exception:
        return asyncio.run(async_convert_office_to_pdf(input_path, output_path))
