"""Integration checks use the disposable database created by run_tests.py."""
import io
import uuid
from urllib.parse import urlparse, parse_qs
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from pypdf import PdfWriter
from sqlalchemy import select
from app.main import app
from app.db.base import AsyncSessionLocal
from app.core.config import settings
from app.core.security import hash_password
from app.models.user import User
from app.models.auth_session import AuthActionToken, AuthSession


@pytest_asyncio.fixture
async def accounts(monkeypatch):
    assert "/smartdoc_test_" in settings.DATABASE_URL, "Run via python run_tests.py to protect local data"
    sent = []
    monkeypatch.setattr("app.api.auth.send_auth_mail", lambda email, subject, url: sent.append((email,subject,url)))
    rows = []
    async with AsyncSessionLocal() as db:
        for role in ("user", "user", "admin"):
            user = User(id=uuid.uuid4(), username="test_"+uuid.uuid4().hex[:20], email=uuid.uuid4().hex+"@example.com",
                        hashed_password=hash_password("test-password"), role=role, email_verified=True, is_active=True)
            db.add(user); rows.append(user)
        await db.commit()
    yield rows, sent


async def client():
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def mutate(c, path, data=None, method="POST", **kwargs):
    if not c.cookies.get("smartdoc_csrf"):
        await c.get("/api/auth/csrf")
    return await c.request(method, path, json=data, headers={"x-csrf-token": c.cookies.get("smartdoc_csrf")}, **kwargs)


async def login(c, account, remember=False):
    path = "/api/auth/admin/login" if account.role == "admin" else "/api/auth/login"
    response = await mutate(c,path,{"email":account.email,"password":"test-password","remember_me":remember})
    assert response.status_code == 200, response.text
    return response


@pytest.mark.asyncio
async def test_agenda_category_crud_and_duplicate_names(accounts):
    (owner, other, _), _sent = accounts
    async with await client() as c, await client() as outsider:
        await login(c, owner)
        await login(outsider, other)
        created = await mutate(c, "/api/workspace/categories", {"name": " Pekerjaan ", "color": "#7C3AED"})
        assert created.status_code == 201
        category = created.json()["data"]
        assert category["name"] == "Pekerjaan" and category["color"] == "#7c3aed"
        assert (await c.get("/api/workspace/categories")).json()["data"] == [category]
        assert (await mutate(c, "/api/workspace/categories", {"name": "pekerjaan"})).status_code == 409
        # Names are unique per owner, not across accounts.
        assert (await mutate(outsider, "/api/workspace/categories", {"name": "Pekerjaan"})).status_code == 201
        second = (await mutate(c, "/api/workspace/categories", {"name": "Pribadi"})).json()["data"]
        assert (await mutate(c, "/api/workspace/categories/" + second["id"], {"name": "PEKERJAAN"}, method="PATCH")).status_code == 409
        updated = await mutate(c, "/api/workspace/categories/" + category["id"], {"name": "Belajar", "color": "#16a34a"}, method="PATCH")
        assert updated.status_code == 200 and updated.json()["data"]["name"] == "Belajar"
        assert (await mutate(c, "/api/workspace/categories/" + category["id"], method="DELETE")).status_code == 200
        assert len((await c.get("/api/workspace/categories")).json()["data"]) == 1


@pytest.mark.asyncio
async def test_category_deletion_preserves_tasks_events_and_schedule(accounts):
    (owner, _, _), _sent = accounts
    async with await client() as c:
        await login(c, owner)
        category = (await mutate(c, "/api/workspace/categories", {"name": "Pekerjaan"})).json()["data"]
        ids = []
        for kind in ("task", "event"):
            body = {"kind": kind, "title": kind, "category_id": category["id"], "status": "doing", "priority": "high"}
            if kind == "task":
                body["due_at"] = "2026-11-02T09:00"
            else:
                body.update(starts_at="2026-11-02T23:30", ends_at="2026-11-03T01:15")
            response = await mutate(c, "/api/workspace/items", body)
            assert response.status_code == 201
            ids.append(response.json()["data"]["id"])
        before = (await c.get("/api/workspace/items")).json()["data"]
        assert all(item["category_id"] == category["id"] for item in before)
        assert (await mutate(c, "/api/workspace/categories/" + category["id"], method="DELETE")).status_code == 200
        after = (await c.get("/api/workspace/items")).json()["data"]
        assert {item["id"] for item in after} == set(ids)
        for item, previous in zip(after, before):
            assert item["category_id"] is None
            assert {k: v for k, v in item.items() if k != "category_id"} == {k: v for k, v in previous.items() if k != "category_id"}


