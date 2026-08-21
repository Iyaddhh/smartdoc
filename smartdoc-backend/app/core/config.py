import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    APP_ENV: str = "development"
    DATABASE_URL: str = "postgresql+asyncpg://smartdoc:smartdoc_secret@db:5432/smartdoc_db"
    SECRET_KEY: str = "smartdoc_secret_key"
    STORAGE_PATH: str = "./storage"
    MAX_FILE_SIZE_MB: int = 50
    TEMP_FILE_TTL_HOURS: int = 24
    MAX_PDF_PAGES: int = 50
    JOB_TIMEOUT_SECONDS: int = 300
    COMPRESSION_IMAGE_QUALITY: int = 85
    COMPRESSION_IMAGE_DPI: int = 150
    OCR_CONFIDENCE_THRESHOLD: int = 70
    NEXT_PUBLIC_API_URL: str = "http://localhost:8000"

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
