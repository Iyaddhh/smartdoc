"""Regressions for incomplete output, changed content and image format loss."""
import io
import os
import sys
from types import SimpleNamespace

import docx
import pytest
from PIL import Image
from pypdf import PdfReader, PdfWriter

from app.core.config import settings
from app.services.converter.pdf import images_to_pdf, pdf_to_word
from app.services.compressor.image import compress_jpg
from app.services.compressor.office import _compress_image_bytes
from app.services.merger.pdf import merge_documents, insert_document
from app.services.watermark.pdf import create_text_watermark_pdf
from app.services.pdf_rendering import render_pdf_page


def pdf(path, pages=1):
    writer = PdfWriter()
    for _ in range(pages):
        writer.add_blank_page(width=300, height=400)
    with open(path, "wb") as stream:
        writer.write(stream)
    return path.read_bytes()


def test_pdf_to_word_does_not_rewrite_generated_text(tmp_path, monkeypatch):
    text = "A\t\tB\nSoftware Requirements Specification (SRS)\n1.\u200b2\nsoft\u00adhyphen"

    class Converter:
        def __init__(self, _source):
            pass

        def convert(self, target, **_kwargs):
            document = docx.Document()
            document.add_paragraph(text)
            document.save(target)

        def close(self):
            pass

    monkeypatch.setitem(sys.modules, "pdf2docx", SimpleNamespace(Converter=Converter))
    target = tmp_path / "result.docx"
    assert pdf_to_word("source.pdf", str(target))
    assert docx.Document(target).paragraphs[0].text == text


def test_pdf_rendering_works_without_external_poppler(tmp_path, monkeypatch):
    from app.services.converter.pdf import pdf_to_images
    monkeypatch.setenv("PATH", "")
    source = tmp_path / "source.pdf"
    pdf(source, pages=2)
    with render_pdf_page(str(source), 1, 72) as image:
        assert image.size == (300, 400) and image.mode == "RGB"
    paths = pdf_to_images(str(source), str(tmp_path / "images"), "png", 72)
    assert len(paths) == 2
    for path in paths:
        with Image.open(path) as image:
            assert image.size == (300, 400)


def test_pdf_renderer_enforces_pixel_budget(tmp_path, monkeypatch):
    source = tmp_path / "source.pdf"
    pdf(source)
    monkeypatch.setattr(settings, "MAX_TOTAL_IMAGE_PIXELS", 100)
    with pytest.raises(ValueError, match="Dimensi render"):
        render_pdf_page(str(source), 0, 72)


def test_images_to_pdf_preserves_orientation_and_white_transparent_background(tmp_path):
    photo = tmp_path / "photo.jpg"
    exif = Image.Exif()
    exif[274] = 6  # Display rotated 90 degrees clockwise.
    Image.new("RGB", (120, 60), "blue").save(photo, exif=exif)
    transparent = tmp_path / "transparent.png"
    Image.new("RGBA", (40, 40), (0, 0, 0, 0)).save(transparent)
    output = tmp_path / "result.pdf"
    assert images_to_pdf([str(photo), str(transparent)], str(output))
    reader = PdfReader(output)
    assert len(reader.pages) == 2
    assert float(reader.pages[0].mediabox.width) < float(reader.pages[0].mediabox.height)
    background = reader.pages[1].images[0].image.convert("RGB")
    assert min(background.getpixel((20, 20))) >= 250


def test_image_batch_pixel_budget_prevents_processing_oversized_batches(tmp_path, monkeypatch):
    source = tmp_path / "image.png"
    Image.new("RGB", (10, 10)).save(source)
    monkeypatch.setattr(settings, "MAX_TOTAL_IMAGE_PIXELS", 150)
    output = tmp_path / "result.pdf"
    assert not images_to_pdf([str(source), str(source)], str(output))
    assert not output.exists()


def test_jpeg_compression_applies_exif_before_removing_orientation(tmp_path):
    source = tmp_path / "source.jpg"
    exif = Image.Exif()
    exif[274] = 6
    Image.frombytes("RGB", (120, 60), os.urandom(120 * 60 * 3)).save(source, quality=100, exif=exif)
    output = tmp_path / "result.jpg"
    assert compress_jpg(str(source), str(output), quality=60)
    with Image.open(output) as result:
        assert result.size == (60, 120)
        assert result.getexif().get(274, 1) == 1


def test_office_compression_retains_animated_image_format_and_frames():
    stream = io.BytesIO()
    Image.new("RGB", (30, 30), "red").save(stream, format="GIF", save_all=True,
        append_images=[Image.new("RGB", (30, 30), "blue")], duration=100, loop=0)
    original = stream.getvalue()
    result = _compress_image_bytes(original)
    assert result == original
    with Image.open(io.BytesIO(result)) as image:
        assert image.format == "GIF" and image.n_frames == 2


def test_office_jpeg_compression_retains_orientation_metadata():
    stream = io.BytesIO()
    exif = Image.Exif()
    exif[274] = 6
    Image.new("RGB", (120, 60), "blue").save(stream, format="JPEG", exif=exif)
    with Image.open(io.BytesIO(_compress_image_bytes(stream.getvalue()))) as result:
        assert result.format == "JPEG" and result.getexif()[274] == 6


