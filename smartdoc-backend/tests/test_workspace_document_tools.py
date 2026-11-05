"""Stored document processing, metadata and ownership use a disposable database."""
import io
import uuid
import zipfile
from pathlib import Path

import pytest
from pypdf import PdfReader, PdfWriter
from sqlalchemy import select

from app.core.config import settings
from app.db.base import AsyncSessionLocal
from app.models.document import Document
from app.models.workspace import WorkspaceItem
from test_cookie_workspace import accounts, client, login, mutate


def pdf_bytes(width=300):
    writer = PdfWriter()
    for _ in range(3):
        writer.add_blank_page(width=width, height=400)
    stream = io.BytesIO()
    writer.write(stream)
    return stream.getvalue()


async def upload(c, name="source.pdf", width=300):
    response = await c.post("/api/workspace/documents", headers={"x-csrf-token": c.cookies.get("smartdoc_csrf")},
                            files={"file": (name, pdf_bytes(width), "application/pdf")})
    assert response.status_code == 201, response.text
    return response.json()["data"]["id"]


async def post(c, path, data):
    return await c.post(path, data=data, headers={"x-csrf-token": c.cookies.get("smartdoc_csrf")})


@pytest.mark.asyncio
async def test_document_detail_and_page_preview_are_private(accounts):
    (owner, other, _), _sent = accounts
    async with await client() as c, await client() as outsider, await client() as guest:
        await login(c, owner)
        await login(outsider, other)
        source_id = await upload(c)
        folder = (await mutate(c, "/api/workspace/folders", {"name": "Kontrak"})).json()["data"]
        assert (await mutate(c, f"/api/workspace/documents/{source_id}/folder", {"folder_id": folder["id"]}, method="PATCH")).status_code == 200
        async with AsyncSessionLocal() as db:
            db.add(WorkspaceItem(id=uuid.uuid4(), user_id=owner.id, title="Review kontrak", kind="task", document_ids=[source_id]))
            db.add(WorkspaceItem(id=uuid.uuid4(), user_id=other.id, title="Other account private task", kind="task", document_ids=[source_id]))
            await db.commit()
        detail = (await c.get(f"/api/workspace/documents/{source_id}")).json()["data"]
        assert detail["folder_name"] == "Kontrak" and detail["format"] == "pdf"
        assert detail["size"] == len(pdf_bytes()) and detail["download_available"]
        assert [item["title"] for item in detail["related_items"]] == ["Review kontrak"]
        preview = await post(c, "/api/documents/first-page-preview", {"source_document_id": source_id, "page": 2})
        assert preview.status_code == 200, preview.text
        assert preview.json()["data"]["total_pages"] == 3
        assert preview.json()["data"]["thumbnail"].startswith("data:image/png;base64,")
        assert (await post(c, "/api/documents/first-page-preview", {"source_document_id": source_id, "page": 4})).status_code == 422
        assert (await outsider.get(f"/api/workspace/documents/{source_id}")).status_code == 404
        assert (await guest.get(f"/api/workspace/documents/{source_id}")).status_code == 401
        assert (await post(outsider, "/api/documents/first-page-preview", {"source_document_id": source_id})).status_code == 404


@pytest.mark.asyncio
@pytest.mark.parametrize("tool,options", [
    ("converter", {"output_format": "png"}),
    ("compressor", {}),
    ("splitter", {"split_mode": "extract_range", "range_expression": "2"}),
    ("watermark", {"watermark_text": "DRAFT"}),
    ("merger", {"merge_mode": "insert", "insert_position": "custom", "after_page": "1"}),
])
async def test_all_tools_process_saved_sources_without_altering_the_original(accounts, tool, options):
    (owner, other, _), _sent = accounts
    async with await client() as c, await client() as outsider:
        await login(c, owner)
        await login(outsider, other)
        source_id = await upload(c)
        data = {**options, "source_document_id": source_id, "save_to_workspace": "true"}
        if tool == "merger":
            data["source_document_ids"] = await upload(c, "insert.pdf", 500)
        before = (await c.get(f"/api/documents/{source_id}/download")).content
        # Display-name changes must not override the stored file's real format.
        assert (await mutate(c, f"/api/documents/{source_id}", {"custom_name": "Renamed source.txt"}, method="PATCH")).status_code == 200
        assert (await post(outsider, f"/api/{tool}/process", data)).status_code == 404
        response = await post(c, f"/api/{tool}/process", data)
        assert response.status_code == 202, response.text
        result_id = response.json()["data"]["document_id"]
        assert result_id != source_id
        result = (await c.get(f"/api/documents/{result_id}")).json()["data"]
        assert result["status"] == "done" and result["is_saved"], result
        downloaded = await c.get(f"/api/documents/{result_id}/download")
        assert downloaded.status_code == 200
        if tool == "converter":
            with zipfile.ZipFile(io.BytesIO(downloaded.content)) as archive:
                assert len(archive.namelist()) == 3
        else:
            pages = PdfReader(io.BytesIO(downloaded.content)).pages
            assert len(pages) == (1 if tool == "splitter" else 6 if tool == "merger" else 3)
            if tool == "merger":
                assert [int(page.mediabox.width) for page in pages] == [300, 500, 500, 500, 300, 300]
        assert (await c.get(f"/api/documents/{source_id}/download")).content == before
        assert (await outsider.get(f"/api/documents/{result_id}")).status_code == 404


@pytest.mark.asyncio
async def test_unavailable_or_unsaved_sources_cannot_start_jobs(accounts):
    (owner, _, _), _sent = accounts
    async with await client() as c:
        await login(c, owner)
        source_id = await upload(c)
        async with AsyncSessionLocal() as db:
            source = await db.get(Document, uuid.UUID(source_id))
            source.is_saved = False
            await db.commit()
        assert (await post(c, "/api/compressor/process", {"source_document_id": source_id})).status_code == 410
        assert (await post(c, "/api/compressor/process", {"source_document_id": str(uuid.uuid4())})).status_code == 404
        assert (await post(c, "/api/compressor/process", {"source_document_id": "../../private.pdf"})).status_code == 422
        async with AsyncSessionLocal() as db:
            rows = (await db.execute(select(Document).where(Document.user_id == owner.id))).scalars().all()
            assert len(rows) == 1


@pytest.mark.asyncio
async def test_failed_processing_does_not_delete_saved_source(accounts):
    (owner, _, _), _sent = accounts
    async with await client() as c:
        await login(c, owner)
        source_id = await upload(c)
        original = (await c.get(f"/api/documents/{source_id}/download")).content
        response = await post(c, "/api/splitter/process", {"source_document_id": source_id, "split_mode": "extract_range", "range_expression": "99"})
        assert response.status_code == 202
        result_id = response.json()["data"]["document_id"]
        assert (await c.get(f"/api/documents/{result_id}")).json()["data"]["status"] == "failed"
        assert (await c.get(f"/api/documents/{source_id}/download")).content == original
