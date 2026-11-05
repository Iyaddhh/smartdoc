"""Email/password authentication with rotating server-side sessions."""
import asyncio
import secrets
import uuid
from datetime import timedelta
from urllib.parse import urlencode
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from sqlalchemy import select, update, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.auth_cookies import REFRESH_COOKIE, clear_cookies, digest, issue_csrf, require_csrf
from app.core.config import settings
from app.core.datetime_utils import utc_now
from app.core.timezones import WORKSPACE_TIMEZONES
from app.core.limiter import limiter
from app.core.response import ok_response
from app.core.security import get_current_user, hash_password, verify_password
from app.db.base import get_db
from app.models.auth_session import AuthActionToken, AuthSession
from app.models.user import User
from app.services.auth_sessions import create_session, profile, set_session_cookies, revoke_account_sessions
from app.services.mail import send_auth_mail

router = APIRouter(prefix="/api/auth", tags=["Auth"])


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid")


class PasswordInput(Input):
    password: str = Field(min_length=8)

    @field_validator("password")
    @classmethod
    def password_limit(cls, value):
        if len(value.encode()) > 72:
            raise ValueError("Password maksimal 72 byte UTF-8.")
        return value


class RegisterRequest(PasswordInput):
    email: EmailStr
    confirm_password: str
    accept_terms: bool


class LoginRequest(Input):
    # Existing local demo accounts can use .local addresses; registration still validates deliverable syntax.
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(max_length=256)
    remember_me: bool = False


class EmailRequest(Input):
    email: str = Field(min_length=3, max_length=254)


class TokenRequest(Input):
    token: str = Field(min_length=20, max_length=200)


class ResetRequest(PasswordInput):
    token: str = Field(min_length=20, max_length=200)


class ProfileRequest(Input):
    display_name: str = Field(min_length=1, max_length=100)
    timezone: str = "Asia/Jakarta"

    @field_validator("timezone")
    @classmethod
    def valid_timezone(cls, value):
        if value not in WORKSPACE_TIMEZONES:
            raise ValueError("Zona waktu tidak valid.")
        return value


async def send_action(db, user, purpose):
    await db.execute(update(AuthActionToken).where(AuthActionToken.user_id == user.id,
                     AuthActionToken.purpose == purpose, AuthActionToken.used_at.is_(None)).values(used_at=utc_now()))
    raw = secrets.token_urlsafe(40)
    db.add(AuthActionToken(id=uuid.uuid4(), user_id=user.id, purpose=purpose, token_hash=digest(raw),
                           expires_at=utc_now() + timedelta(minutes=30)))
    route = "verify-email" if purpose == "verify" else "reset-password"
    subject = "Verifikasi email SmartDoc" if purpose == "verify" else "Reset password SmartDoc"
    url = f"{settings.FRONTEND_URL.rstrip('/')}/auth/{route}?{urlencode({'token': raw})}"
    try:
        await asyncio.to_thread(send_auth_mail, user.email, subject, url)
    except Exception as error:
        await db.rollback()
        raise HTTPException(503, "Email belum dapat dikirim. Pastikan layanan email lokal berjalan.") from error


@router.get("/csrf")
async def csrf(request: Request):
    response = ok_response(data={})
    issue_csrf(request, response)
    return response


