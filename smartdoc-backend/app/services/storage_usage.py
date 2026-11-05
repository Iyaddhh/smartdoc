"""The recorded storage usage shared by quota enforcement and admin reporting."""
from sqlalchemy import select, func, case
from app.models.document import Document


def storage_bytes_expression():
    return func.coalesce(func.sum(case((Document.is_saved.is_(True), Document.stored_size_bytes), else_=0)), 0)


async def account_storage_usage(db, user_ids):
    if not user_ids:
        return {}
    rows = (await db.execute(select(Document.user_id, storage_bytes_expression().label("bytes"))
                             .where(Document.user_id.in_(user_ids)).group_by(Document.user_id))).all()
    return {row.user_id: int(row.bytes) for row in rows}
