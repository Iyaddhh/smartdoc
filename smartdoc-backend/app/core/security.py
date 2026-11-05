"""
app/core/security.py — Modul keamanan JWT & password hashing.
Menyediakan:
  - Password hashing (bcrypt via passlib)
  - JWT token creation & verification (PyJWT)
  - FastAPI dependency `get_current_user` untuk proteksi endpoint
"""
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
import jwt
from jwt import InvalidTokenError as JWTError
from passlib.context import CryptContext
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.config import settings
from app.core.roles import UserRole
from app.db.base import get_db

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
ALGORITHM = "HS256"
TOKEN_ISSUER = "smartdoc"
TOKEN_AUDIENCE = "smartdoc-api"
ACCESS_TOKEN_EXPIRE_SECONDS = settings.duration_seconds(settings.JWT_ACCESS_EXPIRES_IN)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


# ---------------------------------------------------------------------------
# Pydantic Schemas
# ---------------------------------------------------------------------------
class TokenData(BaseModel):
    user_id: Optional[str] = None
    username: Optional[str] = None
    role: Optional[str] = None
    token_version: int
    session_id: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int = ACCESS_TOKEN_EXPIRE_SECONDS


# ---------------------------------------------------------------------------
# Password Utilities
# ---------------------------------------------------------------------------
def hash_password(plain_password: str) -> str:
    """Hash password dengan bcrypt."""
    return pwd_context.hash(plain_password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifikasi password plain terhadap hash bcrypt."""
    return pwd_context.verify(plain_password, hashed_password)


# ---------------------------------------------------------------------------
# JWT Token Utilities
# ---------------------------------------------------------------------------
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Buat JWT access token dengan expiry."""
    to_encode = data.copy()
    # Both transports use server-side sessions; never mint a stateless bypass.
    UUID(to_encode["sub"])
    UUID(to_encode["sid"])
    if type(to_encode.get("ver")) is not int or to_encode["ver"] < 0:
        raise ValueError("Versi token tidak valid.")
    now = datetime.now(timezone.utc)
    expire = now + (
        expires_delta if expires_delta is not None else timedelta(seconds=ACCESS_TOKEN_EXPIRE_SECONDS)
    )
    to_encode.update({"exp": expire, "iat": now, "iss": TOKEN_ISSUER,
                      "aud": TOKEN_AUDIENCE, "token_use": "access"})
    return jwt.encode(to_encode, settings.JWT_ACCESS_SECRET, algorithm=ALGORITHM)


def decode_access_token(token: str) -> Optional[TokenData]:
    """Decode dan validasi JWT token. Returns None jika token tidak valid."""
    try:
        payload = jwt.decode(
            token,
            settings.JWT_ACCESS_SECRET,
            algorithms=[ALGORITHM],
            issuer=TOKEN_ISSUER,
            audience=TOKEN_AUDIENCE,
            options={"require": ["exp", "iat", "sub", "ver", "sid", "iss", "aud", "token_use"],
                     "strict_aud": True},
        )
        user_id: Optional[str] = payload.get("sub")
        username: Optional[str] = payload.get("username")
        role: Optional[str] = payload.get("role")
        if (payload["token_use"] != "access" or type(payload["ver"]) is not int or payload["ver"] < 0
                or type(payload["iat"]) is not int or type(payload["exp"]) is not int
                or payload["iat"] > payload["exp"] or not isinstance(payload["sid"], str)):
            return None
        UUID(user_id)
        UUID(payload["sid"])
        return TokenData(user_id=user_id, username=username, role=role, token_version=payload["ver"], session_id=payload["sid"])
    except (JWTError, ValueError, TypeError, KeyError):
        return None


# ---------------------------------------------------------------------------
# FastAPI Dependency
# ---------------------------------------------------------------------------
async def get_current_user(
    request: Request = None,
    token: Optional[str] = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
):
    """
    FastAPI dependency: Memvalidasi JWT token dari header Authorization Bearer.
    Gunakan ini di endpoint yang perlu dilindungi:

        @router.get("/protected")
        async def protected(user = Depends(get_current_user)):
            ...
    """
    from app.models.user import User  # local import to avoid circular

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token autentikasi tidak valid atau sudah kedaluwarsa.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    from app.core.auth_cookies import ACCESS_COOKIE, require_csrf
    from app.models.auth_session import AuthSession
    if not token and request:
        token = request.cookies.get(ACCESS_COOKIE)
        if token and request.method not in {"GET", "HEAD", "OPTIONS"}:
            require_csrf(request)
    token_data = decode_access_token(token) if token else None
    if token_data is None or token_data.user_id is None:
        raise credentials_exception

    import uuid
    try:
        user_uuid = uuid.UUID(token_data.user_id)
    except ValueError:
        raise credentials_exception

    result = await db.execute(select(User).where(User.id == user_uuid))
    user = result.scalar_one_or_none()

    if user is None:
        raise credentials_exception
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Akun pengguna dinonaktifkan.",
        )
    if not user.email_verified:
        raise HTTPException(status_code=403, detail="Verifikasi email sebelum mengakses workspace.")
    if user.role not in (UserRole.USER, UserRole.ADMIN):
        raise HTTPException(status_code=403, detail="Role akun tidak valid.")
    if token_data.token_version != user.token_version:
        raise credentials_exception
    session = await db.get(AuthSession, uuid.UUID(token_data.session_id))
    if not session or session.user_id != user.id or session.revoked_at or session.expires_at <= datetime.now(timezone.utc).replace(tzinfo=None):
        raise credentials_exception
    return user


def require_roles(allowed_roles: list[str]):
    """FastAPI dependency factory untuk memvalidasi role pengguna."""
    async def _role_checker(current_user=Depends(get_current_user)):
        if getattr(current_user, "role", None) not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Akses ditolak. Fitur ini memerlukan salah satu hak akses: {', '.join(allowed_roles)}.",
            )
        return current_user
    return _role_checker


require_admin = require_roles(["admin"])
