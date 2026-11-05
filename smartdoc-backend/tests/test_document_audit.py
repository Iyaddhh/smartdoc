import uuid
import pytest
from app.db.base import AsyncSessionLocal
from app.models.document import Document
from app.models.user import User
from app.services.document_audit import record_document_activity
from test_cookie_workspace import accounts, client, login, mutate
from test_workspace_document_tools import upload, post


@pytest.mark.asyncio
async def test_activity_is_private_paginated_and_survives_file_delete(accounts):
    users, _ = accounts
    async with await client() as c, await client() as outsider, await client() as guest:
        await login(c, users[0])
        doc = await upload(c, "private-secret-name.pdf")
        await mutate(c, f"/api/documents/{doc}", {"custom_name": "private-new-name.pdf"}, method="PATCH")
        folder = (await mutate(c, "/api/workspace/folders", {"name": "private-folder"})).json()["data"]["id"]
        await mutate(c, f"/api/workspace/documents/{doc}/folder", {"folder_id": folder}, method="PATCH")
        await mutate(c, f"/api/documents/{doc}", method="DELETE")
        path = f"/api/documents/{doc}/activity"
        response = await c.get(path)
        data = response.json()["data"]
        assert [row["action"] for row in data["items"]] == ["deleted", "moved", "renamed", "uploaded"]
        assert "private-" not in response.text
        assert all(set(row) == {"id", "document_id", "actor_id", "action", "outcome", "code", "created_at"} for row in data["items"])
        assert (await c.get(path + "?limit=2&page=2")).json()["data"]["items"] == data["items"][2:]
        assert (await guest.get(path)).status_code == 401
        for user in users[1:]:
            await login(outsider, user)
            assert (await outsider.get(path)).status_code == 404
        async with AsyncSessionLocal() as db:
            document = await db.get(Document, uuid.UUID(doc))
            record_document_activity(db, document, "renamed")
            await db.flush()
            await db.rollback()
        assert (await c.get(path)).json()["data"]["total"] == 4
        batch = [await upload(c, "one.pdf"), await upload(c, "two.pdf")]
        assert (await mutate(c, "/api/documents/batch-delete", {"ids": batch})).status_code == 200
        for deleted_id in batch:
            events = (await c.get(f"/api/documents/{deleted_id}/activity")).json()["data"]["items"]
            assert [event["action"] for event in events] == ["deleted", "uploaded"]


@pytest.mark.asyncio
async def test_processing_success_failure_and_save_audit(accounts):
    users, _ = accounts
    async with await client() as c:
        await login(c, users[0])
        source = await upload(c)
        for page, expected in [("1", "success"), ("99", "failed")]:
            response = await post(c, "/api/splitter/process", {"source_document_id": source,
                "split_mode": "extract_range", "range_expression": page, "save_to_workspace": "true"})
            assert response.status_code == 202, response.text
            doc = response.json()["data"]["document_id"]
            rows = (await c.get(f"/api/documents/{doc}/activity")).json()["data"]["items"]
            actions = {row["action"] for row in rows}
            assert {"process_queued", "process_started", "process_finished"} <= actions
            finished = next(row for row in rows if row["action"] == "process_finished")
            assert finished["outcome"] == expected
            if expected == "success":
                assert "saved" in actions
            else:
                assert finished["code"] == "PROCESS_FAILED" and finished["actor_id"] is None
        async with AsyncSessionLocal() as db:
            document = await db.get(Document, uuid.UUID(source))
            with pytest.raises(ValueError):
                record_document_activity(db, document, "renamed", code="password-secret")


@pytest.mark.asyncio
async def test_quota_failure_is_audited_without_losing_temporary_result(accounts):
    users, _ = accounts
    async with await client() as c:
        await login(c, users[0])
        source = await upload(c)
        async with AsyncSessionLocal() as db:
            owner = await db.get(User, users[0].id)
            owner.storage_quota_mb = 1
            document = await db.get(Document, uuid.UUID(source))
            document.stored_size_bytes = 1024 * 1024  # Full quota fixture.
            await db.commit()
        response = await post(c, "/api/splitter/process", {"source_document_id": source,
            "split_mode": "extract_range", "range_expression": "1", "save_to_workspace": "true"})
        assert response.status_code == 202, response.text
        doc = response.json()["data"]["document_id"]
        assert (await c.get(f"/api/documents/{doc}/download")).status_code == 200
        assert (await mutate(c, f"/api/documents/{doc}/save")).status_code == 413
        rows = (await c.get(f"/api/documents/{doc}/activity")).json()["data"]["items"]
        failures = [row for row in rows if row["action"] == "saved"]
        assert len(failures) == 2
        assert all(row["outcome"] == "failed" and row["code"] == "QUOTA_EXCEEDED" for row in failures)
        assert (await c.get(f"/api/documents/{doc}/download")).status_code == 200
