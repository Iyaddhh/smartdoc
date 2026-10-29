import re
from typing import Literal
from pydantic import AliasChoices, Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    APP_ENV: str = "development"
    DATABASE_URL: str = "postgresql+asyncpg://smartdoc:smartdoc_secret@db:5432/smartdoc_db"
    JWT_ACCESS_SECRET: str = Field(
        default="smartdoc-development-only-secret-key-do-not-use-in-production",
        validation_alias=AliasChoices("JWT_ACCESS_SECRET", "SECRET_KEY"),
        repr=False,
    )
    JWT_ACCESS_EXPIRES_IN: str = "15m"
    JWT_REFRESH_EXPIRES_IN: str = "7d"
    JWT_REFRESH_REMEMBER_ME_EXPIRES_IN: str = "30d"
    AUTH_COOKIE_SECURE: bool = False
    AUTH_COOKIE_SAME_SITE: Literal["lax", "strict", "none"] = "lax"
    AUTH_COOKIE_DOMAIN: str = ""
    TRUST_PROXY: bool = False
    STORAGE_PATH: str = "./storage"

    # Limit ukuran berkas per kategori (MB)
    MAX_FILE_SIZE_DOCUMENT_MB: int = 35   # docx, xlsx, pptx
    MAX_FILE_SIZE_PDF_MB: int = 35        # pdf
    MAX_FILE_SIZE_IMAGE_MB: int = 12      # jpg, jpeg, png

    # Batas non-ukuran berkas
    MAX_IMAGE_DIMENSION_PX: int = 10000   # lebar/tinggi maksimal (px)
    MAX_PDF_PAGES: int = 50               # maksimal halaman PDF
    MAX_UPLOAD_FILES: int = Field(default=50, ge=1, le=1000)
    MAX_TOTAL_UPLOAD_MB: int = Field(default=35, ge=1)
    MAX_REQUEST_SIZE_MB: int = Field(default=37, ge=1)
    MAX_TOTAL_IMAGE_PIXELS: int = Field(default=100_000_000, ge=1)
    MAX_PDF_PAGE_EDGE_POINTS: int = Field(default=2400, ge=72)
    MAX_OFFICE_UNCOMPRESSED_MB: int = Field(default=128, ge=1)
    MAX_OFFICE_ENTRY_MB: int = Field(default=32, ge=1)
    MAX_OFFICE_ENTRIES: int = Field(default=2000, ge=1)
    MAX_OFFICE_COMPRESSION_RATIO: int = Field(default=200, ge=1)
    MAX_ACTIVE_JOBS_PER_USER: int = Field(default=2, ge=1)
    MAX_ACTIVE_JOBS_GLOBAL: int = Field(default=12, ge=1)
    MIN_FREE_DISK_MB: int = Field(default=256, ge=1)
    API_RATE_LIMIT: str = "120/minute"
    PROCESS_RATE_LIMIT: str = "10/minute"
    PREVIEW_RATE_LIMIT: str = "20/minute"

    TEMP_FILE_TTL_HOURS: int = 24
    JOB_TIMEOUT_SECONDS: int = 300
    COMPRESSION_IMAGE_QUALITY: int = 85
    COMPRESSION_IMAGE_DPI: int = 150
    CORS_ALLOWED_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001"

    @field_validator("JWT_ACCESS_EXPIRES_IN", "JWT_REFRESH_EXPIRES_IN", "JWT_REFRESH_REMEMBER_ME_EXPIRES_IN")
    @classmethod
    def validate_duration(cls, value: str) -> str:
        if not re.fullmatch(r"[1-9][0-9]*[smhd]", value):
            raise ValueError("Gunakan durasi positif dengan satuan s/m/h/d, misalnya 15m atau 7d.")
        return value

    @model_validator(mode="after")
    def validate_cookie_policy(self):
        if self.AUTH_COOKIE_SAME_SITE == "none" and not self.AUTH_COOKIE_SECURE:
            raise ValueError("SameSite=none membutuhkan AUTH_COOKIE_SECURE=true.")
        return self

    @staticmethod
    def duration_seconds(value: str) -> int:
        return int(value[:-1]) * {"s": 1, "m": 60, "h": 3600, "d": 86400}[value[-1]]

    @property
    def SECRET_KEY(self) -> str:
        """Compatibility for older callers; new configuration uses JWT_ACCESS_SECRET."""
        return self.JWT_ACCESS_SECRET

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
        """Enforce a strong JWT access secret in production."""
        if self.APP_ENV.lower() == "production" and (
            len(self.SECRET_KEY.encode()) < 32
            or self.SECRET_KEY == "smartdoc-development-only-secret-key-do-not-use-in-production"
            or self.SECRET_KEY.lower().startswith(("changeme", "change_me", "replace"))
        ):
            raise RuntimeError(
                "Keamanan Kritis: JWT_ACCESS_SECRET belum aman untuk production. "
                "Harap atur JWT_ACCESS_SECRET yang unik dan kuat di file .env."
            )

settings = Settings()
settings.validate_production_security()
