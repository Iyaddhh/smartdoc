"""Endpoint contracts with database dependencies replaced for isolation."""
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from app.main import app
from app.core.security import get_current_user
from app.db.base import get_db


@pytest_asyncio.fixture
async def isolated_client():
    user = SimpleNamespace(id=uuid4())
    db = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = None
    db.execute.return_value = result

    async def database():
        yield db

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = database
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            yield client, db, user
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_job_lookup_filters_owner(isolated_client):
    client, db, user = isolated_client
    response = await client.get(f"/api/jobs/{uuid4()}")
    assert response.status_code == 404
    statement = db.execute.call_args.args[0]
    assert "documents.user_id" in str(statement)
    assert user.id in statement.compile().params.values()


@pytest.mark.asyncio
@pytest.mark.parametrize("path,data", [
    ("splitter", {"split_mode": "unknown"}),
    ("splitter", {"split_mode": "fixed_interval", "chunk_size": "0"}),
    ("watermark", {"opacity": "2"}),
    ("watermark", {"color_hex": "invalid"}),
])
async def test_invalid_options_rejected_before_processing(isolated_client, path, data):
    client, db, _ = isolated_client
    response = await client.post(f"/api/{path}/process", data=data, files={"file": ("sample.pdf", b"%PDF-1.4", "application/pdf")})
    assert response.status_code == 422
    db.add.assert_not_called()


@pytest.mark.asyncio
async def test_unsupported_conversion_rejected_before_job(isolated_client):
    client, db, _ = isolated_client
    response = await client.post("/api/converter/process", data={"output_format": "xlsx"}, files={"file": ("sample.pdf", b"%PDF-1.4", "application/pdf")})
    assert response.status_code == 400
    db.add.assert_not_called()


def test_openapi_processing_status_and_removed_routes():
    paths = app.openapi()["paths"]
    for feature in ("converter", "compressor", "splitter", "merger", "watermark"):
        assert "202" in paths[f"/api/{feature}/process"]["post"]["responses"]
    assert not any("templates" in path or "ocr" in path for path in paths)
