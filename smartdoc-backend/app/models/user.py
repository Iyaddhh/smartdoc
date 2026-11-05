import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, Index, CheckConstraint, Integer
from sqlalchemy.dialects.postgresql import UUID
from app.db.base import Base


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username = Column(String(100), unique=True, nullable=False)
    email = Column(String(255), unique=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(20), default="user", nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    token_version = Column(Integer, default=0, server_default="0", nullable=False)
    email_verified = Column(Boolean, default=False, server_default="false", nullable=False)
    display_name = Column(String(100), default="", server_default="", nullable=False)
    timezone = Column(String(60), default="Asia/Jakarta", server_default="Asia/Jakarta", nullable=False)
    onboarding_complete = Column(Boolean, default=False, server_default="false", nullable=False)
    storage_quota_mb = Column(Integer, default=500, server_default="500", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        CheckConstraint("role IN ('user', 'admin')", name="ck_users_role"),
        Index("idx_users_username", "username"),
        Index("idx_users_email", "email"),
    )
