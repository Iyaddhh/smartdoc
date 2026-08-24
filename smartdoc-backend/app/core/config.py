from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    APP_ENV: str = "development"
    DATABASE_URL: str = "postgresql+asyncpg://smartdoc:smartdoc_secret@db:5432/smartdoc_db"
    SECRET_KEY: str = "smartdoc_secret_key"
    STORAGE_PATH: str = "./storage"

    # Limit ukuran berkas per kategori (MB)
    MAX_FILE_SIZE_DOCUMENT_MB: int = 35   # docx, xlsx, pptx
    MAX_FILE_SIZE_PDF_MB: int = 35        # pdf
    MAX_FILE_SIZE_IMAGE_MB: int = 12      # jpg, jpeg, png

    # Batas non-ukuran berkas
    MAX_IMAGE_DIMENSION_PX: int = 6000    # lebar/tinggi maksimal (px)
    MAX_PDF_PAGES: int = 50               # maksimal halaman PDF

    TEMP_FILE_TTL_HOURS: int = 24
    JOB_TIMEOUT_SECONDS: int = 300
    COMPRESSION_IMAGE_QUALITY: int = 85
    COMPRESSION_IMAGE_DPI: int = 150
    OCR_CONFIDENCE_THRESHOLD: int = 70
    CORS_ALLOWED_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"

    def get_max_size_for_extension(self, ext: str) -> int:
        """Mengembalikan batas ukuran maksimum dalam bytes berdasarkan kategori ekstensi berkas."""
        ext_clean = ext.lower().lstrip(".")
        if ext_clean in {"docx", "xlsx", "pptx"}:
            return self.MAX_FILE_SIZE_DOCUMENT_MB * 1024 * 1024
        elif ext_clean == "pdf":
            return self.MAX_FILE_SIZE_PDF_MB * 1024 * 1024
        elif ext_clean in {"jpg", "jpeg", "png"}:
            return self.MAX_FILE_SIZE_IMAGE_MB * 1024 * 1024
        return self.MAX_FILE_SIZE_DOCUMENT_MB * 1024 * 1024

    def get_cors_origins(self) -> list[str]:
        """Parse comma-separated CORS allowed origins list."""
        return [origin.strip() for origin in self.CORS_ALLOWED_ORIGINS.split(",") if origin.strip()]

    def validate_production_security(self) -> None:
        """Enforce strong SECRET_KEY in production environment."""
        if self.APP_ENV.lower() == "production" and self.SECRET_KEY == "smartdoc_secret_key":
            raise RuntimeError(
                "Keamanan Kritis: SECRET_KEY masih menggunakan default value di mode production. "
                "Harap atur SECRET_KEY yang unik dan kuat di file .env."
            )

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
settings.validate_production_security()
