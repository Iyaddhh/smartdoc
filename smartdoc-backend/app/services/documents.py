"""Owned document queries shared by history and workspace API adapters."""
from sqlalchemy import func, or_, select

from app.models.document import Document
from app.services.document_policy import document_scope


async def list_owned_documents(db, user_id, *, page=1, limit=50, search="",
                               feature=None, folder_id=None, search_original=False, saved_only=False):
    filters = [document_scope(user_id), Document.feature != "ocr"]
    if saved_only:
        filters.extend([Document.is_saved.is_(True), Document.stored_size_bytes > 0])
    if feature:
        filters.append(Document.feature == feature)
    if folder_id:
        filters.append(Document.folder_id == folder_id)
    if search.strip():
        name_matches = Document.custom_name.ilike(f"%{search.strip()}%")
        filters.append(or_(name_matches, Document.original_file.ilike(f"%{search.strip()}%"))
                       if search_original else name_matches)
    count = (await db.execute(select(func.count()).select_from(Document).where(*filters))).scalar_one()
    rows = (await db.execute(select(Document).where(*filters)
                            .order_by(Document.created_at.desc(), Document.id.desc())
                            .offset((page - 1) * limit).limit(limit))).scalars().all()
    return count, rows