@pytest.mark.asyncio
async def test_categories_are_private_even_from_admin(accounts):
    (owner, other, admin), _sent = accounts
    async with await client() as c:
        await login(c, owner)
        category = (await mutate(c, "/api/workspace/categories", {"name": "Rahasia"})).json()["data"]
        for account in (other, admin):
            async with await client() as stranger:
                await login(stranger, account)
                assert (await stranger.get("/api/workspace/categories")).json()["data"] == []
                path = "/api/workspace/categories/" + category["id"]
                assert (await mutate(stranger, path, {"name": "Hijack"}, method="PATCH")).status_code == 404
                assert (await mutate(stranger, path, method="DELETE")).status_code == 404
                assert (await mutate(stranger, "/api/workspace/items", {"kind": "task", "title": "Foreign", "category_id": category["id"]})).status_code == 404
        item = (await mutate(c, "/api/workspace/items", {"kind": "task", "title": "Owned"})).json()["data"]
        assert item["category_id"] is None
        async with await client() as stranger:
            await login(stranger, other)
            foreign = (await mutate(stranger, "/api/workspace/categories", {"name": "Other"})).json()["data"]
        body = {"kind": "task", "title": "Owned", "category_id": foreign["id"]}
        assert (await mutate(c, "/api/workspace/items/" + item["id"], body, method="PUT")).status_code == 404


@pytest.mark.asyncio
@pytest.mark.parametrize("body", [{"name": "   "}, {"name": "x" * 51}, {"name": "Valid", "color": "red"}, {"name": "Valid", "color": "#fff"}])
async def test_category_input_validation(accounts, body):
    (owner, _, _), _sent = accounts
    async with await client() as c:
        assert (await c.get("/api/workspace/categories")).status_code == 401
        await login(c, owner)
        assert (await mutate(c, "/api/workspace/categories", body)).status_code == 422


@pytest.mark.asyncio
async def test_admin_pages_require_admin_and_do_not_expose_secrets(accounts):
    (owner, _, admin), _sent = accounts
    endpoints = ["/api/admin/overview", "/api/admin/users", "/api/admin/jobs", "/api/admin/health", "/api/admin/audit", "/api/admin/settings"]
    async with await client() as guest, await client() as user_client, await client() as admin_client:
        await login(user_client, owner)
        await login(admin_client, admin)
        for endpoint in endpoints:
            assert (await guest.get(endpoint)).status_code == 401
            assert (await user_client.get(endpoint)).status_code == 403
            response = await admin_client.get(endpoint)
            assert response.status_code == 200, response.text
            assert "JWT_ACCESS_SECRET" not in response.text and "DATABASE_URL" not in response.text
            assert settings.JWT_ACCESS_SECRET not in response.text
        service = (await admin_client.get("/api/admin/settings")).json()["data"]
        assert service["editable"] is False
        assert service["privacy"]["admin_document_access"] is False
        assert service["limits"]["max_pages"] == settings.MAX_PDF_PAGES
        assert service["limits"]["pptx_mb"] == 200
        assert service["limits"]["office_mb"] == 35


