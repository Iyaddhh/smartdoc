"""Administrative audit trail.

Revision ID: 008_admin_audit
Revises: 007_workspace
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "008_admin_audit"
down_revision = "007_workspace"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("admin_audit", sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("actor_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("target_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("action", sa.String(200), nullable=False), sa.Column("created_at", sa.DateTime(), nullable=False))


def downgrade():
    op.drop_table("admin_audit")
