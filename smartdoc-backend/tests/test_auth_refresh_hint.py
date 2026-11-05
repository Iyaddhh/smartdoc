import pytest
from httpx import ASGITransport, AsyncClient
from starlette.responses import Response

from app.core.auth_cookies import AuthCacheMiddleware


@pytest.mark.asyncio
@pytest.mark.parametrize("cookie,refresh_hint", [
    ("", "unavailable"),
    ("smartdoc_csrf=anonymous-token", "unavailable"),
    ("smartdoc_refresh=opaque-session-token", None),
])
async def test_unauthorized_response_only_skips_refresh_without_a_session_cookie(cookie, refresh_hint):
    async def unauthorized(scope, receive, send):
        await Response(status_code=401)(scope, receive, send)

    async with AsyncClient(transport=ASGITransport(app=AuthCacheMiddleware(unauthorized)), base_url="http://test") as client:
        response = await client.get("/api/auth/me", headers={"cookie": cookie})
    assert response.status_code == 401
    assert response.headers.get("x-session-refresh") == refresh_hint
    assert response.headers["cache-control"] == "no-store"
