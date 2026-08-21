import uuid
from datetime import datetime
from sqlalchemy import Column, String, BigInteger, Float, Integer, DateTime, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.db.base import Base

class Document(Base):
    __tablename__ = "documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    template_id = Column(UUID(as_uuid=True), ForeignKey("templates.id"), nullable=True)
    template_version = Column(Integer, nullable=True)
    feature = Column(String(50), nullable=False)  # converter / compressor / ocr
    custom_name = Column(String(255), nullable=True)  # For rename feature
    original_file = Column(String(500), nullable=False)
    output_file = Column(String(500), nullable=True)  # For converter / compressor
    output_docx = Column(String(500), nullable=True)  # For OCR
    output_pdf = Column(String(500), nullable=True)   # For OCR
    extracted_fields = Column(JSONB, nullable=True)   # For OCR
    confidence_score = Column(Float, nullable=True)   # For OCR (0.0 - 1.0)
    original_size = Column(BigInteger, nullable=False)
    output_size = Column(BigInteger, nullable=True)
    status = Column(String(50), default="pending", nullable=False)  # pending/processing/done/failed
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        Index("idx_documents_created_at", "created_at"),
        Index("idx_documents_feature", "feature"),
    )