@pytest.mark.asyncio
async def test_admin_operational_metadata_never_contains_document_or_error_content(accounts):
    from app.core.datetime_utils import utc_now
    from app.models.document import Document
    from app.models.job import Job
    from app.models.admin_audit import AdminAudit
    from datetime import timedelta

    (owner, _, admin), _sent = accounts
    private = "PRIVATE-document-password-" + uuid.uuid4().hex
    doc_id, job_id = uuid.uuid4(), uuid.uuid4()
    now = utc_now()
    async with AsyncSessionLocal() as db:
        db.add(Document(id=doc_id, user_id=owner.id, feature="watermark", custom_name=private + ".pdf",
                        original_file="/private/" + private, original_size=10, status="failed"))
        await db.flush()
        db.add(Job(id=job_id, document_id=doc_id, feature="watermark", status="failed", progress=40,
                   error=private, created_at=now, started_at=now - timedelta(seconds=7), finished_at=now))
        db.add(AdminAudit(id=uuid.uuid4(), actor_id=admin.id, target_id=owner.id, action=private, created_at=now))
        await db.commit()
    async with await client() as c:
        await login(c, admin)
        for endpoint in ["overview", "jobs", "users", "health", "audit", "settings"]:
            response = await c.get("/api/admin/" + endpoint)
            assert response.status_code == 200, response.text
            assert private not in response.text and str(doc_id) not in response.text
        processes = (await c.get("/api/admin/jobs?feature=watermark&status=failed")).json()["data"]
        job = next(row for row in processes["items"] if row["id"] == str(job_id))
        assert set(job) == {"id", "feature", "status", "progress", "created_at", "duration_seconds", "error_code"}
        assert job["error_code"] == "PROCESS_FAILED" and job["duration_seconds"] == 7
        assert processes["total"] >= 1
        overview = (await c.get("/api/admin/overview")).json()["data"]
        assert overview["failed_24h"] >= 1 and overview["scope"] == "workspace"
        assert (await c.get(f"/api/documents/{doc_id}/download")).status_code == 404
        assert (await c.get(f"/api/jobs/{job_id}")).status_code == 404
        assert (await c.get(f"/api/admin/documents/{doc_id}/download")).status_code == 404
        assert (await c.get("/api/admin/jobs?status=invalid")).status_code == 422
        assert (await c.get("/api/admin/jobs?page=0")).status_code == 422


@pytest.mark.asyncio
async def test_admin_account_pagination_and_mutation_audit(accounts):
    (owner, _, admin), _sent = accounts
    async with await client() as c:
        await login(c, admin)
        response = await c.get("/api/admin/users", params={"search": owner.email})
        data = response.json()["data"]
        assert data["total"] == 1 and len(data["items"]) == 1
        assert set(data["items"][0]) == {"id", "email", "role", "is_active", "email_verified", "storage_quota_mb", "storage_used_bytes"}
        response = await mutate(c, f"/api/admin/users/{owner.id}", {"is_active": True, "storage_quota_mb": 123}, method="PATCH")
        assert response.status_code == 200
        assert (await mutate(c, f"/api/admin/users/{admin.id}", {"is_active": False, "storage_quota_mb": 123}, method="PATCH")).status_code == 409
        assert (await mutate(c, f"/api/admin/users/{owner.id}", {"is_active": True, "storage_quota_mb": 1}, method="PATCH")).status_code == 422
        assert (await mutate(c, f"/api/admin/users/{owner.id}/revoke-sessions")).status_code == 200
        entries = (await c.get("/api/admin/audit")).json()["data"]["items"]
        changed = next(row for row in entries if row["target_id"] == str(owner.id) and row["action"] == "account.updated")
        assert changed["is_active"] is True and changed["storage_quota_mb"] == 123
        assert any(row["target_id"] == str(owner.id) and row["action"] == "sessions.revoked" for row in entries)


@pytest.mark.asyncio
async def test_admin_users_are_paginated_in_groups_of_ten(accounts):
    (owner, _, admin), _sent = accounts
    prefix = "pagination_" + uuid.uuid4().hex
    async with AsyncSessionLocal() as db:
        for index in range(11):
            db.add(User(id=uuid.uuid4(), username=f"{prefix}_{index}", email=f"{prefix}_{index}@example.com",
                        hashed_password=owner.hashed_password, role="user", email_verified=True, is_active=True))
        await db.commit()
    async with await client() as c:
        await login(c, admin)
        pages = []
        for page in (1, 2, 3):
            response = await c.get("/api/admin/users", params={"search": prefix, "page": page})
            assert response.status_code == 200
            data = response.json()["data"]
            assert data["total"] == 11 and data["page_size"] == 10 and data["page"] == page
            pages.append({row["id"] for row in data["items"]})
        assert len(pages[0]) == 10 and len(pages[1]) == 1 and not pages[2]
        assert not pages[0].intersection(pages[1]) and len(pages[0] | pages[1]) == 11


