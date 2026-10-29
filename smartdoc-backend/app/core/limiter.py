"""
app/core/limiter.py — Inisialisasi rate limiter slowapi.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address
from app.core.config import settings
from app.core.security import decode_access_token


def rate_limit_identity(request):
    # Only trust a verified JWT, never an unvalidated forwarding header.
    authorization = request.headers.get("authorization", "")
    if authorization.lower().startswith("bearer "):
        data = decode_access_token(authorization[7:])
        if data and data.user_id:
            return f"account:{data.user_id}"
    return f"ip:{get_remote_address(request)}"

limiter = Limiter(key_func=rate_limit_identity, default_limits=[settings.API_RATE_LIMIT])