@router.post("/register", status_code=201, dependencies=[Depends(require_csrf)])
@limiter.limit("5/minute")
async def register(request: Request, body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    if body.password != body.confirm_password or not body.accept_terms:
        raise HTTPException(422, "Konfirmasi password dan persetujuan syarat diperlukan.")
    email = str(body.email).lower()
    existing = (await db.execute(select(User).where(func.lower(User.email) == email))).scalar_one_or_none()
    if not existing:
        user = User(id=uuid.uuid4(), username="user_" + uuid.uuid4().hex[:20], email=email,
                    hashed_password=await asyncio.to_thread(hash_password, body.password), role="user",
                    is_active=True, email_verified=False, token_version=0)
        db.add(user)
        try:
            await db.flush()
            await send_action(db, user, "verify")
            await db.commit()
        except IntegrityError:
            await db.rollback()
    return ok_response(message="Jika alamat ini dapat didaftarkan, instruksi verifikasi akan dikirim.", status_code=201)


async def authenticate(body, db, role):
    user = (await db.execute(select(User).where(func.lower(User.email) == str(body.email).lower().strip())
                            .with_for_update().execution_options(populate_existing=True))).scalar_one_or_none()
    valid = len(body.password.encode()) <= 72 and bool(user) and await asyncio.to_thread(verify_password, body.password, user.hashed_password)
    if not valid:
        raise HTTPException(401, "Email atau password salah.")
    if not user.is_active or user.role != role:
        raise HTTPException(403, "Akun tidak aktif atau halaman login tidak sesuai role.")
    if not user.email_verified:
        raise HTTPException(403, "Verifikasi email sebelum masuk.")
    session, raw = create_session(db, user, body.remember_me)
    await db.commit()
    response = ok_response(data=profile(user), message="Login berhasil.")
    set_session_cookies(response, user, session, raw)
    return response


@router.post("/login", dependencies=[Depends(require_csrf)])
@limiter.shared_limit("15/minute", scope="auth-login")
async def login(request: Request, body: LoginRequest, db: AsyncSession = Depends(get_db)):
    return await authenticate(body, db, "user")


@router.post("/admin/login", dependencies=[Depends(require_csrf)])
@limiter.shared_limit("15/minute", scope="auth-login")
async def admin_login(request: Request, body: LoginRequest, db: AsyncSession = Depends(get_db)):
    return await authenticate(body, db, "admin")


@router.get("/me")
async def me(user: User = Depends(get_current_user)):
    return ok_response(data=profile(user))


@router.patch("/profile")
async def edit_profile(body: ProfileRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    user.display_name = body.display_name.strip()
    if not user.display_name:
        raise HTTPException(422, "Nama tampilan wajib diisi.")
    user.timezone = body.timezone
    user.onboarding_complete = True
    await db.commit()
    return ok_response(data=profile(user))


@router.post("/refresh", dependencies=[Depends(require_csrf)])
@limiter.limit("30/minute")
async def refresh(request: Request, db: AsyncSession = Depends(get_db)):
    raw = request.cookies.get(REFRESH_COOKIE, "")
    user = (await db.execute(select(User).join(AuthSession, AuthSession.user_id == User.id)
        .where(AuthSession.token_hash == digest(raw)).with_for_update(of=User)
        .execution_options(populate_existing=True))).scalar_one_or_none()
    if not user:
        raise HTTPException(401, "Sesi tidak valid.")
    old = (await db.execute(select(AuthSession).where(AuthSession.token_hash == digest(raw)).with_for_update()
                           .execution_options(populate_existing=True))).scalar_one()
    if old.expires_at <= utc_now() or not user.is_active or not user.email_verified:
        raise HTTPException(401, "Sesi telah berakhir.")
    if old.revoked_at:
        await revoke_account_sessions(db, user)
        await db.commit()
        raise HTTPException(401, "Token sesi sudah dipakai. Silakan masuk kembali.")
    old.revoked_at = utc_now()
    new, token = create_session(db, user, old.remember_me, old.expires_at)
    await db.commit()
    response = ok_response(data=profile(user))
    set_session_cookies(response, user, new, token)
    return response


@router.post("/logout", dependencies=[Depends(require_csrf)])
async def logout(request: Request, db: AsyncSession = Depends(get_db)):
    token_hash = digest(request.cookies.get(REFRESH_COOKIE, ""))
    user = (await db.execute(select(User).join(AuthSession, AuthSession.user_id == User.id)
                            .where(AuthSession.token_hash == token_hash).with_for_update(of=User)
                            .execution_options(populate_existing=True))).scalar_one_or_none()
    revoked = False
    if user:
        old = (await db.execute(select(AuthSession).where(AuthSession.token_hash == token_hash)
                               .with_for_update().execution_options(populate_existing=True))).scalar_one()
        # A refresh that won the account lock must not escape a pending logout.
        # Unknown/expired tokens cannot authorize revocation of a newer login.
        if old.expires_at > utc_now():
            await revoke_account_sessions(db, user)
            revoked = True
        await db.commit()
    response = ok_response(data={"scope": "account" if revoked else "browser", "revoked": revoked},
                           message="Seluruh perangkat berhasil dikeluarkan." if revoked else "Sesi pada browser ini telah dibersihkan.")
    clear_cookies(response)
    return response


@router.post("/resend-verification", dependencies=[Depends(require_csrf)])
@limiter.limit("3/minute")
async def resend(request: Request, body: EmailRequest, db: AsyncSession = Depends(get_db)):
    user = (await db.execute(select(User).where(func.lower(User.email) == str(body.email).lower().strip(), User.is_active.is_(True))
                            .with_for_update().execution_options(populate_existing=True))).scalar_one_or_none()
    if user and not user.email_verified:
        await send_action(db, user, "verify")
        await db.commit()
    return ok_response(message="Jika akun memerlukan verifikasi, email akan dikirim.")


@router.post("/forgot-password", dependencies=[Depends(require_csrf)])
@limiter.limit("3/minute")
async def forgot(request: Request, body: EmailRequest, db: AsyncSession = Depends(get_db)):
    user = (await db.execute(select(User).where(func.lower(User.email) == str(body.email).lower().strip(), User.is_active.is_(True))
                            .with_for_update().execution_options(populate_existing=True))).scalar_one_or_none()
    if user:
        await send_action(db, user, "reset")
        await db.commit()
    return ok_response(message="Jika akun terdaftar, instruksi reset akan dikirim.")


async def consume_action(db, raw, purpose):
    user = (await db.execute(select(User).join(AuthActionToken, AuthActionToken.user_id == User.id)
                            .where(AuthActionToken.token_hash == digest(raw), AuthActionToken.purpose == purpose)
                            .with_for_update(of=User).execution_options(populate_existing=True))).scalar_one_or_none()
    if not user:
        raise HTTPException(400, "Tautan tidak valid, kedaluwarsa, atau sudah digunakan.")
    action = (await db.execute(select(AuthActionToken).where(AuthActionToken.token_hash == digest(raw),
                              AuthActionToken.purpose == purpose).with_for_update()
                              .execution_options(populate_existing=True))).scalar_one()
    if action.used_at or action.expires_at <= utc_now():
        raise HTTPException(400, "Tautan tidak valid, kedaluwarsa, atau sudah digunakan.")
    if not user.is_active:
        raise HTTPException(403, "Akun tidak aktif.")
    action.used_at = utc_now()
    return user


@router.post("/verify-email", dependencies=[Depends(require_csrf)])
@limiter.limit("10/minute")
async def verify_email(request: Request, body: TokenRequest, db: AsyncSession = Depends(get_db)):
    user = await consume_action(db, body.token, "verify")
    user.email_verified = True
    session, raw = create_session(db, user)
    await db.commit()
    response = ok_response(data=profile(user), message="Email berhasil diverifikasi.")
    set_session_cookies(response, user, session, raw)
    return response


@router.post("/reset-password", dependencies=[Depends(require_csrf)])
@limiter.limit("10/minute")
async def reset_password(request: Request, body: ResetRequest, db: AsyncSession = Depends(get_db)):
    user = await consume_action(db, body.token, "reset")
    user.hashed_password = await asyncio.to_thread(hash_password, body.password)
    await revoke_account_sessions(db, user)
    await db.commit()
    response = ok_response(message="Password diperbarui. Silakan masuk kembali.")
    clear_cookies(response)
    return response
