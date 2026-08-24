from uuid import UUID
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.base import get_db
from app.models.job import Job
from app.core.response import ok_response, fail_response

router = APIRouter(prefix="/api/jobs", tags=["Jobs"])


@router.get("/{job_id}")
async def get_job_status(job_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Job).where(Job.id == job_id))
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
