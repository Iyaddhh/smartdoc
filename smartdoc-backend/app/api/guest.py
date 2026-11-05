"""Public tools: transient files only; no Document, Job, or database dependency."""
import asyncio
import base64
from io import BytesIO
import shutil
import tempfile
import zipfile
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from starlette.responses import FileResponse, JSONResponse
from slowapi.util import get_remote_address
from pypdf import PdfReader

from app.core.workers import run_sync, run_engine
from app.core.page_ranges import parse_page_ranges
from app.core.config import settings
from app.core.uploads import stage_pptx_upload
from app.core.concurrency import job_semaphore, preview_capacity
from app.core.limiter import limiter
from app.core.validators import ALLOWED_CONVERTER_EXTENSIONS, validate_and_read_upload, validate_file_extension, validate_pdf_pages
from app.services.converter import async_convert_office_to_pdf, images_to_pdf, pdf_to_images, pdf_to_word
from app.services.compressor import async_compress_pdf, async_compress_png, compress_jpg, compress_docx, compress_xlsx, compress_pptx
from app.services.merger.pdf import merge_documents, insert_document
from app.services.pdf_rendering import render_pdf_page
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


async def working_pdf(path: Path) -> Path:
    if path.suffix == ".pdf":
        return path
    target = path.with_suffix(".pdf")
    if path.suffix in {".jpg", ".jpeg", ".png"}:
        success = await run_engine(images_to_pdf, [str(path)], str(target))
    else:
        success = await async_convert_office_to_pdf(str(path), str(target))
    if not success or not target.is_file():
        raise HTTPException(422, "Dokumen tidak dapat diubah menjadi PDF.")
    await run_engine(validate_pdf_pages, str(target))
    return target


async def process_files(feature: str, paths: list[Path], directory: Path, output_format: str,
                        split_mode: str, page_range: str, chunk_size: int,
                        watermark_text: str, password: str, merge_mode: str = "combine",
                        insert_position: str = "end", after_page: int = 1,
                        opacity: float = 0.25, angle: float = 45, font_size: int = 44,
                        color_hex: str = "#64748b") -> Path:
    first = paths[0]
    target = directory / "hasil.pdf"
    success = False
    if feature == "converter":
        if output_format == "pdf" and all(p.suffix in {".jpg", ".jpeg", ".png"} for p in paths):
            success = await run_engine(images_to_pdf, [str(p) for p in paths], str(target))
        elif first.suffix in {".docx", ".xlsx", ".pptx"} and output_format == "pdf":
            success = await async_convert_office_to_pdf(str(first), str(target))
        elif first.suffix == ".pdf" and output_format == "docx":
            target = directory / "hasil.docx"
            success = await run_engine(pdf_to_word, str(first), str(target))
        elif first.suffix == ".pdf" and output_format in {"jpg", "png"}:
            pages = await run_engine(pdf_to_images, str(first), str(directory / "pages"), output_format)
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
            await run_engine(engine, str(first), str(target), settings.COMPRESSION_IMAGE_QUALITY)
        # Some engines return False for an unchanged but valid copy.
        success = target.is_file() and target.stat().st_size > 0
    else:
        pdfs = [await working_pdf(path) for path in paths]
        total_pages = await run_sync(lambda: sum(len(PdfReader(p).pages) for p in pdfs))
        if total_pages > settings.MAX_PDF_PAGES:
            raise HTTPException(413, "Total halaman melebihi batas pemrosesan.")
        if feature == "merger":
            if merge_mode == "insert":
                main_pages = await run_sync(lambda: len(PdfReader(pdfs[0]).pages))
                if insert_position == "custom" and after_page > main_pages:
                    raise HTTPException(422, "Posisi sisipan di luar jumlah halaman dokumen utama.")
                success = await run_engine(insert_document, str(pdfs[0]), str(pdfs[1]), str(target),
                                         insert_position, after_page)
            else:
                success = await run_engine(merge_documents, [str(p) for p in pdfs], str(target))
        elif feature == "splitter":
            if split_mode == "range":
                try:
                    indices = parse_page_ranges(page_range, total_pages)
                except ValueError as error:
                    raise HTTPException(422, str(error)) from error
                success = await run_engine(extract_pages_to_pdf, str(pdfs[0]), sorted(indices), str(target))
                if success and output_format == "docx":
                    word_target = directory / "hasil.docx"
                    success = await run_engine(pdf_to_word, str(target), str(word_target))
                    target = word_target
            else:
                target = directory / "hasil.zip"
                if split_mode == "all":
                    success = await run_engine(split_all_single_pages, str(pdfs[0]), str(target), "halaman")
                else:
                    success = await run_engine(split_pdf_by_chunks, str(pdfs[0]), chunk_size, str(target), "bagian")
        elif feature == "watermark":
            if not watermark_text.strip() and not password:
                raise HTTPException(422, "Isi teks watermark atau kata sandi.")
            success = await run_engine(apply_watermark_and_security, str(pdfs[0]), str(target), False,
                                     watermark_text or None, opacity, angle, font_size, color_hex, password or None)
    if not success or not target.is_file() or target.stat().st_size == 0:
        raise HTTPException(422, "Berkas gagal diproses. Periksa format dan isi dokumen.")
    if target.suffix == ".pdf" and not (feature == "watermark" and password):
        await run_engine(validate_pdf_pages, str(target))
    return target