@pytest.mark.asyncio
async def test_admin_account_usage_matches_workspace_and_excludes_other_owners(accounts):
    from app.models.document import Document
    from sqlalchemy import delete
    (owner, other, admin), _sent = accounts
    ids = [uuid.uuid4(), uuid.uuid4(), uuid.uuid4()]
    async with AsyncSessionLocal() as db:
        for doc_id, account, original, output in [(ids[0], owner, 20, 10), (ids[1], owner, 30, None), (ids[2], other, 1000, 500)]:
            db.add(Document(id=doc_id, user_id=account.id, feature="upload", original_file="private.pdf", custom_name="Private filename",
                            original_size=original, output_size=output, status="done",
                            is_saved=True, stored_size_bytes=original + (output or 0)))
        await db.commit()
    async with await client() as c, await client() as customer:
        await login(c, admin)
        await login(customer, owner)
        detail = (await c.get(f"/api/admin/users/{owner.id}")).json()["data"]
        listing = (await c.get("/api/admin/users", params={"search": owner.email})).json()["data"]["items"][0]
        summary = (await customer.get("/api/workspace/summary")).json()["data"]
        assert detail["storage_used_bytes"] == listing["storage_used_bytes"] == summary["storage_bytes"] == 60
        assert "Private filename" not in str(detail) and "private.pdf" not in str(detail)
        assert (await c.get(f"/api/admin/users/{admin.id}")).json()["data"]["storage_used_bytes"] == 0
        async with AsyncSessionLocal() as db:
            await db.execute(delete(Document).where(Document.id == ids[0]))
            await db.commit()
        assert (await c.get(f"/api/admin/users/{owner.id}")).json()["data"]["storage_used_bytes"] == 30


@pytest.mark.asyncio
async def test_admin_user_detail_is_private_metadata_with_working_account_actions(accounts):
    from app.models.document import Document
    from app.models.workspace import WorkspaceItem
    (owner, _, admin), _sent = accounts
    secret = "PRIVATE-file-agenda-" + uuid.uuid4().hex
    async with AsyncSessionLocal() as db:
        db.add(Document(id=uuid.uuid4(), user_id=owner.id, feature="upload", original_file=secret + ".pdf", custom_name=secret, original_size=1, status="done"))
        db.add(WorkspaceItem(id=uuid.uuid4(), user_id=owner.id, kind="task", title=secret, description=secret))
        await db.commit()
    path = f"/api/admin/users/{owner.id}"
    async with await client() as guest, await client() as customer, await client() as administrator:
        assert (await guest.get(path)).status_code == 401
        await login(customer, owner)
        assert (await customer.get(path)).status_code == 403
        await login(administrator, admin)
        response = await administrator.get(path)
        assert response.status_code == 200
        data = response.json()["data"]
        assert set(data) == {"id", "email", "display_name", "role", "is_active", "email_verified", "storage_quota_mb", "created_at", "onboarding_complete", "storage_used_bytes"}
        assert data["email"] == owner.email and data["id"] == str(owner.id)
        assert data["created_at"].endswith("Z")
        assert secret not in response.text and owner.hashed_password not in response.text
        assert (await administrator.get(f"/api/admin/users/{uuid.uuid4()}")).status_code == 404
        assert (await administrator.get("/api/admin/users/invalid-id")).status_code == 422
        update = {"is_active": True, "storage_quota_mb": 321}
        assert (await mutate(administrator, path, update, method="PATCH")).status_code == 200
        assert (await administrator.get(path)).json()["data"]["storage_quota_mb"] == 321
        assert (await mutate(administrator, path, {**update, "role": "admin"}, method="PATCH")).status_code == 422
        assert (await mutate(administrator, path + "/revoke-sessions")).status_code == 200
        assert (await customer.get("/api/auth/me")).status_code == 401
        assert (await administrator.get(path)).json()["data"]["is_active"] is True


