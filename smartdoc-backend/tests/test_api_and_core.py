import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.config import settings
from app.core.validators import validate_file_magic_bytes
from fastapi import HTTPException


@pytest.mark.asyncio
async def test_health_check_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"]["status"] == "healthy"
        assert "message" in data


@pytest.mark.asyncio
async def test_root_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "SmartDoc API" in data["data"]["app"]


def test_cors_origins_parsing():
    settings.CORS_ALLOWED_ORIGINS = "http://localhost:3000, http://127.0.0.1:3000 , https://mydomain.com "
    origins = settings.get_cors_origins()
    assert origins == ["http://localhost:3000", "http://127.0.0.1:3000", "https://mydomain.com"]


def test_magic_bytes_valid_and_invalid():
    # Valid PDF magic bytes
    valid_pdf = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF"
    validate_file_magic_bytes(valid_pdf, ".pdf")

    # Invalid fake PDF (text masquerading as pdf)
    fake_pdf = b"Hello, I am a fake text file"
    with pytest.raises(HTTPException) as exc_info:
        validate_file_magic_bytes(fake_pdf, ".pdf")
    assert exc_info.value.status_code == 400

    # Valid PNG magic bytes
    valid_png = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR"
    validate_file_magic_bytes(valid_png, ".png")

    # Invalid PNG
    with pytest.raises(HTTPException) as exc_info_png:
        validate_file_magic_bytes(b"NOT_A_PNG", ".png")
    assert exc_info_png.value.status_code == 400


@pytest.mark.asyncio
async def test_global_exception_handler_format_on_422():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Send empty POST without required multipart fields to trigger 422 RequestValidationError
        response = await client.post("/api/converter/process")
        assert response.status_code == 422
        data = response.json()
        assert data["success"] is False
        assert data["data"] is None
        assert "message" in data
        assert "error" in data


def test_categorized_size_limits_config():
    assert settings.get_max_size_for_extension("docx") == 35 * 1024 * 1024
    assert settings.get_max_size_for_extension("xlsx") == 35 * 1024 * 1024
    assert settings.get_max_size_for_extension("pptx") == 35 * 1024 * 1024
    assert settings.get_max_size_for_extension("pdf") == 35 * 1024 * 1024
    assert settings.get_max_size_for_extension("png") == 12 * 1024 * 1024
    assert settings.get_max_size_for_extension("jpg") == 12 * 1024 * 1024


@pytest.mark.asyncio
async def test_validate_and_read_upload_proves_early_abort_stops_stream():
    """
    Membuktikan secara empiris bahwa Early Abort benar-benar menghentikan pembacaan stream.
    Jika ada stream 50MB diunggah untuk batas 12MB, pembacaan harus berhenti tepat di chunk ke-13 (13MB)
    dan SISA 37MB (chunk 14-50) SAMA SEKALI TIDAK DIBACA ke dalam memori RAM.
    """
    from fastapi import UploadFile
    from app.core.validators import validate_and_read_upload

    chunk_call_count = 0
    total_bytes_streamed = 0
    total_stream_chunks = 50  # 50 MB total stream

    class MockAsyncStream:
        def __init__(self):
            self.remaining_chunks = total_stream_chunks

        async def read(self, size: int = -1):
            nonlocal chunk_call_count, total_bytes_streamed
            if self.remaining_chunks <= 0:
                return b""
            chunk_call_count += 1
            chunk_bytes = min(size if size > 0 else 1024 * 1024, 1024 * 1024)
            total_bytes_streamed += chunk_bytes
            self.remaining_chunks -= 1
            return b"A" * chunk_bytes

    from io import BytesIO
    mock_file = UploadFile(file=BytesIO(), filename="large_photo.png", headers={})
    mock_file.read = MockAsyncStream().read

    with pytest.raises(HTTPException) as exc_info:
        await validate_and_read_upload(mock_file, ".png")

    assert exc_info.value.status_code == 413
    assert "melebihi batas maksimal 12 MB" in exc_info.value.detail

    # BUKTI EMPIRIS EARLY ABORT:
    # 1. Total chunk yang dibaca harus TEPAT 13 (13MB > 12MB limit)
    assert chunk_call_count == 13, f"Expected 13 read calls before abort, got {chunk_call_count}"
    # 2. Total bytes yang sempat dibaca adalah 13 MB (bukan 50 MB)
    assert total_bytes_streamed == 13 * 1024 * 1024, f"Expected 13MB streamed, got {total_bytes_streamed}"


def test_validate_image_dimensions_exceeds_limit_413():
    import io
    from PIL import Image
    from app.core.validators import validate_image_dimensions

    # Create image exceeding 6000px (e.g. 6001 x 100 px)
    img = Image.new("RGB", (6001, 100), color="blue")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    img_bytes = buf.getvalue()

    with pytest.raises(HTTPException) as exc_info:
        validate_image_dimensions(img_bytes, max_dimension=6000)
    assert exc_info.value.status_code == 413
    assert "melebihi batas maksimum 6000px" in exc_info.value.detail

    # Create valid dimension image (e.g. 1920 x 1080 px)
    valid_img = Image.new("RGB", (1920, 1080), color="green")
    valid_buf = io.BytesIO()
    valid_img.save(valid_buf, format="PNG")
    validate_image_dimensions(valid_buf.getvalue(), max_dimension=6000)

