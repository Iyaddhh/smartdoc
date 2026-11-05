"""Session policy and races against disposable PostgreSQL, never user data."""
import asyncio
from datetime import timedelta, timezone
from urllib.parse import parse_qs, urlparse
from uuid import UUID, uuid4

import jwt
import pytest
from sqlalchemy import select, text
from httpx import ASGITransport, AsyncClient

from app.core.auth_cookies import digest
from app.core.config import Settings, settings
from app.core.datetime_utils import utc_now
from app.core.security import create_access_token, decode_access_token, TOKEN_AUDIENCE
from app.db.base import AsyncSessionLocal
from app.models.auth_session import AuthSession
from app.models.user import User
from app.main import app
from test_cookie_workspace import accounts, client, login, mutate


def captured_headers(browser):
    return {"cookie": "; ".join(f"{key}={value}" for key, value in browser.cookies.items()),
            "x-csrf-token": browser.cookies.get("smartdoc_csrf")}


def claims():
    token = create_access_token({"sub": str(uuid4()), "sid": str(uuid4()), "ver": 0})
    return jwt.decode(token, settings.JWT_ACCESS_SECRET, algorithms=["HS256"], audience=TOKEN_AUDIENCE)


@pytest.mark.parametrize("missing", ["exp", "iat", "sub", "ver", "sid", "iss", "aud", "token_use"])
def test_access_claims_are_required(missing):
    payload = claims()
    del payload[missing]
    assert decode_access_token(jwt.encode(payload, settings.JWT_ACCESS_SECRET, algorithm="HS256")) is None


@pytest.mark.parametrize("field,value", [
    ("sid", "not-a-uuid"), ("sid", 123), ("sub", "not-a-uuid"),
    ("ver", True), ("ver", -1), ("ver", "0"),
    ("iss", "another-service"), ("aud", "another-api"), ("aud", [TOKEN_AUDIENCE]),
    ("token_use", "refresh"), ("iat", True), ("exp", "9999999999"),
    ("exp", 1), ("iat", 9999999999),
])
def test_invalid_access_claims_fail_closed(field, value):
    payload = claims()
    payload[field] = value
    assert decode_access_token(jwt.encode(payload, settings.JWT_ACCESS_SECRET, algorithm="HS256")) is None


def test_algorithm_and_signature_cannot_be_selected_by_client():
    payload = claims()
    assert decode_access_token(jwt.encode(payload, settings.JWT_ACCESS_SECRET, algorithm="HS384")) is None
    assert decode_access_token(jwt.encode(payload, "synthetic-wrong-secret-at-least-32-bytes", algorithm="HS256")) is None


def test_production_rejects_insecure_cookies():
    config = Settings(_env_file=None, APP_ENV="production", AUTH_COOKIE_SECURE=False,
                      JWT_ACCESS_SECRET="synthetic-test-secret-with-more-than-32-bytes")
    with pytest.raises(RuntimeError, match="AUTH_COOKIE_SECURE"):
        config.validate_production_security()


@pytest.mark.asyncio
@pytest.mark.parametrize("transport", ["cookie", "bearer"])
@pytest.mark.parametrize("state,expected", [
    ("missing_sid", 401), ("missing_session", 401), ("foreign_session", 401),
    ("revoked", 401), ("expired", 401), ("old_version", 401),
    ("inactive", 403), ("unverified", 403),
])
async def test_cookie_and_bearer_share_session_policy(accounts, transport, state, expected):
    (owner, other, _), _sent = accounts
    async with await client() as browser, await client() as other_browser:
        await login(browser, owner)
        await login(other_browser, other)
        payload = jwt.decode(browser.cookies.get("smartdoc_access"), settings.JWT_ACCESS_SECRET,
                             algorithms=["HS256"], audience=TOKEN_AUDIENCE)
        async with AsyncSessionLocal() as db:
            session = await db.get(AuthSession, UUID(payload["sid"]))
            user = await db.get(User, owner.id)
            if state == "missing_sid":
                del payload["sid"]
            elif state == "missing_session":
                payload["sid"] = str(uuid4())
            elif state == "foreign_session":
                other_session = (await db.execute(select(AuthSession).where(AuthSession.user_id == other.id))).scalar_one()
                payload["sid"] = str(other_session.id)
            elif state == "revoked":
                session.revoked_at = utc_now()
            elif state == "expired":
                session.expires_at = utc_now() - timedelta(seconds=1)
            elif state == "old_version":
                user.token_version += 1
            elif state == "inactive":
                user.is_active = False
            elif state == "unverified":
                user.email_verified = False
            await db.commit()
        token = jwt.encode(payload, settings.JWT_ACCESS_SECRET, algorithm="HS256")
        headers = {"authorization": f"Bearer {token}"} if transport == "bearer" else {"cookie": f"smartdoc_access={token}"}
        async with await client() as requester:
            assert (await requester.get("/api/auth/me", headers=headers)).status_code == expected


