import secrets
import uuid
from datetime import timedelta
from app.core.auth_cookies import ACCESS_COOKIE, REFRESH_COOKIE, SEED_COOKIE, cookie_options, digest, set_csrf
from app.core.config import settings
from app.core.datetime_utils import utc_now
from app.core.security import create_access_token
from app.models.auth_session import AuthSession
from app.models.user import User
from sqlalchemy import select, update


def profile(user):
    return {"id": str(user.id), "username": user.username, "email": user.email,
            "role": user.role, "is_active": user.is_active, "email_verified": user.email_verified,
            "display_name": user.display_name, "timezone": user.timezone,
            "onboarding_complete": user.onboarding_complete, "storage_quota_mb": user.storage_quota_mb}


def create_session(db, user, remember_me=False, expires_at=None):
    raw = secrets.token_urlsafe(48)
    duration = settings.JWT_REFRESH_REMEMBER_ME_EXPIRES_IN if remember_me else settings.JWT_REFRESH_EXPIRES_IN
    session = AuthSession(id=uuid.uuid4(), user_id=user.id, token_hash=digest(raw),
                          expires_at=expires_at or utc_now() + timedelta(seconds=settings.duration_seconds(duration)),
                          remember_me=remember_me)
    db.add(session)
    return session, raw


async def lock_account(db, user_id):
    """All lifecycle mutations lock the account before session/action records."""
    return (await db.execute(select(User).where(User.id == user_id).with_for_update()
                            .execution_options(populate_existing=True))).scalar_one_or_none()


async def revoke_account_sessions(db, user):
    """Caller holds the account lock; commit belongs to the caller's transaction."""
    user.token_version += 1
    await db.execute(update(AuthSession).where(AuthSession.user_id == user.id).values(revoked_at=utc_now()))


def set_session_cookies(response, user, session, refresh):
    lifetime = max(1, min(settings.duration_seconds(settings.JWT_ACCESS_EXPIRES_IN),
                          int((session.expires_at - utc_now()).total_seconds())))
    access = create_access_token({"sub": str(user.id), "role": user.role, "ver": user.token_version, "sid": str(session.id)},
                                 expires_delta=timedelta(seconds=lifetime))
    response.set_cookie(ACCESS_COOKIE, access, httponly=True, max_age=lifetime, **cookie_options())
    response.set_cookie(REFRESH_COOKIE, refresh, httponly=True,
                        max_age=max(1, int((session.expires_at - utc_now()).total_seconds())), **cookie_options())
    response.delete_cookie(SEED_COOKIE, **cookie_options())
    set_csrf(response, refresh)
