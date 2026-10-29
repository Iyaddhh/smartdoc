"""Public tools: transient files only; no Document, Job, or database dependency."""
import asyncio
import shutil
import tempfile
import zipfile
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from starlette.responses import FileResponse
from slowapi.util import get_remote_address
from pypdf import PdfReader

from app.core.config import settings
from app.core.concurrency import job_semaphore
from app.core.limiter import limiter
from app.core.validators import ALLOWED_CONVERTER_EXTENSIONS, validate_and_read_upload, validate_file_extension, validate_pdf_pages
from app.services.converter import async_convert_office_to_pdf, images_to_pdf, pdf_to_images, pdf_to_word
from app.services.compressor import async_compress_pdf, async_compress_png, compress_jpg, compress_docx, compress_xlsx, compress_pptx
from app.services.merger.pdf import merge_documents
from app.services.splitter import extract_pages_to_pdf, split_pdf_by_chunks, split_all_single_pages
from app.services.watermark import apply_watermark_and_security

router = APIRouter(prefix="/api/guest", tags=["Guest tools"])


def clean_guest_orphans():
    """Startup recovery, before requests are accepted; remove crash leftovers."""
    root = Path(settings.STORAGE_PATH) / "temp" / "guest"
    if root.is_dir():
        for directory in root.glob("request-*"):
            if directory.is_dir() and not directory.is_symlink():
                shutil.rmtree(directory)


