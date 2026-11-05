"""Preserve PPTX parts with bounded I/O and publish only a verified output."""
import os
import shutil
import zipfile
from copy import copy
from hashlib import file_digest, sha256
from pathlib import Path

from app.core.logger import logger
from app.core.validators import validate_office_archive
from app.services.compressor.pptx_images import optimize_pptx_image

CHUNK_BYTES = 1024 * 1024
MAX_IMAGE_BYTES = 32 * CHUNK_BYTES
RASTER_EXTENSIONS = {".png", ".jpg", ".jpeg"}


def pptx_staging_path(output_path: str | Path) -> Path:
    target = Path(output_path)
    return target.with_name(f".{target.name}.partial")


def _manifest(archive: zipfile.ZipFile) -> dict[str, bytes]:
    hashes = {}
    for entry in archive.infolist():
        with archive.open(entry) as part:
            # Reading each entry through EOF verifies its CRC before fallback.
            hashes[entry.filename] = file_digest(part, "sha256").digest()
    return hashes


def _write_part(source, target, entry, quality, balanced, optimized):
    extension = Path(entry.filename).suffix.lower()
    output_entry = copy(entry)
    is_image = balanced and entry.filename.startswith("ppt/media/") and extension in RASTER_EXTENSIONS
    if entry.file_size <= CHUNK_BYTES or (is_image and entry.file_size <= MAX_IMAGE_BYTES):
        data = source.read(entry)
        if is_image:
            candidate = optimize_pptx_image(data, extension, quality)
            if candidate != data:
                optimized[entry.filename] = sha256(candidate).digest()
                data = candidate
        output_entry.compress_type = zipfile.ZIP_DEFLATED
        target.writestr(output_entry, data, compresslevel=9)
    else:
        # Keep the original storage method for large blobs. In particular, a
        # stored blob must not become a highly expanded archive on the next run.
        with source.open(entry) as before, target.open(output_entry, "w") as after:
            shutil.copyfileobj(before, after, length=CHUNK_BYTES)


def compress_preserved_pptx(input_path: str, output_path: str, quality: int, *, balanced: bool) -> bool:
    source_path, target_path = Path(input_path), Path(output_path)
    if source_path.resolve() == target_path.resolve():
        raise ValueError("Hasil kompresi harus disimpan terpisah dari berkas asli.")
    validate_office_archive(source_path, ".pptx")
    # Source errors are fatal. A corrupt original is never a successful fallback.
    with zipfile.ZipFile(source_path) as source:
        source_hashes = _manifest(source)
        names, comment = source.namelist(), source.comment
    target_path.parent.mkdir(parents=True, exist_ok=True)
    staging = pptx_staging_path(target_path)
    with staging.open("xb"):
        pass
    try:
        compressed = False
        try:
            optimized = {}
            with zipfile.ZipFile(source_path) as source, zipfile.ZipFile(staging, "w", zipfile.ZIP_DEFLATED) as target:
                target.comment = comment
                for entry in source.infolist():
                    _write_part(source, target, entry, quality, balanced, optimized)
            validate_office_archive(staging, ".pptx")
            with zipfile.ZipFile(staging) as target:
                expected = {**source_hashes, **optimized}
                if target.namelist() != names or target.comment != comment or _manifest(target) != expected:
                    raise ValueError("Integritas komponen PPTX berubah setelah kompresi.")
            compressed = staging.stat().st_size < source_path.stat().st_size
        except Exception as error:
            logger.warning("PPTX candidate rejected; retaining validated source ({})", type(error).__name__)
        if not compressed:
            shutil.copyfile(source_path, staging)
        os.replace(staging, target_path)
        return compressed
    finally:
        staging.unlink(missing_ok=True)
