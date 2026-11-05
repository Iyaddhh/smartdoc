"""Private-workspace authorization. Platform admins have no content bypass.

Keep resource state (expiry, processing status, quota) outside this policy.
All supported actions currently require ownership; actions are explicit so a
future sharing policy can evolve without silently authorizing new operations.
"""
from enum import Enum
from fastapi import HTTPException
from sqlalchemy import select
from app.models.document import Document
from app.models.user import User


class DocumentAction(str, Enum):
    READ = "read"
    DOWNLOAD = "download"
    PREVIEW = "preview"
    PROCESS = "process"
    UPDATE = "update"
    SAVE = "save"
    DELETE = "delete"
    LINK = "link"


def document_scope(user_id, action=DocumentAction.READ):
    DocumentAction(action)  # Unknown actions fail closed, including internal callers.
    if user_id is None:
        raise HTTPException(404, "Dokumen tidak ditemukan.")
    return Document.user_id == user_id


async def require_document(db, document_id, user_id, action=DocumentAction.READ, *, lock=False):
    scope = document_scope(user_id, action)
    if lock:
        # Quota/storage mutations always lock account before document.
        await db.execute(select(User.id).where(User.id == user_id).with_for_update())
    query = select(Document).where(Document.id == document_id, scope)
    if lock:
        query = query.with_for_update().execution_options(populate_existing=True)
    document = (await db.execute(query)).scalar_one_or_none()
    if document is None:
        raise HTTPException(404, "Dokumen tidak ditemukan.")
    return document
