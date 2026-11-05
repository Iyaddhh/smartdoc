import uuid
from sqlalchemy import Column, String, DateTime, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID
from app.db.base import Base
from app.core.datetime_utils import utc_now


class DocumentAudit(Base):
    __tablename__ = "document_audit"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    actor_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    document_id = Column(UUID(as_uuid=True), ForeignKey("documents.id"), nullable=False)
    action = Column(String(30), nullable=False)
    outcome = Column(String(10), nullable=False)
    code = Column(String(30), nullable=True)
    created_at = Column(DateTime, nullable=False, default=utc_now)
    __table_args__ = (Index("ix_document_audit_owner_document_time", "owner_id", "document_id", "created_at"),)
