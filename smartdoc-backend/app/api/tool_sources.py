"""Resolve tool input from uploads or an owned, saved workspace document."""
import tempfile
import uuid
from pathlib import Path

from fastapi import Depends, File, Form, HTTPException, UploadFile, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import get_current_user
from app.core.workers import run_sync
from app.db.base import get_db
from app.services.document_policy import require_document, DocumentAction
from app.models.user import User
from app.services.document_storage import download_available


async def tool_inputs(
    request: Request,
    file: UploadFile | None = File(None),
    files: list[UploadFile] = File(default=[]),
    source_document_id: uuid.UUID | None = Form(None),
    source_document_ids: list[uuid.UUID] = Form(default=[]),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if request.url.path.endswith("/process"):
        from app.services.job_admission import admit_job
        await admit_job(db, user.id)
    if file and files:
        raise HTTPException(422, "Pilih satu cara untuk mengirim berkas.")
    sources = ([source_document_id] if source_document_id else []) + source_document_ids
    uploads = files or ([file] if file else [])
    if len(sources) + len(uploads) > settings.MAX_UPLOAD_FILES:
        raise HTTPException(400, "Jumlah berkas melebihi batas pemrosesan.")
    resolved = []
    snapshots = []
    total = 0
    try:
        for source_id in sources:
            action = DocumentAction.PROCESS if request.url.path.endswith("/process") else DocumentAction.PREVIEW
            document = await require_document(db, source_id, user.id, action, lock=True)
            if not document.is_saved or not download_available(document):
                raise HTTPException(410, "Dokumen sumber sudah tidak tersedia di workspace.")
            path = Path(document.output_file)
            limit = settings.MAX_TOTAL_UPLOAD_MB * 1024 * 1024
            if request.url.path == "/api/compressor/process" and path.suffix.lower() == ".pptx":
                limit = settings.get_max_size_for_extension(".pptx")

            name = Path((document.custom_name or "dokumen").replace("\\", "/")).stem + path.suffix.lower()
            snapshot = UploadFile(file=tempfile.SpooledTemporaryFile(max_size=1024 * 1024), filename=name, size=0)
            snapshots.append(snapshot)

            def read_source():
                copied = 0
                with path.open("rb") as stream:
                    while chunk := stream.read(1024 * 1024):
                        copied += len(chunk)
                        if total + copied > limit:
                            raise HTTPException(413, "Ukuran total berkas melebihi batas pemrosesan.")
                        snapshot.file.write(chunk)
                snapshot.file.seek(0)
                return copied

            try:
                size = await run_sync(read_source)
            except OSError:
                raise HTTPException(410, "Dokumen sumber sudah tidak tersedia.") from None
            total += size
            snapshot.size = size
            # The stored extension is authoritative even after a display-name edit.
            resolved.append(snapshot)
        yield resolved + uploads
    finally:
        for snapshot in snapshots:
            await snapshot.close()


def single_tool_input(inputs: list[UploadFile]) -> UploadFile:
    if len(inputs) != 1:
        raise HTTPException(422, "Pilih tepat satu berkas atau dokumen tersimpan.")
    return inputs[0]
