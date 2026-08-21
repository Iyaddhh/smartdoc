import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, Integer, Boolean, DateTime
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.db.base import Base

class Template(Base):
    __tablename__ = "templates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    version = Column(Integer, default=1, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    file_path = Column(String(500), nullable=False)
    thumbnail = Column(String(500), nullable=True)
    fields = Column(JSONB, nullable=False)  # [{key, label, type, zone: {x_norm, y_norm, w_norm, h_norm}}]
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
