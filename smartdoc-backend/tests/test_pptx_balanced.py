"""Balanced PPTX compression preserves structure, media metadata and transparency."""
import io
import random
import struct
import zipfile
from copy import copy

import pytest
from PIL import Image
from PIL.PngImagePlugin import PngInfo
from pptx import Presentation
from pptx.util import Inches

from app.core.config import settings
from app.services.compressor.office import compress_pptx
from app.services.compressor.pptx_images import optimize_pptx_image
from test_pptx_preservation import presentation_file


def png_bytes(alpha=False):
    image = Image.frombytes("RGB", (256, 256), bytes(value for y in range(256) for x in range(256) for value in (x, y, (x + y) // 2)))
    if alpha:
        image = image.convert("RGBA")
        image.putalpha(Image.frombytes("L", image.size, bytes(x for _y in range(256) for x in range(256))))
    metadata = PngInfo()
    metadata.add_text("Copyright", "Training image attribution")
    target = io.BytesIO()
    image.save(target, format="PNG", compress_level=0, pnginfo=metadata)
    return target.getvalue()


def balanced_presentation(path):
    presentation_file(path)
    presentation = Presentation(path)
    presentation.slides[0].shapes.add_picture(io.BytesIO(png_bytes(alpha=True)), Inches(1), Inches(4))
    presentation.save(path)
    # The deliberately uncompressed PNG is stored directly so the fixture does
    # not trip the independent ZIP expansion-ratio guard before compression.
    with zipfile.ZipFile(io.BytesIO(path.read_bytes())) as source, zipfile.ZipFile(path, "w") as result:
        for entry in source.infolist():
            output_entry = copy(entry)
            if entry.filename.endswith(".png"):
                output_entry.compress_type = zipfile.ZIP_STORED
            result.writestr(output_entry, source.read(entry))
    return path


@pytest.mark.parametrize("alpha", [False, True])
def test_png_keeps_size_format_metadata_and_exact_transparency(alpha):
    original = png_bytes(alpha)
    optimized = optimize_pptx_image(original, ".png")
    assert len(optimized) < len(original)
    with Image.open(io.BytesIO(original)) as before, Image.open(io.BytesIO(optimized)) as after:
        after.load()
        assert after.format == before.format == "PNG"
        assert after.size == before.size
        assert after.info["Copyright"] == before.info["Copyright"]
        if alpha:
            assert after.getchannel("A").tobytes() == before.getchannel("A").tobytes()


def test_jpeg_keeps_orientation_and_original_app_metadata():
    exif = Image.Exif()
    exif[274] = 6
    target = io.BytesIO()
    Image.new("RGB", (200, 100), "blue").save(target, format="JPEG", quality=100, exif=exif)
    xmp = b"http://ns.adobe.com/xap/1.0/\x00<metadata>Original attribution</metadata>"
    segment = b"\xff\xe1" + struct.pack(">H", len(xmp) + 2) + xmp
    original = target.getvalue()[:2] + segment + target.getvalue()[2:]
    optimized = optimize_pptx_image(original, ".jpeg")
    assert len(optimized) < len(original)
    assert segment in optimized
    with Image.open(io.BytesIO(optimized)) as after:
        after.load()
        assert after.format == "JPEG" and after.size == (200, 100)
        assert after.getexif()[274] == 6


def test_images_with_unsafe_color_loss_animation_or_color_key_stay_unchanged():
    photo = io.BytesIO()
    Image.frombytes("RGB", (128, 128), random.Random(42).randbytes(128 * 128 * 3)).save(photo, format="PNG")
    animation = io.BytesIO()
    Image.new("RGBA", (20, 20), "red").save(animation, format="PNG", save_all=True,
        append_images=[Image.new("RGBA", (20, 20), "blue")], duration=100, loop=0)
    color_key = io.BytesIO()
    Image.new("RGB", (20, 20), "red").save(color_key, format="PNG", transparency=(255, 0, 0))
    for raw in (photo.getvalue(), animation.getvalue(), color_key.getvalue(), b"broken image"):
        assert optimize_pptx_image(raw, ".png") == raw


@pytest.mark.asyncio
@pytest.mark.parametrize("endpoint", ["/api/guest/compressor", "/api/compressor/process"])
async def test_both_compressor_apis_use_balanced_mode_and_keep_all_non_image_parts(auth_client, tmp_path, monkeypatch, endpoint):
    monkeypatch.setattr(settings, "STORAGE_PATH", str(tmp_path / "storage"))
    monkeypatch.setattr(settings, "COMPRESSION_PPTX_MODE", "balanced")
    source = balanced_presentation(tmp_path / "source.pptx")
    original = source.read_bytes()
    response = await auth_client.post(endpoint, files={"files" if "guest" in endpoint else "file": ("slides.pptx", original)})
    if "guest" not in endpoint:
        assert response.status_code == 202, response.text
        data = response.json()["data"]
        job = (await auth_client.get(f"/api/jobs/{data['job_id']}")).json()["data"]
        assert job["status"] == "done" and job["original_size"] == len(original)
        response = await auth_client.get(f"/api/documents/{data['document_id']}/download")
        assert job["output_size"] == len(response.content)
    assert response.status_code == 200
    assert len(response.content) < len(original)
    assert source.read_bytes() == original
    with zipfile.ZipFile(io.BytesIO(original)) as before, zipfile.ZipFile(io.BytesIO(response.content)) as after:
        assert before.namelist() == after.namelist()
        optimized = []
        for name in before.namelist():
            if name.startswith("ppt/media/") and before.read(name) != after.read(name):
                optimized.append(name)
                with Image.open(io.BytesIO(before.read(name))) as first, Image.open(io.BytesIO(after.read(name))) as second:
                    second.load()
                    assert first.size == second.size and first.format == second.format
            else:
                assert before.read(name) == after.read(name), name
        assert any(name.endswith(".png") for name in optimized)
    result = Presentation(io.BytesIO(response.content))
    assert len(result.slides) == 3 and result.slides[1]._element.get("show") == "0"
    for index, slide in enumerate(result.slides):
        assert slide.shapes[0].text == f"Slide {index + 1}: materi pelatihan"
        assert slide.notes_slide.notes_text_frame.text == f"Catatan pembicara {index + 1}"


def test_changed_optimized_image_falls_back_to_original(tmp_path, monkeypatch):
    source = balanced_presentation(tmp_path / "source.pptx")
    original = source.read_bytes()
    target = tmp_path / "result.pptx"
    write_entry = zipfile.ZipFile.writestr
    def corrupt_image(archive, entry, data, **kwargs):
        if entry.filename.startswith("ppt/media/") and entry.filename.endswith(".png"):
            data = b"damaged image"
        return write_entry(archive, entry, data, **kwargs)
    monkeypatch.setattr(zipfile.ZipFile, "writestr", corrupt_image)
    assert compress_pptx(str(source), str(target)) is False
    assert target.read_bytes() == original