@pytest.mark.asyncio
@pytest.mark.parametrize("state", ["anonymous", "unknown", "expired"])
async def test_logout_only_claims_revocation_when_it_happened(accounts, state):
    (owner, _, _), _sent = accounts
    async with await client() as browser, await client() as survivor:
        await login(survivor, owner)
        if state == "expired":
            await login(browser, owner)
            async with AsyncSessionLocal() as db:
                row = (await db.execute(select(AuthSession).where(
                    AuthSession.token_hash == digest(browser.cookies.get("smartdoc_refresh"))))).scalar_one()
                row.expires_at = utc_now() - timedelta(seconds=1)
                await db.commit()
        else:
            if state == "unknown":
                browser.cookies.set("smartdoc_refresh", "unknown-synthetic-refresh-token")
            await browser.get("/api/auth/csrf")
        response = await mutate(browser, "/api/auth/logout")
        assert response.status_code == 200
        assert response.json()["data"] == {"scope": "browser", "revoked": False}
        assert "Seluruh perangkat" not in response.json()["message"]
        assert not browser.cookies.get("smartdoc_access")
        assert (await survivor.get("/api/auth/me")).status_code == 200


@pytest.mark.asyncio
async def test_rotated_refresh_can_logout_all_but_expired_replay_cannot(accounts):
    (owner, _, _), _sent = accounts
    async with await client() as browser, await client() as other, await client() as old_browser:
        await login(browser, owner)
        await login(other, owner)
        old = captured_headers(browser)
        old_hash = digest(browser.cookies.get("smartdoc_refresh"))
        assert (await mutate(browser, "/api/auth/refresh")).status_code == 200
        result = await old_browser.post("/api/auth/logout", headers=old)
        assert result.json()["data"] == {"scope": "account", "revoked": True}
        assert (await browser.get("/api/auth/me")).status_code == 401
        assert (await other.get("/api/auth/me")).status_code == 401
        await login(other, owner)
        async with AsyncSessionLocal() as db:
            session = (await db.execute(select(AuthSession).where(AuthSession.token_hash == old_hash))).scalar_one()
            session.expires_at = utc_now() - timedelta(seconds=1)
            await db.commit()
        assert (await old_browser.post("/api/auth/refresh", headers=old)).status_code == 401
        assert (await other.get("/api/auth/me")).status_code == 200


@pytest.mark.asyncio
async def test_refresh_keeps_absolute_expiry_and_caps_access_lifetime(accounts):
    (owner, _, _), _sent = accounts
    async with await client() as browser:
        await login(browser, owner)
        async with AsyncSessionLocal() as db:
            session = (await db.execute(select(AuthSession).where(AuthSession.user_id == owner.id))).scalar_one()
            session.expires_at = utc_now() + timedelta(seconds=90)
            expiry = session.expires_at
            await db.commit()
        assert (await mutate(browser, "/api/auth/refresh")).status_code == 200
        async with AsyncSessionLocal() as db:
            current = (await db.execute(select(AuthSession).where(AuthSession.user_id == owner.id,
                                                                 AuthSession.revoked_at.is_(None)))).scalar_one()
            assert current.expires_at == expiry
        payload = jwt.decode(browser.cookies.get("smartdoc_access"), settings.JWT_ACCESS_SECRET,
                             algorithms=["HS256"], audience=TOKEN_AUDIENCE)
        assert payload["exp"] <= expiry.replace(tzinfo=timezone.utc).timestamp() + 1