def preview_pdf(path: Path) -> dict:
    count = validate_pdf_pages(str(path))
    thumbnails = []
    for index in range(min(count, 50)):
        page = render_pdf_page(str(path), index, 60)
        try:
            buffer = BytesIO()
            page.save(buffer, format="JPEG", quality=65)
            thumbnails.append("data:image/jpeg;base64," + base64.b64encode(buffer.getvalue()).decode("ascii"))
        finally:
            page.close()
    return {"thumbnail": thumbnails[0] if thumbnails else "", "thumbnails": thumbnails, "total_pages": count}


@router.post("/preview", dependencies=[Depends(preview_capacity)])
@limiter.shared_limit(settings.PREVIEW_RATE_LIMIT, scope="guest-preview", key_func=get_remote_address, override_defaults=False)
async def guest_preview(request: Request, file: UploadFile = File(...)):
    ext = validate_file_extension(file.filename or "", ALLOWED_CONVERTER_EXTENSIONS)
    content = await validate_and_read_upload(file, ext)
    root = Path(settings.STORAGE_PATH) / "temp" / "guest"
    root.mkdir(parents=True, exist_ok=True)
    directory = Path(tempfile.mkdtemp(prefix="request-", dir=root))

    async def render():
        path = directory / f"preview{ext}"
        path.write_bytes(content)
        pdf = await working_pdf(path)
        return await run_sync(preview_pdf, pdf)

    task = asyncio.create_task(render())
    try:
        try:
            data = await asyncio.shield(task)
        except asyncio.CancelledError:
            await task
            raise
        return JSONResponse({"success": True, "data": {**data, "filename": file.filename}},
                            headers={"Cache-Control": "no-store"})
    except Exception as error:
        if isinstance(error, HTTPException):
            raise
        raise HTTPException(422, "Pratinjau tidak dapat dibuat. Periksa format dan isi dokumen.") from None
    finally:
        await asyncio.to_thread(shutil.rmtree, directory, True)


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
    merge_mode: Literal["combine", "insert"] = Form("combine"),
    insert_position: Literal["start", "end", "custom"] = Form("end"),
    after_page: int = Form(1, ge=1),
    opacity: float = Form(0.25, ge=0, le=1),
    angle: float = Form(45, ge=-360, le=360),
    font_size: int = Form(44, ge=1, le=300),
    color_hex: str = Form("#64748b", pattern=r"^#[0-9a-fA-F]{6}$"),
):
    if not 1 <= len(files) <= settings.MAX_UPLOAD_FILES:
        raise HTTPException(400, "Jumlah berkas tidak valid.")
    if feature == "merger" and len(files) < 2:
        raise HTTPException(400, "Pilih minimal dua berkas.")
    if feature == "merger" and merge_mode == "insert" and len(files) != 2:
        raise HTTPException(400, "Mode sisipkan menerima dokumen utama dan satu dokumen sisipan.")
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
            path = directory / f"input-{index}{ext}"
            max_total_bytes = (settings.get_max_size_for_extension(ext)
                               if feature == "compressor" and ext == ".pptx"
                               else settings.MAX_TOTAL_UPLOAD_MB * 1024 * 1024)
            if feature == "compressor" and ext == ".pptx":
                size += await stage_pptx_upload(upload, path, max_total_bytes - size)
            else:
                content = await validate_and_read_upload(upload, ext, max_total_bytes - size)
                size += len(content)
                await run_sync(path.write_bytes, content)
                del content
            paths.append(path)
        task = asyncio.create_task(process_files(feature, paths, directory, output_format, split_mode,
                                                page_range, chunk_size, watermark_text, password,
                                                merge_mode, insert_position, after_page, opacity, angle, font_size, color_hex))
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
