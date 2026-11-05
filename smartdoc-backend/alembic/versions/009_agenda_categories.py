"""Private agenda categories; deleting a category preserves its items.

Revision ID: 009_agenda_categories
Revises: 008_admin_audit
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "009_agenda_categories"
down_revision = "008_admin_audit"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("agenda_categories",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(50), nullable=False),
        sa.Column("color", sa.String(7), nullable=False))
    op.create_index("ix_agenda_categories_user_id", "agenda_categories", ["user_id"])
    op.create_index("uq_agenda_category_owner_name", "agenda_categories", ["user_id", sa.text("lower(name)")], unique=True)
    op.add_column("workspace_items", sa.Column("category_id", UUID(as_uuid=True), nullable=True))
    op.create_foreign_key("fk_workspace_item_category", "workspace_items", "agenda_categories", ["category_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_workspace_items_category_id", "workspace_items", ["category_id"])


def downgrade():
    op.drop_index("ix_workspace_items_category_id", table_name="workspace_items")
    op.drop_constraint("fk_workspace_item_category", "workspace_items", type_="foreignkey")
    op.drop_column("workspace_items", "category_id")
    op.drop_table("agenda_categories")
