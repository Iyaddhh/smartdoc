import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.logger import logger
from app.core.response import ok_response
from app.db.base import engine, Base
from app.models import Template, Document, Job  # Register models for Base metadata

# Import all routers
from app.api.jobs import router as jobs_router
from app.api.compressor import router as compressor_router
from app.api.converter import router as converter_router
from app.api.splitter import router as splitter_router
from app.api.merger import router as merger_router
from app.api.watermark import router as watermark_router
from app.api.documents import router as documents_router
from app.api.templates import router as templates_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"SmartDoc Backend starting in {settings.APP_ENV} mode...")

    # Create DB tables if not exists (Alembic is recommended for production)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables verified/created successfully.")

    # Ensure storage directories exist
    for subdir in [
        "temp/uploads", "temp/processing",
        "templates",
        "documents/originals", "documents/outputs"
    ]:
        os.makedirs(os.path.join(settings.STORAGE_PATH, subdir), exist_ok=True)
    # Auto-cleanup expired temporary files (PRD Section 7.6)
    try:
        from app.core.cleanup import clean_expired_temp_files
        clean_expired_temp_files(ttl_hours=settings.TEMP_FILE_TTL_HOURS)
    except Exception as e:
        logger.warning(f"Auto-cleanup warning: {e}")

    yield

    logger.info("SmartDoc Backend shutting down...")


app = FastAPI(
    title="SmartDoc API",
    description="Sistem Manajemen Dokumen — Converter, Compressor, Splitter, dan OCR Template-Based",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS Middleware — allow all origins for MVP (personal use)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register Routers
app.include_router(jobs_router)
app.include_router(compressor_router)
app.include_router(converter_router)
app.include_router(splitter_router)
app.include_router(merger_router)
app.include_router(watermark_router)
app.include_router(documents_router)
app.include_router(templates_router)


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
