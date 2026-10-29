from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4
from datetime import datetime, timedelta, timezone

import jwt

import pytest
import pytest_asyncio
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient
from app.main import app
from app.db.base import get_db
from app.core.security import create_access_token, decode_access_token, get_current_user, require_admin
from app.core.config import settings


@pytest_asyncio.fixture
async def account_client(monkeypatch):
    account = SimpleNamespace(id=uuid4(), username="account", role="user", is_active=True, hashed_password="hash", token_version=0)
    db = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = account
    db.execute.return_value = result

    async def database():
        yield db

    monkeypatch.setattr("app.api.auth.verify_password", lambda plain, hashed: plain == "correct-password")
    app.dependency_overrides[get_db] = database
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            yield client, account, db
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
@pytest.mark.parametrize("role,path,expected", [
    ("user", "/api/auth/login", 200),
    ("admin", "/api/auth/admin/login", 200),
    ("user", "/api/auth/admin/login", 403),
    ("admin", "/api/auth/login", 403),
])
async def test_role_specific_login(account_client, role, path, expected):
    client, account, _ = account_client
    account.role = role
    response = await client.post(path, data={"username": account.username, "password": "correct-password"})
    assert response.status_code == expected
    if expected == 200:
        assert decode_access_token(response.json()["access_token"]).role == role
    else:
        assert "access_token" not in response.json()


@pytest.mark.asyncio
@pytest.mark.parametrize("path", ["/api/auth/login", "/api/auth/admin/login"])
async def test_bad_password_does_not_issue_token(account_client, path):
    client, _, _ = account_client
    response = await client.post(path, data={"username": "account", "password": "wrong"})
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"
    assert "access_token" not in response.json()


@pytest.mark.asyncio
@pytest.mark.parametrize("role,path", [("user", "/api/auth/login"), ("admin", "/api/auth/admin/login")])
async def test_disabled_account_cannot_login(account_client, role, path):
    client, account, _ = account_client
    account.role, account.is_active = role, False
    response = await client.post(path, data={"username": "account", "password": "correct-password"})
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_public_registration_cannot_assign_admin_role(account_client):
    client, _, db = account_client
    response = await client.post("/api/auth/register", json={"username": "example", "email": "example@example.com", "password": "password123", "role": "admin"})
    assert response.status_code == 422
    db.add.assert_not_called()


@pytest.mark.asyncio
async def test_database_role_overrides_old_admin_claim(account_client):
    _, account, db = account_client
    token = create_access_token({"sub": str(account.id), "role": "admin", "ver": 0})
    user = await get_current_user(token=token, db=db)
    assert user.role == "user"
    with pytest.raises(HTTPException) as denied:
        await require_admin(current_user=user)
    assert denied.value.status_code == 403
    account.role = "admin"
    assert await require_admin(current_user=account) is account


@pytest.mark.asyncio
async def test_unknown_role_is_denied(account_client):
    _, account, db = account_client
    account.role = "owner"
    token = create_access_token({"sub": str(account.id), "role": "owner", "ver": 0})
    with pytest.raises(HTTPException) as denied:
        await get_current_user(token=token, db=db)
    assert denied.value.status_code == 403


@pytest.mark.asyncio
async def test_logout_revokes_all_existing_account_tokens(account_client):
    client, account, db = account_client
    first = await client.post("/api/auth/login", data={"username": account.username, "password": "correct-password"})
    second = await client.post("/api/auth/login", data={"username": account.username, "password": "correct-password"})
    assert first.status_code == second.status_code == 200
    token = first.json()["access_token"]
    other_token = second.json()["access_token"]
    response = await client.post("/api/auth/logout", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    db.commit.assert_awaited()
    account.token_version += 1  # Simulate the database UPDATE in this isolated fixture.
    for old_token in (token, other_token):
        with pytest.raises(HTTPException) as denied:
            await get_current_user(token=old_token, db=db)
        assert denied.value.status_code == 401
    new_token = create_access_token({"sub": str(account.id), "role": "user", "ver": account.token_version})
    assert await get_current_user(token=new_token, db=db) is account


def test_jwt_requires_expiry_and_valid_signature():
    subject = str(uuid4())
    without_expiry = jwt.encode({"sub": subject, "ver": 0}, settings.SECRET_KEY, algorithm="HS256")
    expired = jwt.encode(
        {"sub": subject, "ver": 0, "exp": datetime.now(timezone.utc) - timedelta(seconds=1)},
        settings.SECRET_KEY,
        algorithm="HS256",
    )
    wrong_signature = jwt.encode(
        {"sub": subject, "ver": 0, "exp": datetime.now(timezone.utc) + timedelta(minutes=1)},
        "another-secret-that-is-long-enough-for-hs256",
        algorithm="HS256",
    )
    assert decode_access_token(without_expiry) is None
    assert decode_access_token(expired) is None
    assert decode_access_token(wrong_signature) is None
