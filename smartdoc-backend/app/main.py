import os
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi import Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from slowapi.middleware import SlowAPIMiddleware
from app.core.request_limits import RequestSizeLimitMiddleware
from app.core.config import settings
from app.core.logger import logger
from app.core.response import ok_response, fail_response
from app.core.cleanup import clean_expired_temp_files
from app.db.base import engine, get_db
from app.db.migrations import upgrade_database
from app.models import Document, Job, User  # Register models for Base metadata
# Reload trigger

# Import all routers
from app.api.auth import router as auth_router
from app.api.guest import router as guest_router, clean_guest_orphans
from app.api.jobs import router as jobs_router
from app.api.compressor import router as compressor_router
from app.api.converter import router as converter_router
from app.api.splitter import router as splitter_router
from app.api.merger import router as merger_router
from app.api.watermark import router as watermark_router
from app.api.documents import router as documents_router


async def _periodic_temp_cleanup_task():
    """Background loop to periodically clean expired temporary files."""
    while True:
        try:
            await asyncio.sleep(3600)  # Run every 1 hour
            await asyncio.to_thread(clean_expired_temp_files, ttl_hours=settings.TEMP_FILE_TTL_HOURS)
            logger.info("Auto-cleanup periodic loop executed successfully.")
        except asyncio.CancelledError:
            logger.info("Auto-cleanup periodic task cleanly cancelled.")
            break
        except Exception as e:
            logger.warning(f"Auto-cleanup periodic task encountered a warning: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"SmartDoc Backend starting in {settings.APP_ENV} mode...")

    await upgrade_database()
    await asyncio.to_thread(clean_guest_orphans)
    logger.info("Alembic migrations applied successfully (upgrade head).")

    # Ensure storage directories exist
    for subdir in [
        "temp/uploads", "temp/processing",
        "documents/originals", "documents/outputs"
    ]:
        os.makedirs(os.path.join(settings.STORAGE_PATH, subdir), exist_ok=True)

    # Initial cleanup on startup
    try:
        await asyncio.to_thread(clean_expired_temp_files, ttl_hours=settings.TEMP_FILE_TTL_HOURS)
    except Exception as e:
        logger.warning(f"Initial auto-cleanup warning: {e}")

    # Start periodic background cleanup task
    cleanup_task = asyncio.create_task(_periodic_temp_cleanup_task())

    yield

    # Lifespan Shutdown
    logger.info("SmartDoc Backend shutting down...")
    cleanup_task.cancel()
    try:
        await cleanup_task
    except asyncio.CancelledError:
        pass
    await engine.dispose()


from slowapi.errors import RateLimitExceeded
from app.core.limiter import limiter

app = FastAPI(
    title="SmartDoc API",
    description="Sistem Manajemen Dokumen — Converter, Compressor, Splitter, Merger, dan Watermark",
    version="1.0.0",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)
app.add_middleware(RequestSizeLimitMiddleware)

# CORS Middleware — whitelisted origins, spesifik method & header
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.get_cors_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "X-Request-ID"],
)

# Global Exception Handlers for standard response structure
@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return fail_response(
        message="Terlalu banyak permintaan (Rate limit exceeded). Harap coba beberapa saat lagi.",
        error="Too many requests",
        status_code=429,
        headers={"Retry-After": "60"},
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    error_details = []
    for err in exc.errors():
        loc = " -> ".join([str(x) for x in err.get("loc", [])])
        msg = err.get("msg", "Input tidak valid")
        error_details.append(f"{loc}: {msg}")
    error_msg = "; ".join(error_details) if error_details else "Validasi data request gagal"
    return fail_response(message="Validasi data input gagal", error=error_msg, status_code=422)


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return fail_response(message=str(exc.detail), error=str(exc.detail), status_code=exc.status_code, headers=exc.headers)


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled server error on {request.url.path}: {exc}", exc_info=True)
    error_message = str(exc) if settings.APP_ENV == "development" else "Terjadi kesalahan internal server"
    return fail_response(
        message="Terjadi kesalahan internal server saat memproses permintaan",
        error=error_message,
        status_code=500,
    )


# Register Routers
app.include_router(auth_router)
app.include_router(guest_router)
app.include_router(jobs_router)
app.include_router(compressor_router)
app.include_router(converter_router)
app.include_router(splitter_router)
app.include_router(merger_router)
app.include_router(watermark_router)
app.include_router(documents_router)


@app.get("/health", tags=["Health"])
async def health_check():
    return ok_response(
        data={"status": "healthy", "env": settings.APP_ENV},
        message="SmartDoc Backend is running"
    )


@app.get("/", tags=["Root"])
async def root():
    return ok_response(
        data={"app": "SmartDoc API", "version": "1.0.0", "docs": "/docs"},
        message="Selamat datang di SmartDoc API"
    )


@app.get("/ready", tags=["Health"])
async def readiness(db: AsyncSession = Depends(get_db)):
    import shutil
    import tempfile

    def check_storage():
        with tempfile.TemporaryFile(dir=settings.STORAGE_PATH) as probe:
            probe.write(b"ready")
        if shutil.disk_usage(settings.STORAGE_PATH).free < settings.MIN_FREE_DISK_MB * 1024 * 1024:
            raise RuntimeError("Storage capacity unavailable")

    try:
        await asyncio.wait_for(db.execute(text("SELECT 1")), timeout=3)
        await asyncio.to_thread(check_storage)
    except Exception:
        return fail_response("Layanan belum siap menerima pekerjaan.", status_code=503)
    return ok_response(data={"status": "ready"}, message="Database dan storage siap")
