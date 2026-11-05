from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from app.db.base import Base


class AdminAudit(Base):
    __tablename__ = "admin_audit"
    id = Column(UUID(as_uuid=True), primary_key=True)
    actor_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    target_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    action = Column(String(200), nullable=False)
    created_at = Column(DateTime, nullable=False)