@pytest.mark.asyncio
async def test_admin_monitor_defaults_to_active_and_limits_history_period(accounts):
    from datetime import timedelta
    from app.core.datetime_utils import utc_now
    from app.models.document import Document
    from app.models.job import Job
    (owner, _, admin), _sent = accounts
    now = utc_now()
    records = [("pending", 15), ("processing", 15), ("done", 0), ("failed", 3), ("done", 30)]
    ids = []
    async with AsyncSessionLocal() as db:
        for status, days in records:
            document_id, job_id = uuid.uuid4(), uuid.uuid4()
            db.add(Document(id=document_id, user_id=owner.id, feature="converter", original_file="owned.pdf", original_size=1, status=status))
            await db.flush()
            db.add(Job(id=job_id, document_id=document_id, feature="converter", status=status, created_at=now - timedelta(days=days)))
            ids.append(str(job_id))
        await db.commit()
    async with await client() as c:
        await login(c, admin)
        async def listed(params):
            response = await c.get("/api/admin/jobs", params={"feature": "converter", **params})
            assert response.status_code == 200
            return {item["id"] for item in response.json()["data"]["items"]}
        assert set(ids[:2]).issubset(await listed({}))
        assert not set(ids[2:]).intersection(await listed({}))
        recent = await listed({"status": "", "period": "24h"})
        assert ids[2] in recent and not {ids[0], ids[1], ids[3], ids[4]}.intersection(recent)
        week = await listed({"status": "", "period": "7d"})
        assert {ids[2], ids[3]}.issubset(week) and ids[4] not in week
        assert set(ids).issubset(await listed({"status": "", "period": "all"}))
        assert (await c.get("/api/admin/jobs?period=invalid")).status_code == 422


@pytest.mark.asyncio
async def test_history_and_workspace_share_owned_document_queries(accounts):
    from app.models.document import Document
    from app.services.documents import list_owned_documents

    (owner, other, _), _sent = accounts
    async with AsyncSessionLocal() as db:
        for account, name, feature in [(owner, "Owned report", "upload"),
                                        (owner, "Other report", "converter"),
                                        (owner, "Legacy report", "ocr"),
                                        (other, "Private report", "upload")]:
            db.add(Document(id=uuid.uuid4(), user_id=account.id, feature=feature,
                            custom_name=name, original_file=name+".pdf", original_size=1, status="done",
                            is_saved=True, stored_size_bytes=1))
        await db.commit()
        total, first = await list_owned_documents(db, owner.id, page=1, limit=1, search=" report ")
        _, second = await list_owned_documents(db, owner.id, page=2, limit=1, search="report")
        assert total == 2 and first[0].id != second[0].id
    async with await client() as c:
        await login(c, owner)
        history = (await c.get("/api/documents?search=report")).json()["data"]
        workspace = (await c.get("/api/workspace/documents?search=report")).json()["data"]
        assert history["total_items"] == workspace["total"] == 2
        assert {row["id"] for row in history["items"]} == {row["id"] for row in workspace["items"]}
        assert {row["name"] for row in workspace["items"]} == {"Owned report", "Other report"}


@pytest.mark.asyncio
async def test_registration_verification_and_reset(accounts):
    _, sent = accounts
    email = uuid.uuid4().hex+"@example.com"
    async with await client() as c:
        response = await mutate(c,"/api/auth/register",{"email":email,"password":"test-password","confirm_password":"test-password","accept_terms":True})
        assert response.status_code == 201
        token = parse_qs(urlparse(sent[-1][2]).query)["token"][0]
        async with AsyncSessionLocal() as db:
            action = (await db.execute(select(AuthActionToken).where(AuthActionToken.purpose=="verify").order_by(AuthActionToken.expires_at.desc()))).scalars().first()
            assert action.token_hash != token and len(action.token_hash)==64
        assert (await mutate(c,"/api/auth/login",{"email":email,"password":"test-password"})).status_code == 403
        response = await mutate(c,"/api/auth/verify-email",{"token":token})
        assert response.status_code==200
        assert "access_token" not in response.text
        assert any("smartdoc_access=" in header and "HttpOnly" in header for header in response.headers.get_list("set-cookie"))
        assert (await c.get("/api/auth/me")).status_code==200
        assert (await mutate(c,"/api/auth/verify-email",{"token":token})).status_code==400
        assert (await mutate(c,"/api/auth/profile",{"display_name":"Nama saya","timezone":"Asia/Jakarta"},method="PATCH")).status_code==200
        assert (await mutate(c,"/api/auth/forgot-password",{"email":email})).status_code==200
        reset = parse_qs(urlparse(sent[-1][2]).query)["token"][0]
        response = await mutate(c,"/api/auth/reset-password",{"token":reset,"password":"new-password"})
        assert response.status_code==200
        assert (await c.get("/api/auth/me")).status_code==401
        assert (await mutate(c,"/api/auth/reset-password",{"token":reset,"password":"new-password"})).status_code==400
        assert (await mutate(c,"/api/auth/login",{"email":email,"password":"test-password"})).status_code==401
        assert (await mutate(c,"/api/auth/login",{"email":email,"password":"new-password"})).status_code==200


