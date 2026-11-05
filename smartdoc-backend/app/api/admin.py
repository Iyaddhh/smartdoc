"""Administrative operations expose account/operational metadata, not private content."""
import uuid
import asyncio
from datetime import timedelta
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select, func, update
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import require_admin
from app.core.response import ok_response
from app.core.datetime_utils import utc_now
from app.db.base import get_db
from app.models.user import User
from app.models.document import Document
from app.models.job import Job
from app.models.auth_session import AuthSession
from app.models.admin_audit import AdminAudit
from app.services.admin_reporting import FEATURES, process_metadata, audit_metadata, service_diagnostics, public_admin_settings, timestamp
from app.services.storage_usage import account_storage_usage, storage_bytes_expression
from app.services.auth_sessions import lock_account, revoke_account_sessions

router = APIRouter(prefix="/api/admin", tags=["Admin"], dependencies=[Depends(require_admin)])


class AccountUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    is_active: bool
    storage_quota_mb: int = Field(ge=10, le=100_000)


def audit(db, actor, target, action):
    db.add(AdminAudit(id=uuid.uuid4(), actor_id=actor.id, target_id=target.id, action=action, created_at=utc_now()))


@router.get("/overview")
async def overview(db: AsyncSession = Depends(get_db)):
    since = utc_now() - timedelta(hours=24)
    users = (await db.execute(select(func.count()).select_from(User))).scalar_one()
    documents = (await db.execute(select(func.count()).select_from(Document))).scalar_one()
    storage = int((await db.execute(select(storage_bytes_expression()))).scalar_one())
    active = (await db.execute(select(func.count()).select_from(Job).where(Job.status.in_(["pending", "processing"])))).scalar_one()
    new_users = (await db.execute(select(func.count()).select_from(User).where(User.created_at >= since))).scalar_one()
    counts = (await db.execute(select(Job.feature, Job.status, func.count().label("count")).where(Job.created_at >= since).group_by(Job.feature, Job.status))).all()
    tools = [{"feature": feature, "total": sum(row.count for row in counts if row.feature == feature),
              "done": sum(row.count for row in counts if row.feature == feature and row.status == "done"),
              "failed": sum(row.count for row in counts if row.feature == feature and row.status == "failed")} for feature in FEATURES]
    return ok_response(data={"users": users, "documents": documents, "storage_bytes": storage,
                             "active_jobs": active, "new_users_24h": new_users, "jobs_24h": sum(tool["total"] for tool in tools),
                             "failed_24h": sum(tool["failed"] for tool in tools), "tools": tools, "checked_at": timestamp(utc_now()),
                             "scope": "workspace"})


@router.get("/jobs")
async def jobs(feature: str = Query("", pattern="^$|^(converter|compressor|splitter|merger|watermark)$"),
               status: str = Query("active", pattern="^$|^(active|pending|processing|done|failed)$"),
               period: Literal["24h", "7d", "all"] = "24h",
               page: int = Query(1, ge=1), db: AsyncSession = Depends(get_db)):
    conditions = []
    if feature:
        conditions.append(Job.feature == feature)
    if status == "active":
        conditions.append(Job.status.in_(["pending", "processing"]))
    elif status:
        conditions.append(Job.status == status)
    # Active work must remain visible even if it started before this history window.
    if status not in {"active", "pending", "processing"} and period != "all":
        conditions.append(Job.created_at >= utc_now() - timedelta(days=7 if period == "7d" else 1))
    total = (await db.execute(select(func.count()).select_from(Job).where(*conditions))).scalar_one()
    # Deliberately do not select Job.error or join private document records.
    query = select(Job.id, Job.feature, Job.status, Job.progress, Job.created_at, Job.started_at, Job.finished_at).where(*conditions)
    rows = (await db.execute(query.order_by(Job.created_at.desc(), Job.id).offset((page - 1) * 25).limit(25))).all()
    return ok_response(data={"items": [process_metadata(row) for row in rows], "total": total, "page": page, "page_size": 25})


@router.get("/health")
async def health(db: AsyncSession = Depends(get_db)):
    from sqlalchemy import text
    await db.execute(text("SELECT 1"))
    data = await asyncio.to_thread(service_diagnostics)
    return ok_response(data={**data, "checked_at": timestamp(utc_now())})


@router.get("/settings")
async def service_settings():
    return ok_response(data=public_admin_settings())


@router.get("/users")
async def users(search: str = Query("", max_length=255), page: int = Query(1, ge=1), db: AsyncSession = Depends(get_db)):
    query = select(User)
    if search:
        query = query.where(User.email.ilike(f"%{search}%"))
    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar_one()
    rows = (await db.execute(query.order_by(User.created_at.desc(), User.id).offset((page-1)*10).limit(10))).scalars().all()
    usage = await account_storage_usage(db, [row.id for row in rows])
    return ok_response(data={"items": [{"id": str(row.id), "email": row.email, "role": row.role, "is_active": row.is_active,
                             "email_verified": row.email_verified, "storage_quota_mb": row.storage_quota_mb,
                             "storage_used_bytes": usage.get(row.id, 0)} for row in rows],
                             "total": total, "page": page, "page_size": 10})


@router.get("/users/{user_id}")
async def user_detail(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    # Select account metadata only, excluding password hashes and session tokens.
    row = (await db.execute(select(User.id, User.email, User.display_name, User.role, User.is_active,
                                  User.email_verified, User.storage_quota_mb, User.created_at, User.onboarding_complete)
                            .where(User.id == user_id))).first()
    if not row:
        raise HTTPException(404, "Akun tidak ditemukan.")
    usage = await account_storage_usage(db, [row.id])
    return ok_response(data={"id": str(row.id), "email": row.email, "display_name": row.display_name,
                             "role": row.role, "is_active": row.is_active, "email_verified": row.email_verified,
                             "storage_quota_mb": row.storage_quota_mb, "created_at": timestamp(row.created_at),
                             "onboarding_complete": row.onboarding_complete, "storage_used_bytes": usage.get(row.id, 0)})


@router.patch("/users/{user_id}")
async def update_user(user_id: uuid.UUID, body: AccountUpdate, actor: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    target = await lock_account(db, user_id)
    if not target:
        raise HTTPException(404, "Akun tidak ditemukan.")
    if target.role == "admin" and not body.is_active:
        raise HTTPException(409, "Akun admin tidak dapat dinonaktifkan melalui panel ini.")
    if not body.is_active:
        await revoke_account_sessions(db, target)
    target.is_active = body.is_active
    target.storage_quota_mb = body.storage_quota_mb
    audit(db, actor, target, f"account.active={body.is_active};quota_mb={body.storage_quota_mb}")
    await db.commit()
    return ok_response()


@router.post("/users/{user_id}/revoke-sessions")
async def revoke_sessions(user_id: uuid.UUID, actor: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    target = await lock_account(db, user_id)
    if not target:
        raise HTTPException(404, "Akun tidak ditemukan.")
    await revoke_account_sessions(db, target)
    audit(db, actor, target, "sessions.revoked")
    await db.commit()
    return ok_response()


@router.get("/audit")
async def audit_log(page: int = Query(1, ge=1), db: AsyncSession = Depends(get_db)):
    total = (await db.execute(select(func.count()).select_from(AdminAudit))).scalar_one()
    rows = (await db.execute(select(AdminAudit).order_by(AdminAudit.created_at.desc(), AdminAudit.id).offset((page - 1) * 25).limit(25))).scalars().all()
    return ok_response(data={"items": [audit_metadata(row) for row in rows], "total": total, "page": page, "page_size": 25})