async def wait_for_lock_waiters(guard, count):
    """Assert HTTP transactions really overlap at the PostgreSQL row lock."""
    for _ in range(200):
        await guard.execute(text("SELECT pg_stat_clear_snapshot()"))
        waiting = (await guard.execute(text(
            "SELECT count(*) FROM pg_stat_activity "
            "WHERE datname = current_database() AND wait_event_type = 'Lock'"
        ))).scalar_one()
        if waiting >= count:
            return
        await asyncio.sleep(0.01)
    raise AssertionError("HTTP transactions did not reach the account lock")


@pytest.mark.asyncio
@pytest.mark.parametrize("operation", ["logout", "reset", "suspend", "revoke"])
@pytest.mark.parametrize("first", ["refresh", "revoke"])
async def test_refresh_racing_revocation_leaves_no_active_session(accounts, operation, first):
    (owner, _, admin), sent = accounts
    async with await client() as browser, await client() as operator, await client() as requester:
        await login(browser, owner)
        await login(operator, admin)
        headers = captured_headers(browser)
        if operation == "reset":
            assert (await mutate(browser, "/api/auth/forgot-password", {"email": owner.email})).status_code == 200
            token = parse_qs(urlparse(sent[-1][2]).query)["token"][0]
            path, method, body = "/api/auth/reset-password", "POST", {"token": token, "password": "new-test-password"}
        elif operation == "logout":
            path, method, body = "/api/auth/logout", "POST", None
        else:
            path = f"/api/admin/users/{owner.id}" + ("/revoke-sessions" if operation == "revoke" else "")
            method = "POST" if operation == "revoke" else "PATCH"
            body = None if operation == "revoke" else {"is_active": False, "storage_quota_mb": 500}
        actor_headers = captured_headers(operator) if operation in {"suspend", "revoke"} else headers
        # Hold the actual account lock while both independent HTTP connections queue.
        async with AsyncSessionLocal() as guard:
            await guard.execute(select(User).where(User.id == owner.id).with_for_update())
            requests = {
                "refresh": lambda: requester.post("/api/auth/refresh", headers=headers),
                "revoke": lambda: operator.request(method, path, json=body, headers=actor_headers),
            }
            tasks = {first: asyncio.create_task(requests[first]())}
            try:
                await wait_for_lock_waiters(guard, 1)
                second = "revoke" if first == "refresh" else "refresh"
                tasks[second] = asyncio.create_task(requests[second]())
                await wait_for_lock_waiters(guard, 2)
            finally:
                await guard.rollback()
            refresh, revoke = tasks["refresh"], tasks["revoke"]
        refreshed, revoked = await asyncio.wait_for(asyncio.gather(refresh, revoke), timeout=15)
        assert refreshed.status_code in {200, 401}
        assert revoked.status_code == 200
        async with AsyncSessionLocal() as db:
            live = (await db.execute(select(AuthSession).where(AuthSession.user_id == owner.id,
                                                              AuthSession.revoked_at.is_(None)))).scalars().all()
            assert live == []
        assert (await browser.get("/api/auth/me")).status_code in {401, 403}


@pytest.mark.asyncio
async def test_database_role_change_overrides_existing_signed_admin_claim(accounts):
    (_, _, admin), _sent = accounts
    async with await client() as browser:
        await login(browser, admin)
        assert (await browser.get("/api/admin/overview")).status_code == 200
        async with AsyncSessionLocal() as db:
            user = await db.get(User, admin.id)
            user.role = "user"
            await db.commit()
        assert (await browser.get("/api/admin/overview")).status_code == 403


@pytest.mark.asyncio
@pytest.mark.parametrize("purpose", ["verify", "reset"])
async def test_action_token_is_single_use_under_concurrent_requests(accounts, purpose):
    (owner, _, _), sent = accounts
    if purpose == "verify":
        async with AsyncSessionLocal() as db:
            user = await db.get(User, owner.id)
            user.email_verified = False
            await db.commit()
    async with await client() as sender, await client() as a, await client() as b:
        request_path = "/api/auth/resend-verification" if purpose == "verify" else "/api/auth/forgot-password"
        assert (await mutate(sender, request_path, {"email": owner.email})).status_code == 200
        token = parse_qs(urlparse(sent[-1][2]).query)["token"][0]
        for browser in (a, b):
            await browser.get("/api/auth/csrf")
        path = "/api/auth/verify-email" if purpose == "verify" else "/api/auth/reset-password"
        body = {"token": token}
        if purpose == "reset":
            body["password"] = "concurrent-new-password"
        async with AsyncSessionLocal() as guard:
            await guard.execute(select(User).where(User.id == owner.id).with_for_update())
            tasks = [asyncio.create_task(mutate(browser, path, body)) for browser in (a, b)]
            try:
                await wait_for_lock_waiters(guard, 2)
            finally:
                await guard.rollback()
        responses = await asyncio.wait_for(asyncio.gather(*tasks), timeout=15)
        assert sorted(response.status_code for response in responses) == [200, 400]


