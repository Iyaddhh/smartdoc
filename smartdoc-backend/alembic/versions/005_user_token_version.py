"""Invalidate all account tokens on logout.

Revision ID: 005_user_token_version
Revises: 004_restrict_user_roles
"""
from alembic import op
import sqlalchemy as sa

revision = "005_user_token_version"
down_revision = "004_restrict_user_roles"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("token_version", sa.Integer(), server_default="0", nullable=False))


def downgrade():
    op.drop_column("users", "token_version")
