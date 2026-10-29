"""Restrict account roles to user and admin.

Revision ID: 004_restrict_user_roles
Revises: 003_multi_tenancy_and_rbac
"""
from alembic import op

revision = "004_restrict_user_roles"
down_revision = "003_multi_tenancy_and_rbac"
branch_labels = None
depends_on = None


def upgrade():
    op.create_check_constraint("ck_users_role", "users", "role IN ('user', 'admin')")


def downgrade():
    op.drop_constraint("ck_users_role", "users", type_="check")
