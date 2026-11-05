import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, BigInteger, DateTime, ForeignKey, Index, Boolean
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID
from app.db.base import Base

class Document(Base):
    __tablename__ = "documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    folder_id = Column(UUID(as_uuid=True), ForeignKey("folders.id", ondelete="SET NULL"), nullable=True)
    feature = Column(String(50), nullable=False)
    custom_name = Column(String(255), nullable=True)  # For rename feature
    original_file = Column(String(500), nullable=False)
    output_file = Column(String(500), nullable=True)  # For converter / compressor
    original_size = Column(BigInteger, nullable=False)
    output_size = Column(BigInteger, nullable=True)
    status = Column(String(50), default="pending", nullable=False)  # pending/processing/done/failed
    is_saved = Column(Boolean, default=False, server_default="false", nullable=False)
    save_requested = Column(Boolean, default=False, server_default="false", nullable=False)
    stored_size_bytes = Column(BigInteger, default=0, server_default="0", nullable=False)
    source_paths = Column(JSONB, default=list, server_default="[]", nullable=False)
    expires_at = Column(DateTime, nullable=True)
    storage_notice = Column(String(30), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None), nullable=False)

    __table_args__ = (
        Index("idx_documents_created_at", "created_at"),
        Index("idx_documents_feature", "feature"),
        Index("idx_documents_user_id", "user_id"),
    )
