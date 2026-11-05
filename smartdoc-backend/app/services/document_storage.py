from app.services.document_audit import record_document_activity
"""Saved files consume quota; transient results and retained activity do not."""
import asyncio
import uuid
from pathlib import Path
from fastapi import HTTPException
from sqlalchemy import select

from app.core.config import settings
from app.core.datetime_utils import utc_now
from app.core.storage import is_storage_file
from app.models.document import Document
from app.services.document_policy import require_document, DocumentAction
from app.models.user import User
from app.services.storage_usage import account_storage_usage


def file_paths(document):
    return {str(Path(path).resolve()) for path in [document.original_file, document.output_file, *(document.source_paths or [])]
            if path and is_storage_file(path)}


def file_bytes(document):
    return sum(Path(path).stat().st_size for path in file_paths(document) if Path(path).is_file())


def download_available(document):
    return bool(document.status == "done" and document.output_file and is_storage_file(document.output_file)
                and Path(document.output_file).is_file()
                and (document.is_saved or document.expires_at is None or document.expires_at > utc_now()))


async def locked_document(db, document_id, user_id, action=DocumentAction.READ):
    return await require_document(db, document_id, user_id, action, lock=True)


async def save_result(db, document):
    if document.is_saved:
        return
    if not download_available(document):
        raise HTTPException(410, "Berkas sementara sudah tidak tersedia. Jalankan tools kembali.")
    user = await db.get(User, document.user_id, populate_existing=True)
    size = Path(document.output_file).stat().st_size
    used = (await account_storage_usage(db, [user.id])).get(user.id, 0)
    if used + size > user.storage_quota_mb * 1024 * 1024:
        record_document_activity(db, document, "saved", outcome="failed", code="QUOTA_EXCEEDED")
        raise HTTPException(413, "Kuota penyimpanan tidak mencukupi. Hasil tetap bisa diunduh sementara.")
    # Keep the path stable so an in-progress download is not interrupted. Expiry
    # cleanup checks database state; saved files are not generic temp files.
    document.is_saved = True
    document.save_requested = True
    document.stored_size_bytes = size
    document.expires_at = None
    document.storage_notice = None
    record_document_activity(db, document, "saved")


async def remove_files(db, document):
    if document.status in {"pending", "processing"}:
        raise HTTPException(409, "Tunggu proses selesai sebelum menghapus berkas.")
    try:
        for path in file_paths(document):
            Path(path).unlink(missing_ok=True)
    except OSError as error:
        # A partial deletion still needs accurate accounting before reporting it.
        document.stored_size_bytes = file_bytes(document) if document.is_saved else 0
        await db.commit()
        raise HTTPException(409, "Sebagian berkas belum bisa dihapus. Coba lagi.") from error
    document.is_saved = False
    document.save_requested = False
    document.stored_size_bytes = 0
    document.original_file = ""
    document.output_file = None
    document.source_paths = []
    document.expires_at = None
    document.storage_notice = "removed"
    document.folder_id = None


async def reconcile_storage(db):
    """Startup only: preserve legacy files and reconcile actual stored bytes."""
    rows = (await db.execute(select(Document).where(Document.is_saved.is_(True)))).scalars().all()
    for document in rows:
        document.stored_size_bytes = await asyncio.to_thread(file_bytes, document)
        if not document.stored_size_bytes:
            document.is_saved = False
            document.storage_notice = "missing"
    await db.commit()


async def cleanup_expired_results(db):
    ids = (await db.execute(select(Document.id, Document.user_id).where(
        Document.is_saved.is_(False), Document.expires_at <= utc_now(), Document.status.notin_(["pending", "processing"])))) .all()
    for document_id, user_id in ids:
        if user_id is None:
            continue
        document = await locked_document(db, document_id, user_id)
        if not document.is_saved and document.expires_at and document.expires_at <= utc_now():
            await remove_files(db, document)
            document.storage_notice = "expired"
        await db.commit()
