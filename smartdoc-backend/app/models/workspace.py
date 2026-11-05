import uuid
from sqlalchemy import Column, String, Text, DateTime, ForeignKey, CheckConstraint, Index, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.db.base import Base
from app.core.datetime_utils import utc_now


class Folder(Base):
    __tablename__ = "folders"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(100), nullable=False)


class AgendaCategory(Base):
    __tablename__ = "agenda_categories"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(50), nullable=False)
    color = Column(String(7), nullable=False, default="#2563eb")
    __table_args__ = (Index("uq_agenda_category_owner_name", user_id, func.lower(name), unique=True),)


class WorkspaceItem(Base):
    __tablename__ = "workspace_items"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    kind = Column(String(10), nullable=False)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=False, default="")
    status = Column(String(20), nullable=False, default="todo")
    priority = Column(String(10), nullable=False, default="normal")
    starts_at = Column(DateTime(timezone=True))
    ends_at = Column(DateTime(timezone=True))
    due_at = Column(DateTime(timezone=True))
    document_ids = Column(JSONB, nullable=False, default=list)
    category_id = Column(UUID(as_uuid=True), ForeignKey("agenda_categories.id", ondelete="SET NULL"), index=True)
    created_at = Column(DateTime, default=utc_now, nullable=False)
    __table_args__ = (CheckConstraint("kind IN ('task','event')", name="ck_workspace_kind"),)