class TemporaryDownload(FileResponse):
    def __init__(self, path: Path, directory: Path):
        super().__init__(path, filename=path.name, headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"})
        self.directory = directory

    async def __call__(self, scope, receive, send):
        try:
            await super().__call__(scope, receive, send)
        finally:
            await asyncio.to_thread(shutil.rmtree, self.directory, True)


async def run_sync(function, *args):
    # Let a running engine finish before deleting its directory on cancellation.
    task = asyncio.create_task(asyncio.to_thread(function, *args))
    try:
        return await asyncio.shield(task)
    except asyncio.CancelledError:
        await task
        raise


async def working_pdf(path: Path) -> Path:
    if path.suffix == ".pdf":
        return path
    target = path.with_suffix(".pdf")
    if path.suffix in {".jpg", ".jpeg", ".png"}:
        success = await run_sync(images_to_pdf, [str(path)], str(target))
    else:
        success = await async_convert_office_to_pdf(str(path), str(target))
    if not success or not target.is_file():
        raise HTTPException(422, "Dokumen tidak dapat diubah menjadi PDF.")
    await run_sync(validate_pdf_pages, str(target))
    return target


async def process_files(feature: str, paths: list[Path], directory: Path, output_format: str,
                        split_mode: str, page_range: str, chunk_size: int,
                        watermark_text: str, password: str) -> Path:
    first = paths[0]
    target = directory / "hasil.pdf"
    success = False
    if feature == "converter":
        if output_format == "pdf" and all(p.suffix in {".jpg", ".jpeg", ".png"} for p in paths):
            success = await run_sync(images_to_pdf, [str(p) for p in paths], str(target))
        elif first.suffix in {".docx", ".xlsx", ".pptx"} and output_format == "pdf":
            success = await async_convert_office_to_pdf(str(first), str(target))
        elif first.suffix == ".pdf" and output_format == "docx":
            target = directory / "hasil.docx"
            success = await run_sync(pdf_to_word, str(first), str(target))
        elif first.suffix == ".pdf" and output_format in {"jpg", "png"}:
            pages = await run_sync(pdf_to_images, str(first), str(directory / "pages"), output_format)
            if pages:
                target = directory / "hasil.zip"
                def archive():
                    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as output:
                        for page in pages:
                            output.write(page, Path(page).name)
                await run_sync(archive)
                success = True
        else:
            raise HTTPException(400, "Pasangan format konversi tidak didukung.")
    elif feature == "compressor":
        target = directory / f"hasil{first.suffix}"
        if first.suffix == ".pdf":
            await async_compress_pdf(str(first), str(target), settings.COMPRESSION_IMAGE_DPI)
        elif first.suffix == ".png":
            await async_compress_png(str(first), str(target))
        else:
            engine = {".jpg": compress_jpg, ".jpeg": compress_jpg, ".docx": compress_docx,
                      ".xlsx": compress_xlsx, ".pptx": compress_pptx}[first.suffix]
            await run_sync(engine, str(first), str(target), settings.COMPRESSION_IMAGE_QUALITY)
        # Some engines return False for an unchanged but valid copy.
        success = target.is_file() and target.stat().st_size > 0
    else:
        pdfs = [await working_pdf(path) for path in paths]
        total_pages = await run_sync(lambda: sum(len(PdfReader(p).pages) for p in pdfs))
        if total_pages > settings.MAX_PDF_PAGES:
            raise HTTPException(413, "Total halaman melebihi batas pemrosesan.")
        if feature == "merger":
            success = await run_sync(merge_documents, [str(p) for p in pdfs], str(target))
        elif feature == "splitter":
            if split_mode == "range":
                indices = set()
                try:
                    for segment in page_range.split(","):
                        bounds = segment.strip().split("-")
                        if len(bounds) not in (1, 2):
                            raise ValueError()
                        start = int(bounds[0])
                        end = int(bounds[-1])
                        if not 1 <= start <= end <= total_pages:
                            raise ValueError()
                        indices.update(range(start - 1, end))
                except ValueError:
                    raise HTTPException(422, "Rentang halaman tidak valid. Contoh: 1-3,5.")
                success = await run_sync(extract_pages_to_pdf, str(pdfs[0]), sorted(indices), str(target))
            else:
                target = directory / "hasil.zip"
                if split_mode == "all":
                    success = await run_sync(split_all_single_pages, str(pdfs[0]), str(target), "halaman")
                else:
                    success = await run_sync(split_pdf_by_chunks, str(pdfs[0]), chunk_size, str(target), "bagian")
        elif feature == "watermark":
            if not watermark_text.strip() and not password:
                raise HTTPException(422, "Isi teks watermark atau kata sandi.")
            success = await run_sync(apply_watermark_and_security, str(pdfs[0]), str(target), False,
                                     watermark_text or None, 0.25, 45.0, 44, "#64748b", password or None)
    if not success or not target.is_file() or target.stat().st_size == 0:
        raise HTTPException(422, "Berkas gagal diproses. Periksa format dan isi dokumen.")
    if target.suffix == ".pdf" and not (feature == "watermark" and password):
        await run_sync(validate_pdf_pages, str(target))
    return target


@router.post("/{feature}")
@limiter.shared_limit(settings.PROCESS_RATE_LIMIT, scope="guest-process", key_func=get_remote_address, override_defaults=False)
async def guest_process(
    request: Request,
    feature: Literal["converter", "compressor", "splitter", "merger", "watermark"],
    files: list[UploadFile] = File(...),
    output_format: Literal["pdf", "docx", "jpg", "png"] = Form("pdf"),
    split_mode: Literal["range", "all", "chunks"] = Form("range"),
    page_range: str = Form("1"),
    chunk_size: int = Form(1, ge=1, le=50),
    watermark_text: str = Form("", max_length=200),
    password: str = Form("", max_length=128),
):
    if not 1 <= len(files) <= settings.MAX_UPLOAD_FILES:
        raise HTTPException(400, "Jumlah berkas tidak valid.")
    if feature == "merger" and len(files) < 2:
        raise HTTPException(400, "Pilih minimal dua berkas.")
    if feature not in {"merger", "converter"} and len(files) != 1:
        raise HTTPException(400, "Fitur ini menerima satu berkas.")
    if feature == "converter" and len(files) > 1 and (
        output_format != "pdf" or any(Path(f.filename or "").suffix.lower() not in {".jpg", ".jpeg", ".png"} for f in files)
    ):
        raise HTTPException(400, "Banyak berkas hanya didukung untuk gambar menjadi PDF.")
    try:
        await asyncio.wait_for(job_semaphore.acquire(), timeout=0.05)
    except asyncio.TimeoutError:
        raise HTTPException(429, "Server sedang sibuk. Coba lagi sebentar.")
    directory = None
    try:
        root = Path(settings.STORAGE_PATH) / "temp" / "guest"
        root.mkdir(parents=True, exist_ok=True)
        directory = Path(tempfile.mkdtemp(prefix="request-", dir=root))
        allowed = {".pdf", ".docx"} if feature in {"splitter", "watermark"} else ALLOWED_CONVERTER_EXTENSIONS
        paths = []
        size = 0
        for index, upload in enumerate(files):
            ext = validate_file_extension(upload.filename or "", allowed)
            content = await validate_and_read_upload(upload, ext)
            size += len(content)
            if size > settings.MAX_TOTAL_UPLOAD_MB * 1024 * 1024:
                raise HTTPException(413, "Ukuran total berkas melebihi batas.")
            path = directory / f"input-{index}{ext}"
            path.write_bytes(content)
            paths.append(path)
        task = asyncio.create_task(process_files(feature, paths, directory, output_format, split_mode,
                                                page_range, chunk_size, watermark_text, password))
        try:
            output = await asyncio.shield(task)
        except asyncio.CancelledError:
            await task
            raise
        return TemporaryDownload(output, directory)
    except BaseException as error:
        if directory is not None:
            await asyncio.to_thread(shutil.rmtree, directory, True)
        if isinstance(error, Exception) and not isinstance(error, HTTPException):
            raise HTTPException(422, "Berkas tidak dapat diproses. Periksa format dan isi dokumen.") from None
        raise
    finally:
        job_semaphore.release()