def test_merge_refuses_partial_output_and_combined_page_overflow(tmp_path, monkeypatch):
    source = tmp_path / "source.pdf"
    pdf(source, pages=2)
    output = tmp_path / "result.pdf"
    assert not merge_documents([str(source), str(tmp_path / "missing.pdf")], str(output))
    assert not output.exists()
    monkeypatch.setattr(settings, "MAX_PDF_PAGES", 3)
    assert not merge_documents([str(source), str(source)], str(output))
    assert not output.exists()
    assert not insert_document(str(source), str(source), str(output))


def test_insert_does_not_silently_clamp_invalid_position(tmp_path):
    source = tmp_path / "source.pdf"
    pdf(source, pages=2)
    output = tmp_path / "result.pdf"
    assert not insert_document(str(source), str(source), str(output), "custom", 3)
    assert not output.exists()


@pytest.mark.parametrize("opacity", [0.0, 1.0])
def test_watermark_honors_requested_opacity(opacity):
    data = create_text_watermark_pdf(300, 400, "DRAFT", opacity=opacity)
    states = PdfReader(io.BytesIO(data)).pages[0]["/Resources"].get("/ExtGState", {})
    values = [float(state.get("/ca", 1)) for state in states.values()]
    assert opacity in values or (opacity == 1 and not values)


@pytest.mark.asyncio
async def test_private_insert_rejects_extra_files_before_creating_history(auth_client, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "STORAGE_PATH", str(tmp_path))
    content = pdf(tmp_path / "fixture.pdf")
    result = await auth_client.post("/api/merger/process", data={"merge_mode": "insert"},
        files=[("files", (f"{i}.pdf", content, "application/pdf")) for i in range(3)])
    assert result.status_code == 400
    assert not (tmp_path / "documents").exists()


@pytest.mark.asyncio
@pytest.mark.parametrize("feature,first_name,second_name", [("merger", "first.pdf", "bad.exe"), ("converter", "first.png", "bad.png")])
async def test_rejected_batch_cleans_previously_staged_uploads(auth_client, tmp_path, monkeypatch, feature, first_name, second_name):
    monkeypatch.setattr(settings, "STORAGE_PATH", str(tmp_path))
    if feature == "merger":
        first = pdf(tmp_path / "fixture.pdf")
    else:
        stream = io.BytesIO()
        Image.new("RGB", (10, 10)).save(stream, format="PNG")
        first = stream.getvalue()
    result = await auth_client.post(f"/api/{feature}/process", data={"output_format": "pdf"},
        files=[("files", (first_name, first)), ("files", (second_name, b"not a valid document"))])
    assert result.status_code == 400
    assert list((tmp_path / "work").glob("**/*")) == []


@pytest.mark.asyncio
@pytest.mark.parametrize("feature", ["merger", "converter"])
async def test_private_batch_enforces_total_upload_size(auth_client, tmp_path, monkeypatch, feature):
    monkeypatch.setattr(settings, "STORAGE_PATH", str(tmp_path))
    monkeypatch.setattr(settings, "MAX_TOTAL_UPLOAD_MB", 1)
    stream = io.BytesIO()
    Image.frombytes("RGB", (450, 450), os.urandom(450 * 450 * 3)).save(stream, format="PNG")
    content = stream.getvalue()
    assert len(content) < 1024 * 1024 < len(content) * 2
    result = await auth_client.post(f"/api/{feature}/process", data={"output_format": "pdf"},
        files=[("files", (f"{i}.png", content, "image/png")) for i in range(2)])
    assert result.status_code == 413
    assert list((tmp_path / "work").glob("**/*")) == []


@pytest.mark.asyncio
async def test_private_watermark_requires_an_action(auth_client, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "STORAGE_PATH", str(tmp_path))
    content = pdf(tmp_path / "fixture.pdf")
    result = await auth_client.post("/api/watermark/process", data={"watermark_text": "   "}, files={"file": ("source.pdf", content, "application/pdf")})
    assert result.status_code == 422
    assert not (tmp_path / "documents").exists()


@pytest.mark.asyncio
@pytest.mark.parametrize("feature", ["merger", "splitter"])
async def test_failed_office_preview_does_not_report_fake_page_count(auth_client, tmp_path, monkeypatch, feature):
    monkeypatch.setattr(settings, "STORAGE_PATH", str(tmp_path))

    async def unavailable_engine(*_args):
        return False

    monkeypatch.setattr(f"app.api.{feature}.async_convert_office_to_pdf", unavailable_engine)
    stream = io.BytesIO()
    docx.Document().save(stream)
    response = await auth_client.post(f"/api/{feature}/info", files={"file": ("source.docx", stream.getvalue())})
    assert response.status_code == 422
    assert list((tmp_path / "temp").iterdir()) == []


@pytest.mark.asyncio
@pytest.mark.parametrize("endpoint,expected", [("/api/documents/first-page-preview", 1), ("/api/splitter/info", 3)])
async def test_pdf_previews_render_without_poppler(auth_client, tmp_path, monkeypatch, endpoint, expected):
    monkeypatch.setattr(settings, "STORAGE_PATH", str(tmp_path))
    monkeypatch.setenv("PATH", "")
    content = pdf(tmp_path / "fixture.pdf", pages=3)
    response = await auth_client.post(endpoint, files={"file": ("source.pdf", content, "application/pdf")})
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["total_pages"] == 3
    assert len(data["thumbnails"]) == expected
    assert all(value.startswith("data:image/") and len(value) > 50 for value in data["thumbnails"])
    assert list((tmp_path / "temp").iterdir()) == []
