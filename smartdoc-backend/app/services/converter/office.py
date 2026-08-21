import os
import subprocess
import shutil
from pathlib import Path
from app.core.logger import logger


def convert_office_to_pdf(input_path: str, output_path: str) -> bool:
    """
    Konversi dokumen Office (.docx/.xlsx/.pptx) ke PDF via LibreOffice headless.
    """
    output_dir = str(Path(output_path).parent)

    # Deteksi binary LibreOffice di Linux maupun Windows
    candidates = [
        "libreoffice",
        "soffice",
        r"C:\Program Files\LibreOffice\program\soffice.exe",
        r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
    ]
    lo_bin = None
    for cand in candidates:
        if shutil.which(cand) or os.path.exists(cand):
            lo_bin = cand
            break

    if not lo_bin:
        # Fallback docx2pdf jika format input adalah .docx di Windows
        if input_path.lower().endswith(".docx"):
            try:
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

                if os.path.exists(output_path):
                    logger.info(f"DOCX -> PDF via docx2pdf: {input_path} -> {output_path}")
                    return True
            except Exception as d2p_err:
                logger.warning(f"docx2pdf fallback gagal: {d2p_err}")

        logger.error("LibreOffice/soffice executable tidak ditemukan di sistem host. Pastikan LibreOffice terinstall atau jalankan via Docker Compose.")
        return False

    try:
        result = subprocess.run(
            [
                lo_bin,
                "--headless",
                "--convert-to", "pdf",
                "--outdir", output_dir,
                input_path,
            ],
            capture_output=True,
            text=True,
            timeout=120,
        )
        if result.returncode != 0:
            logger.error(f"LibreOffice error: {result.stderr}")
            return False

        # LibreOffice menyimpan dengan nama asli + .pdf, rename ke output_path
        input_stem = Path(input_path).stem
        generated = Path(output_dir) / f"{input_stem}.pdf"
        if generated.exists() and str(generated) != output_path:
            shutil.move(str(generated), output_path)

        logger.info(f"Office -> PDF: {input_path} -> {output_path}")
        return True
    except subprocess.TimeoutExpired:
        logger.error("LibreOffice timeout")
        return False
    except Exception as e:
        logger.error(f"LibreOffice exception: {e}")
        return False
