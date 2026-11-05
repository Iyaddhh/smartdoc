import io
import uuid
import zipfile

import pytest
from app.db.base import AsyncSessionLocal
from app.models.job import Job
from app.services.document_policy import document_scope
from test_cookie_workspace import accounts, client, login, mutate
from test_workspace_document_tools import upload, post


@pytest.mark.asyncio
@pytest.mark.parametrize("outsider_index", [1, 2])
async def test_other_account_and_admin_cannot_access_any_document_path(accounts, outsider_index):
    users, _ = accounts
    async with await client() as owner, await client() as outsider:
        await login(owner, users[0])
        await login(outsider, users[outsider_index])
        document_id = await upload(owner, "private-policy.pdf")
        job_id = uuid.uuid4()
        async with AsyncSessionLocal() as db:
            db.add(Job(id=job_id, document_id=uuid.UUID(document_id), feature="converter", status="done", progress=100))
            await db.commit()
        for path in [f"/api/documents/{document_id}", f"/api/documents/{document_id}/download",
                     f"/api/documents/{document_id}/preview", f"/api/workspace/documents/{document_id}",
                     f"/api/jobs/{job_id}"]:
            assert (await outsider.get(path)).status_code == 404, path
        for path, method, data in [
            (f"/api/documents/{document_id}", "PATCH", {"custom_name": "hijacked.pdf"}),
            (f"/api/documents/{document_id}", "DELETE", None),
            (f"/api/documents/{document_id}/save", "POST", None),
            (f"/api/workspace/documents/{document_id}/folder", "PATCH", {"folder_id": None}),
            ("/api/workspace/items", "POST", {"kind": "task", "title": "Forbidden link", "document_ids": [document_id]}),
        ]:
            assert (await mutate(outsider, path, data, method=method)).status_code == 404, path
        for path in ["/api/documents/first-page-preview", "/api/merger/info", "/api/splitter/info",
                     "/api/converter/process", "/api/compressor/process", "/api/splitter/process",
                     "/api/merger/process", "/api/watermark/process"]:
            response = await post(outsider, path, {"source_document_id": document_id, "output_format": "png"})
            assert response.status_code == 404, (path, response.text)
        for path, key in [("/api/documents?search=private-policy", "items"), ("/api/workspace/documents?search=private-policy", "items")]:
            assert (await outsider.get(path)).json()["data"][key] == []
        assert (await owner.get(f"/api/documents/{document_id}/download")).status_code == 200
        assert (await owner.get(f"/api/documents/{document_id}")).json()["data"]["custom_name"] == "private-policy.pdf"


@pytest.mark.asyncio
async def test_mixed_batch_download_filters_and_delete_is_atomic(accounts):
    users, _ = accounts
    async with await client() as owner, await client() as other:
        await login(owner, users[0])
        await login(other, users[1])
        own_id = await upload(owner, "own.pdf")
        foreign_id = await upload(other, "foreign.pdf")
        response = await mutate(owner, "/api/documents/batch-download", {"ids": [own_id, foreign_id]})
        assert response.status_code == 200
        with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
            assert archive.namelist() == ["own.pdf"]
        response = await mutate(owner, "/api/documents/batch-delete", {"ids": [own_id, foreign_id]})
        assert response.status_code == 404
        assert (await owner.get(f"/api/documents/{own_id}/download")).status_code == 200
        assert (await other.get(f"/api/documents/{foreign_id}/download")).status_code == 200
        assert (await mutate(owner, "/api/documents/batch-download", {"ids": [foreign_id]})).status_code == 404
        assert (await mutate(owner, f"/api/documents/{own_id}", {"custom_name": "renamed.pdf"}, method="PATCH")).status_code == 200
        assert (await mutate(owner, "/api/documents/batch-delete", {"ids": [own_id]})).status_code == 200
        assert (await owner.get(f"/api/documents/{own_id}/download")).status_code == 404


def test_unknown_action_fails_closed():
    with pytest.raises(ValueError):
        document_scope(uuid.uuid4(), "share-publicly")


@pytest.mark.asyncio
async def test_guest_and_revoked_session_cannot_read_private_content(accounts):
    users, _ = accounts
    async with await client() as owner, await client() as second_session, await client() as guest:
        await login(owner, users[0])
        await login(second_session, users[0])
        document_id = await upload(owner)
        paths = ["/api/documents", "/api/workspace/documents", f"/api/documents/{document_id}/download",
                 f"/api/documents/{document_id}/preview", f"/api/workspace/documents/{document_id}"]
        for path in paths:
            assert (await guest.get(path)).status_code == 401
        assert (await second_session.get(paths[2])).status_code == 200
        assert (await mutate(owner, "/api/auth/logout")).status_code == 200
        # This browser still has its old cookies; revocation must be server-side.
        for path in paths:
            assert (await second_session.get(path)).status_code == 401
