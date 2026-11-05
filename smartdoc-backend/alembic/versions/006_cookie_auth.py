"""Cookie sessions, email verification, and profile fields.

Revision ID: 006_cookie_auth
Revises: 005_user_token_version
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "006_cookie_auth"
down_revision = "005_user_token_version"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("email_verified", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.alter_column("users", "email_verified", server_default=sa.false())
    for name, type_, default in [("display_name", sa.String(100), ""), ("timezone", sa.String(60), "Asia/Jakarta"), ("onboarding_complete", sa.Boolean(), "false"), ("storage_quota_mb", sa.Integer(), "500")]:
        op.add_column("users", sa.Column(name, type_, nullable=False, server_default=default))
    op.create_table("auth_sessions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("revoked_at", sa.DateTime()),
        sa.Column("remember_me", sa.Boolean(), nullable=False))
    op.create_index("ix_auth_sessions_user_id", "auth_sessions", ["user_id"])
    op.create_table("auth_action_tokens",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("purpose", sa.String(20), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("used_at", sa.DateTime()))
    op.create_index("ix_auth_action_tokens_user_id", "auth_action_tokens", ["user_id"])
    op.execute("UPDATE users SET token_version = token_version + 1")


def downgrade():
    op.drop_table("auth_action_tokens")
    op.drop_table("auth_sessions")
    for name in ("storage_quota_mb", "onboarding_complete", "timezone", "display_name", "email_verified"):
        op.drop_column("users", name)
