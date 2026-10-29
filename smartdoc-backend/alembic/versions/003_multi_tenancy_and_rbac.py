"""Add user_id to documents and role to users for multi-tenancy and RBAC

Revision ID: 003_multi_tenancy_and_rbac
Revises: 002_add_users_table
Create Date: 2026-09-22 14:35:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "003_multi_tenancy_and_rbac"
down_revision: Union[str, None] = "002_add_users_table"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add role to users
    op.add_column(
        "users",
        sa.Column("role", sa.String(length=20), nullable=False, server_default="user")
    )

    # 2. Add user_id to documents
    op.add_column(
        "documents",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True)
    )
    op.create_foreign_key(
        "fk_documents_user_id_users",
        "documents",
        "users",
        ["user_id"],
        ["id"],
        ondelete="CASCADE"
    )
    op.create_index("idx_documents_user_id", "documents", ["user_id"])


def downgrade() -> None:
    op.drop_index("idx_documents_user_id", table_name="documents")
    op.drop_constraint("fk_documents_user_id_users", "documents", type_="foreignkey")
    op.drop_column("documents", "user_id")
    op.drop_column("users", "role")
