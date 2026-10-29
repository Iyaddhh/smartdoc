from uuid import UUID
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.base import get_db
from app.models.job import Job
from app.models.document import Document
from app.models.user import User
from app.core.response import ok_response, fail_response
from app.core.security import get_current_user

router = APIRouter(
    prefix="/api/jobs",
    tags=["Jobs"],
    dependencies=[Depends(get_current_user)],
)


@router.get("/{job_id}")
async def get_job_status(job_id: UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Job).join(Document, Job.document_id == Document.id).where(
            Job.id == job_id, Document.user_id == current_user.id
        )
    )
    job = result.scalar_one_or_none()

    if not job:
        return fail_response(message="Job tidak ditemukan", status_code=404)

    return ok_response(
        data={
            "id": str(job.id),
            "document_id": str(job.document_id),
            "feature": job.feature,
            "status": job.status,
            "progress": job.progress,
            "error": job.error,
            "started_at": job.started_at.isoformat() if job.started_at else None,
            "finished_at": job.finished_at.isoformat() if job.finished_at else None,
            "created_at": job.created_at.isoformat()
        },
        message="Status job berhasil didapatkan"
    )
