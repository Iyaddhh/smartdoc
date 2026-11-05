"""Whitelisted operational metadata. Never serialize document names or job errors."""
import importlib.util
import os
import re
import shutil
from pathlib import Path

from app.core.config import settings
from app.services.converter.office import _find_libreoffice_binary

FEATURES = ("converter", "compressor", "splitter", "merger", "watermark")
STATUSES = ("pending", "processing", "done", "failed")


def timestamp(value):
    return value.isoformat() + "Z" if value else None


def process_metadata(row):
    duration = (row.finished_at - row.started_at).total_seconds() if row.finished_at and row.started_at else None
    return {"id": str(row.id), "feature": row.feature if row.feature in FEATURES else "other",
            "status": row.status if row.status in STATUSES else "unknown", "progress": max(0, min(100, row.progress)),
            "created_at": timestamp(row.created_at), "duration_seconds": max(0, duration) if duration is not None else None,
            "error_code": "PROCESS_FAILED" if row.status == "failed" else None}


def audit_metadata(row):
    match = re.fullmatch(r"account\.active=(True|False);quota_mb=([0-9]{1,6})", row.action)
    action = "account.updated" if match else "sessions.revoked" if row.action == "sessions.revoked" else "admin.action"
    return {"id": str(row.id), "actor_id": str(row.actor_id), "target_id": str(row.target_id),
            "action": action, "is_active": match[1] == "True" if match else None,
            "storage_quota_mb": int(match[2]) if match else None, "created_at": timestamp(row.created_at)}


def service_diagnostics():
    storage = {"available": False, "writable": False, "free_bytes": None, "total_bytes": None, "low_space": None}
    try:
        root = Path(settings.STORAGE_PATH)
        usage = shutil.disk_usage(root)
        storage = {"available": True, "writable": os.access(root, os.W_OK), "free_bytes": usage.free,
                   "total_bytes": usage.total, "low_space": usage.free < settings.MIN_FREE_DISK_MB * 1024 * 1024}
    except OSError:
        pass
    return {"backend": True, "database": True, "storage": storage,
            "engines": {"libreoffice": bool(_find_libreoffice_binary()),
                        "pdf_renderer": importlib.util.find_spec("pymupdf") is not None,
                        "ghostscript": bool(shutil.which("gs") or shutil.which("gswin64c") or shutil.which("gswin32c")),
                        "pngquant": bool(shutil.which("pngquant"))}}


def public_admin_settings():
    return {"limits": {"pdf_mb": settings.MAX_FILE_SIZE_PDF_MB, "office_mb": settings.MAX_FILE_SIZE_DOCUMENT_MB,
                       "pptx_mb": settings.MAX_FILE_SIZE_PPTX_MB,
                       "image_mb": settings.MAX_FILE_SIZE_IMAGE_MB, "batch_mb": settings.MAX_TOTAL_UPLOAD_MB,
                       "max_files": settings.MAX_UPLOAD_FILES, "max_pages": settings.MAX_PDF_PAGES,
                       "image_edge_px": settings.MAX_IMAGE_DIMENSION_PX, "timeout_seconds": settings.JOB_TIMEOUT_SECONDS,
                       "process_rate": settings.PROCESS_RATE_LIMIT},
            "privacy": {"admin_document_access": False, "guest_document_history": False, "raw_job_errors_exposed": False},
            "editable": False}
