"""Bounded disk staging for large PPTX uploads; never accumulate the full body."""
from pathlib import Path

from fastapi import HTTPException, UploadFile

from app.core.validators import upload_size_limit, validate_office_archive
from app.core.workers import run_sync

UPLOAD_CHUNK_BYTES = 1024 * 1024


async def stage_pptx_upload(file: UploadFile, destination: Path, max_size_bytes: int | None = None) -> int:
    limit = upload_size_limit(file, ".pptx", max_size_bytes)
    created = False

    def stage():
        nonlocal created
        try:
            total = 0
            with destination.open("xb") as target:
                created = True
                while chunk := file.file.read(UPLOAD_CHUNK_BYTES):
                    total += len(chunk)
                    if total > limit:
                        raise HTTPException(413, f"Ukuran berkas melebihi batas maksimal {limit // UPLOAD_CHUNK_BYTES} MB untuk format .PPTX.")
                    target.write(chunk)
            if not total:
                raise HTTPException(400, "Berkas yang diunggah kosong (0 bytes).")
            validate_office_archive(destination, ".pptx")
            return total
        except BaseException:
            if created:
                destination.unlink(missing_ok=True)
            raise

    try:
        return await run_sync(stage)
    except BaseException:
        # run_sync waits for the writer on cancellation before removing its file.
        # Existing destinations are never owned by this helper (exclusive open).
        if created:
            destination.unlink(missing_ok=True)
        raise
