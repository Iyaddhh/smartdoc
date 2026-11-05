"""Host-only cookies and signed, session-bound double-submit CSRF tokens."""
import hashlib
import hmac
import secrets
from fastapi import HTTPException, Request
from app.core.config import settings

ACCESS_COOKIE = "smartdoc_access"
REFRESH_COOKIE = "smartdoc_refresh"
CSRF_COOKIE = "smartdoc_csrf"
SEED_COOKIE = "smartdoc_csrf_seed"


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def cookie_options():
    return dict(secure=settings.AUTH_COOKIE_SECURE, samesite=settings.AUTH_COOKIE_SAME_SITE,
                domain=settings.AUTH_COOKIE_DOMAIN or None, path="/")


def csrf_value(binding: str) -> str:
    return hmac.new(settings.JWT_ACCESS_SECRET.encode(), ("csrf:" + binding).encode(), hashlib.sha256).hexdigest()


def set_csrf(response, binding: str):
    token = csrf_value(binding)
    response.set_cookie(CSRF_COOKIE, token, httponly=False, **cookie_options())
    return token


def issue_csrf(request: Request, response):
    binding = request.cookies.get(REFRESH_COOKIE)
    if not binding:
        binding = request.cookies.get(SEED_COOKIE) or secrets.token_urlsafe(32)
        response.set_cookie(SEED_COOKIE, binding, httponly=True, **cookie_options())
    return set_csrf(response, binding)


def require_csrf(request: Request):
    binding = request.cookies.get(REFRESH_COOKIE) or request.cookies.get(SEED_COOKIE, "")
    token = request.headers.get("x-csrf-token", "")
    cookie = request.cookies.get(CSRF_COOKIE, "")
    origin = request.headers.get("origin")
    allowed = {settings.FRONTEND_URL.rstrip("/"), *settings.get_cors_origins()}
    if origin and origin.rstrip("/") not in allowed:
        raise HTTPException(403, "Origin tidak diizinkan.")
    if not binding or not token or not hmac.compare_digest(token, cookie) or not hmac.compare_digest(token, csrf_value(binding)):
        raise HTTPException(403, "Token CSRF tidak valid. Muat ulang halaman.")


def clear_cookies(response):
    for name in (ACCESS_COOKIE, REFRESH_COOKIE, CSRF_COOKIE, SEED_COOKIE):
        response.delete_cookie(name, **cookie_options())


class AuthCacheMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or not scope["path"].startswith("/api/"):
            return await self.app(scope, receive, send)

        async def private_send(message):
            if message["type"] == "http.response.start":
                headers = [(key, value) for key, value in message.get("headers", []) if key.lower() != b"cache-control"]
                # HttpOnly refresh cookies cannot be inspected by browser code. Tell
                # anonymous clients to keep the 401 without starting a refresh loop.
                if message["status"] == 401 and not Request(scope).cookies.get(REFRESH_COOKIE):
                    headers.append((b"x-session-refresh", b"unavailable"))
                message = {**message, "headers": headers + [(b"cache-control", b"no-store")]}
            await send(message)

        await self.app(scope, receive, private_send)
