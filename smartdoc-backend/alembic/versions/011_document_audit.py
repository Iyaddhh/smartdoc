"""Private document activity metadata; no backfill of invented history."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "011_document_audit"
down_revision = "010_document_storage"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("document_audit",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("owner_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("actor_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("document_id", UUID(as_uuid=True), sa.ForeignKey("documents.id"), nullable=False),
        sa.Column("action", sa.String(30), nullable=False),
        sa.Column("outcome", sa.String(10), nullable=False),
        sa.Column("code", sa.String(30), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False))
    op.create_index("ix_document_audit_owner_document_time", "document_audit", ["owner_id", "document_id", "created_at"])


def downgrade():
    op.drop_table("document_audit")
