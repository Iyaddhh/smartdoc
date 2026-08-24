"""Initial schema migration for templates, documents, and jobs

Revision ID: 001_initial_schema
Revises: 
Create Date: 2026-08-24 10:55:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '001_initial_schema'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create templates table
    op.create_table(
        'templates',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('version', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('file_path', sa.String(length=500), nullable=False),
        sa.Column('thumbnail', sa.String(length=500), nullable=True),
        sa.Column('fields', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    # 2. Create documents table
    op.create_table(
        'documents',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('template_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('templates.id'), nullable=True),
        sa.Column('template_version', sa.Integer(), nullable=True),
        sa.Column('feature', sa.String(length=50), nullable=False),
        sa.Column('custom_name', sa.String(length=255), nullable=True),
        sa.Column('original_file', sa.String(length=500), nullable=False),
        sa.Column('output_file', sa.String(length=500), nullable=True),
        sa.Column('output_docx', sa.String(length=500), nullable=True),
        sa.Column('output_pdf', sa.String(length=500), nullable=True),
        sa.Column('extracted_fields', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('confidence_score', sa.Float(), nullable=True),
        sa.Column('original_size', sa.BigInteger(), nullable=False),
        sa.Column('output_size', sa.BigInteger(), nullable=True),
        sa.Column('status', sa.String(length=50), nullable=False, server_default='pending'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('idx_documents_created_at', 'documents', ['created_at'])
    op.create_index('idx_documents_feature', 'documents', ['feature'])

    # 3. Create jobs table
    op.create_table(
        'jobs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('document_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('documents.id', ondelete='CASCADE'), nullable=False),
        sa.Column('feature', sa.String(length=50), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False, server_default='pending'),
        sa.Column('progress', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('error', sa.Text(), nullable=True),
        sa.Column('started_at', sa.DateTime(), nullable=True),
        sa.Column('finished_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('idx_jobs_document_id', 'jobs', ['document_id'])
    op.create_index('idx_jobs_status', 'jobs', ['status'])


def downgrade() -> None:
    op.drop_index('idx_jobs_status', table_name='jobs')
    op.drop_index('idx_jobs_document_id', table_name='jobs')
    op.drop_table('jobs')

    op.drop_index('idx_documents_feature', table_name='documents')
    op.drop_index('idx_documents_created_at', table_name='documents')
    op.drop_table('documents')

    op.drop_table('templates')
