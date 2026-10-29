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
        for root, dirs, files in os.walk(d, topdown=False):
            for file in files:
                if file == ".gitkeep":
                    continue
                file_path = os.path.join(root, file)
                try:
                    file_age = now - os.path.getmtime(file_path)
                    if file_age > ttl_seconds:
                        os.remove(file_path)
                        cleaned_count += 1
                except Exception as e:
                    logger.warning(f"Gagal menghapus temp file {file_path}: {e}")

            for dir_name in dirs:
                dir_path = os.path.join(root, dir_name)
                try:
                    if not os.listdir(dir_path) and (now - os.path.getmtime(dir_path)) > ttl_seconds:
                        os.rmdir(dir_path)
                except Exception:
                    pass

    if cleaned_count > 0:
        logger.info(f"Auto-cleanup: {cleaned_count} file temporary kadaluarsa berhasil dibersihkan.")

    return cleaned_count
