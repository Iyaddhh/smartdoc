"""Private documents, folders, tasks and calendar events.

Revision ID: 007_workspace
Revises: 006_cookie_auth
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "007_workspace"
down_revision = "006_cookie_auth"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("folders", sa.Column("id", UUID(as_uuid=True), primary_key=True),
                    sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
                    sa.Column("name", sa.String(100), nullable=False))
    op.create_index("ix_folders_user_id", "folders", ["user_id"])
    op.add_column("documents", sa.Column("folder_id", UUID(as_uuid=True), sa.ForeignKey("folders.id", ondelete="SET NULL")))
    op.create_table("workspace_items",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(10), nullable=False), sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False), sa.Column("status", sa.String(20), nullable=False),
        sa.Column("priority", sa.String(10), nullable=False), sa.Column("starts_at", sa.DateTime(timezone=True)),
        sa.Column("ends_at", sa.DateTime(timezone=True)), sa.Column("due_at", sa.DateTime(timezone=True)),
        sa.Column("document_ids", JSONB(), nullable=False), sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("kind IN ('task','event')", name="ck_workspace_kind"))
    op.create_index("ix_workspace_items_user_id", "workspace_items", ["user_id"])


def downgrade():
    op.drop_table("workspace_items")
    op.drop_column("documents", "folder_id")
    op.drop_table("folders")