@pytest.mark.asyncio
async def test_csrf_rotation_replay_and_logout_all_devices(accounts):
    rows,_ = accounts
    async with await client() as a, await client() as b:
        response = await login(a,rows[0],True)
        assert "Max-Age=259" in ";".join(response.headers.get_list("set-cookie"))  # approx. 30 days
        await login(b,rows[0])
        assert (await a.patch("/api/auth/profile",json={"display_name":"Blocked","timezone":"UTC"})).status_code==403
        assert (await a.post("/api/auth/refresh",headers={"x-csrf-token":a.cookies.get("smartdoc_csrf"),"origin":"https://attacker.invalid"})).status_code==403
        old_refresh, old_csrf = a.cookies.get("smartdoc_refresh"), a.cookies.get("smartdoc_csrf")
        assert (await mutate(a,"/api/auth/refresh")).status_code==200
        assert old_refresh != a.cookies.get("smartdoc_refresh")
        async with await client() as attacker:
            attacker.cookies.set("smartdoc_refresh",old_refresh)
            attacker.cookies.set("smartdoc_csrf",old_csrf)
            assert (await attacker.post("/api/auth/refresh",headers={"x-csrf-token":old_csrf})).status_code==401
        assert (await b.get("/api/auth/me")).status_code==401
        await login(a,rows[0]); await login(b,rows[0])
        assert (await mutate(a,"/api/auth/logout")).status_code==200
        assert (await b.get("/api/auth/me")).status_code==401
        assert (await mutate(b,"/api/auth/refresh")).status_code==401


@pytest.mark.asyncio
async def test_private_documents_calendar_and_admin_boundaries(accounts):
    rows,_ = accounts
    async with await client() as a, await client() as b, await client() as admin:
        await login(a,rows[0]); await login(b,rows[1]); await login(admin,rows[2])
        folder = (await mutate(a,"/api/workspace/folders",{"name":"Kontrak"})).json()["data"]["id"]
        buf=io.BytesIO(); writer=PdfWriter(); writer.add_blank_page(width=200,height=200); writer.write(buf)
        response=await a.post("/api/workspace/documents",data={"folder_id":folder},files={"file":("kontrak.pdf",buf.getvalue(),"application/pdf")},headers={"x-csrf-token":a.cookies.get("smartdoc_csrf")})
        assert response.status_code==201,response.text
        doc=response.json()["data"]["id"]
        assert (await b.get(f"/api/documents/{doc}/download")).status_code==404
        assert (await admin.get(f"/api/documents/{doc}/download")).status_code==404
        task={"kind":"task","title":"Review kontrak","due_at":"2026-11-01T09:00:00","document_ids":[doc]}
        response=await mutate(a,"/api/workspace/items",task)
        assert response.status_code==201,response.text
        item=response.json()["data"]
        assert item["due_at"].startswith("2026-11-01T02:00")
        assert (await mutate(b,"/api/workspace/items",task)).status_code==404
        assert (await mutate(b,f"/api/workspace/items/{item['id']}",method="DELETE")).status_code==404
        invalid_event={"kind":"event","title":"Rapat","starts_at":"2026-11-01T12:00:00","ends_at":"2026-11-01T11:00:00"}
        assert (await mutate(a,"/api/workspace/items",invalid_event)).status_code==422
        invalid_event["ends_at"]="2026-11-01T13:00:00"
        assert (await mutate(a,"/api/workspace/items",invalid_event)).status_code==201
        summary=(await a.get("/api/workspace/summary")).json()["data"]
        assert summary["document_count"]==1 and summary["open_tasks"]==1
        assert (await a.get("/api/admin/users")).status_code==403
        assert (await admin.get("/api/admin/overview")).status_code==200
        response=await mutate(admin,f"/api/admin/users/{rows[0].id}",{"is_active":False,"storage_quota_mb":100},method="PATCH")
        assert response.status_code==200,response.text
        assert (await a.get("/api/workspace/items")).status_code==403
        audit=(await admin.get("/api/admin/audit")).json()["data"]["items"]
        assert any(entry["target_id"]==str(rows[0].id) for entry in audit)