@pytest.mark.asyncio
@pytest.mark.parametrize("first", ["login", "suspend"])
async def test_login_and_suspend_share_account_lock(accounts, first):
    (owner, _, admin), _sent = accounts
    async with await client() as browser, await client() as operator:
        await browser.get("/api/auth/csrf")
        await login(operator, admin)
        requests = {
            "login": lambda: mutate(browser, "/api/auth/login", {"email": owner.email, "password": "test-password"}),
            "suspend": lambda: mutate(operator, f"/api/admin/users/{owner.id}",
                                       {"is_active": False, "storage_quota_mb": 500}, method="PATCH"),
        }
        async with AsyncSessionLocal() as guard:
            await guard.execute(select(User).where(User.id == owner.id).with_for_update())
            tasks = {first: asyncio.create_task(requests[first]())}
            try:
                await wait_for_lock_waiters(guard, 1)
                second = "suspend" if first == "login" else "login"
                tasks[second] = asyncio.create_task(requests[second]())
                await wait_for_lock_waiters(guard, 2)
            finally:
                await guard.rollback()
        logged_in, suspended = await asyncio.wait_for(asyncio.gather(tasks["login"], tasks["suspend"]), timeout=15)
        assert logged_in.status_code == (200 if first == "login" else 403)
        assert suspended.status_code == 200
        assert (await browser.get("/api/auth/me")).status_code in {401, 403}
        async with AsyncSessionLocal() as db:
            assert (await db.execute(select(AuthSession).where(AuthSession.user_id == owner.id,
                                                              AuthSession.revoked_at.is_(None)))).scalars().all() == []


@pytest.mark.asyncio
async def test_provisioning_update_revokes_refresh_as_well_as_access(accounts):
    from seed_user import seed_user
    (owner, _, _), _sent = accounts
    async with await client() as browser:
        await login(browser, owner)
        await seed_user(owner.username, owner.email, "updated-test-password", role="user", update_existing=True)
        assert (await browser.get("/api/auth/me")).status_code == 401
        assert (await mutate(browser, "/api/auth/refresh")).status_code == 401
        assert (await mutate(browser, "/api/auth/login", {"email": owner.email, "password": "updated-test-password"})).status_code == 200


@pytest.mark.asyncio
async def test_https_cookie_flags_and_csrf_origin(accounts, monkeypatch):
    (owner, _, _), _sent = accounts
    monkeypatch.setattr(settings, "AUTH_COOKIE_SECURE", True)
    monkeypatch.setattr(settings, "AUTH_COOKIE_SAME_SITE", "strict")
    monkeypatch.setattr(settings, "AUTH_COOKIE_DOMAIN", "")
    monkeypatch.setattr(settings, "FRONTEND_URL", "https://test")
    monkeypatch.setattr(settings, "CORS_ALLOWED_ORIGINS", "https://test")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="https://test") as browser:
        await browser.get("/api/auth/csrf")
        body = {"email": owner.email, "password": "test-password"}
        assert (await browser.post("/api/auth/login", json=body)).status_code == 403
        assert (await browser.post("/api/auth/login", json=body,
                    headers={"x-csrf-token": browser.cookies.get("smartdoc_csrf"), "origin": "https://foreign.invalid"})).status_code == 403
        response = await browser.post("/api/auth/login", json=body,
                    headers={"x-csrf-token": browser.cookies.get("smartdoc_csrf"), "origin": "https://test"})
        assert response.status_code == 200
        flags = [header for header in response.headers.get_list("set-cookie")
                 if header.startswith(("smartdoc_access=", "smartdoc_refresh="))]
        assert len(flags) == 2
        assert all("HttpOnly" in header and "Secure" in header and "SameSite=strict" in header
                   and "Domain=" not in header for header in flags)
        assert (await browser.get("/api/auth/me")).status_code == 200
