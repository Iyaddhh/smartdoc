import io
from pathlib import Path
import zipfile

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from PIL import Image
from pypdf import PdfReader, PdfWriter

from app.main import app
from app.core.config import settings
from app.db.base import get_db
from app.api.guest import TemporaryDownload, clean_guest_orphans


def pdf_bytes():
    writer = PdfWriter()
    writer.add_blank_page(width=300, height=300)
    writer.add_blank_page(width=300, height=300)
    result = io.BytesIO()
    writer.write(result)
    return result.getvalue()


@pytest_asyncio.fixture
async def public_client(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "STORAGE_PATH", str(tmp_path))

    async def forbidden_database():
        raise AssertionError("Guest tools must not access database/history")

    app.dependency_overrides[get_db] = forbidden_database
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            yield client, tmp_path
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
@pytest.mark.parametrize("feature,data,count", [
    ("merger", {}, 2),
    ("splitter", {"page_range": "1"}, 1),
    ("splitter", {"split_mode": "all"}, 1),
    ("watermark", {"watermark_text": "DRAFT"}, 1),
    ("watermark", {"password": "test-password"}, 1),
])
async def test_public_pdf_tools_without_history(public_client, feature, data, count):
    client, root = public_client
    response = await client.post(f"/api/guest/{feature}", data=data,
                                files=[("files", (f"test-{i}.pdf", pdf_bytes(), "application/pdf")) for i in range(count)])
    assert response.status_code == 200, response.text[:300]
    assert response.headers["cache-control"] == "no-store"
    if data.get("split_mode") == "all":
        with zipfile.ZipFile(io.BytesIO(response.content)) as output:
            assert len(output.namelist()) == 2
    else:
        reader = PdfReader(io.BytesIO(response.content))
        if data.get("password"):
            assert reader.is_encrypted
            assert reader.decrypt("test-password")
        assert len(reader.pages) == (4 if feature == "merger" else 1 if feature == "splitter" else 2)
    assert list((root / "temp" / "guest").iterdir()) == []
    assert not (root / "documents").exists()


@pytest.mark.asyncio
async def test_public_image_converter(public_client):
    client, root = public_client
    image = io.BytesIO()
    Image.new("RGB", (30, 30), "red").save(image, "JPEG")
    response = await client.post("/api/guest/converter", data={"output_format": "pdf"},
                                files={"files": ("image.jpg", image.getvalue(), "image/jpeg")})
    assert response.status_code == 200
    assert len(PdfReader(io.BytesIO(response.content)).pages) == 1
    assert list((root / "temp" / "guest").iterdir()) == []


@pytest.mark.asyncio
async def test_public_compressor(public_client):
    client, root = public_client
    image = io.BytesIO()
    Image.new("RGB", (30, 30), "red").save(image, "JPEG")
    response = await client.post("/api/guest/compressor", files={"files": ("image.jpg", image.getvalue(), "image/jpeg")})
    assert response.status_code == 200
    with Image.open(io.BytesIO(response.content)) as output:
        assert output.size == (30, 30)
    assert list((root / "temp" / "guest").iterdir()) == []


@pytest.mark.asyncio
async def test_failed_upload_and_invalid_range_are_cleaned(public_client):
    client, root = public_client
    response = await client.post("/api/guest/merger", files=[
        ("files", ("valid.pdf", pdf_bytes(), "application/pdf")),
        ("files", ("invalid.pdf", b"not a pdf", "application/pdf")),
    ])
    assert response.status_code == 400
    assert list((root / "temp" / "guest").iterdir()) == []
    response = await client.post("/api/guest/splitter", data={"page_range": "1,bad"},
                                files={"files": ("test.pdf", pdf_bytes(), "application/pdf")})
    assert response.status_code == 422
    assert list((root / "temp" / "guest").iterdir()) == []


def test_startup_removes_orphan_guest_uploads(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "STORAGE_PATH", str(tmp_path))
    orphan = tmp_path / "temp" / "guest" / "request-crash"
    orphan.mkdir(parents=True)
    (orphan / "private.pdf").write_bytes(pdf_bytes())
    clean_guest_orphans()
    assert not orphan.exists()


@pytest.mark.asyncio
async def test_disconnect_still_cleans_download_directory(tmp_path):
    output = tmp_path / "result.pdf"
    output.write_bytes(pdf_bytes())
    response = TemporaryDownload(output, tmp_path)

    async def disconnected_send(message):
        raise RuntimeError("Client disconnected")

    async def receive():
        return {"type": "http.disconnect"}

    with pytest.raises(RuntimeError):
        await response({"type": "http", "method": "GET", "headers": []}, receive, disconnected_send)
    assert not tmp_path.exists()
