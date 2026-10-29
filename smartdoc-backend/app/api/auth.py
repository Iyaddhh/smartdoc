"""
app/api/auth.py — Endpoint autentikasi (register, login, me, logout).
"""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, ConfigDict, EmailStr, field_validator
from app.core.roles import UserRole
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import get_db
from app.models.user import User
from app.core.limiter import limiter
from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
    TokenResponse,
)
from app.core.response import ok_response, fail_response
from app.core.logger import logger

router = APIRouter(prefix="/api/auth", tags=["Auth"])


# ---------------------------------------------------------------------------
# Request Schemas
# ---------------------------------------------------------------------------
class RegisterRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    username: str
    email: EmailStr
    password: str

    @field_validator("username")
    @classmethod
    def username_valid(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 3 or len(v) > 50:
            raise ValueError("Username harus antara 3–50 karakter.")
        if not v.replace("_", "").replace("-", "").isalnum():
            raise ValueError("Username hanya boleh mengandung huruf, angka, underscore, dan dash.")
        return v

    @field_validator("password")
    @classmethod
    def password_valid(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password minimal 8 karakter.")
        return v


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@router.post("/register", status_code=201)
@limiter.limit("5/minute")
async def register(request: Request, body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """Daftarkan pengguna baru."""
    # Cek username sudah dipakai
    result = await db.execute(select(User).where(User.username == body.username))
    if result.scalar_one_or_none():
        return fail_response("Username sudah digunakan.", status_code=409)

    # Cek email sudah dipakai
    result = await db.execute(select(User).where(User.email == body.email))
    if result.scalar_one_or_none():
        return fail_response("Email sudah terdaftar.", status_code=409)

    user = User(
        id=uuid.uuid4(),
        username=body.username,
        email=body.email,
        hashed_password=hash_password(body.password),
        role="user",
        is_active=True,
        created_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    logger.info(f"[Auth] User baru terdaftar: {user.username} ({user.email})")
    return ok_response(
        data={"id": str(user.id), "username": user.username, "email": user.email, "role": user.role},
        message="Registrasi berhasil.",
        status_code=201,
    )


async def _authenticate_login(form_data: OAuth2PasswordRequestForm, db: AsyncSession, expected_role: UserRole):
    """Verify credentials and role before issuing a token."""
    result = await db.execute(select(User).where(User.username == form_data.username))
    user = result.scalar_one_or_none()

    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Username atau password salah.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Akun pengguna dinonaktifkan.",
        )

    if user.role != expected_role:
        raise HTTPException(status_code=403, detail=f"Halaman login ini khusus akun {expected_role.value}.")

    access_token = create_access_token(
        data={"sub": str(user.id), "username": user.username, "role": user.role, "ver": user.token_version}
    )

    logger.info(f"[Auth] Login berhasil: {user.username} (role: {user.role})")
    return TokenResponse(access_token=access_token)


@router.post("/login", response_model=TokenResponse)
@limiter.shared_limit("15/minute", scope="auth-login")
async def login(request: Request, form_data: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    """Login khusus role user."""
    return await _authenticate_login(form_data, db, UserRole.USER)


@router.post("/admin/login", response_model=TokenResponse)
@limiter.shared_limit("15/minute", scope="auth-login")
async def admin_login(request: Request, form_data: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    """Login khusus role admin; berbagi batas percobaan dengan login user."""
    return await _authenticate_login(form_data, db, UserRole.ADMIN)


@router.get("/me")
async def get_me(current_user: User = Depends(get_current_user)):
    """Kembalikan info user yang sedang login (butuh Bearer token)."""
    return ok_response(
        data={
            "id": str(current_user.id),
            "username": current_user.username,
            "email": current_user.email,
            "role": current_user.role,
            "is_active": current_user.is_active,
            "created_at": current_user.created_at.isoformat(),
        },
        message="Info pengguna berhasil diambil.",
    )


@router.post("/logout")
async def logout(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Cabut semua token aktif milik akun, termasuk yang dipakai di perangkat lain."""
    await db.execute(
        update(User).where(User.id == current_user.id).values(token_version=User.token_version + 1)
    )
    await db.commit()
    return ok_response(message="Semua sesi akun berhasil diakhiri.")
