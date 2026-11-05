"""Separate activity history from persistent file storage without deleting data."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "010_document_storage"
down_revision = "009_agenda_categories"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("documents", sa.Column("is_saved", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("documents", sa.Column("save_requested", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("documents", sa.Column("stored_size_bytes", sa.BigInteger(), nullable=False, server_default="0"))
    op.add_column("documents", sa.Column("source_paths", JSONB(), nullable=False, server_default="[]"))
    op.add_column("documents", sa.Column("expires_at", sa.DateTime(), nullable=True))
    op.add_column("documents", sa.Column("storage_notice", sa.String(30), nullable=True))
    # Existing completed files are preserved. Startup measures their real sizes.
    op.execute("UPDATE documents SET is_saved = true, save_requested = true WHERE status = 'done'")
    op.create_index("ix_documents_saved_owner", "documents", ["user_id", "is_saved"])


def downgrade():
    op.drop_index("ix_documents_saved_owner", table_name="documents")
    for name in ("storage_notice", "expires_at", "source_paths", "stored_size_bytes", "save_requested", "is_saved"):
        op.drop_column("documents", name)
