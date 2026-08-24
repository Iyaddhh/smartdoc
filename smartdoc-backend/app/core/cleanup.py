import os
import time
from app.core.config import settings
from app.core.logger import logger


def clean_expired_temp_files(ttl_hours: int = 24) -> int:
    """
    Membersihkan file temporary yang sudah melewati masa TTL (PRD Section 7.6).
    Returns jumlah file yang berhasil dihapus.
    """
    now = time.time()
    ttl_seconds = ttl_hours * 3600
    cleaned_count = 0

    temp_dirs = [
        os.path.join(settings.STORAGE_PATH, "temp", "uploads"),
        os.path.join(settings.STORAGE_PATH, "temp", "processing"),
        os.path.join(settings.STORAGE_PATH, "temp"),
    ]

    for d in temp_dirs:
        if not os.path.exists(d):
            continue
        for entry in os.scandir(d):
            if entry.name == ".gitkeep":
                continue
            if entry.is_file():
                try:
                    file_age = now - entry.stat().st_mtime
                    if file_age > ttl_seconds:
                        os.remove(entry.path)
                        cleaned_count += 1
                except Exception as e:
                    logger.warning(f"Gagal menghapus temp file {entry.path}: {e}")

    if cleaned_count > 0:
        logger.info(f"Auto-cleanup: {cleaned_count} file temporary kadaluarsa berhasil dibersihkan.")

    return cleaned_count
