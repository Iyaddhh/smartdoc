from app.services.document_audit import record_document_activity
"""Private workspace; ownership is checked on every resource operation."""
import os
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, File, UploadFile, Form, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select, func, desc, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from app.core.config import settings
from app.core.datetime_utils import utc_now
from app.core.timezones import WORKSPACE_TIMEZONES
from app.core.response import ok_response
from app.core.security import get_current_user
from app.core.uploads import stage_pptx_upload
from app.core.validators import validate_and_read_upload, validate_file_extension, ALLOWED_CONVERTER_EXTENSIONS
from app.db.base import get_db
from app.models.document import Document
from app.services.documents import list_owned_documents
from app.services.document_policy import require_document, document_scope, DocumentAction
from app.services.storage_usage import account_storage_usage
from app.services.document_storage import download_available
from app.models.user import User
from app.models.workspace import Folder, WorkspaceItem, AgendaCategory

router = APIRouter(prefix="/api/workspace", tags=["Workspace"])


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid")


class FolderInput(Input):
    name: str = Field(min_length=1, max_length=100)


class MoveInput(Input):
    folder_id: uuid.UUID | None = None


class CategoryInput(Input):
    name: str = Field(min_length=1, max_length=50)
    color: str = Field(default="#2563eb", pattern=r"^#[0-9a-fA-F]{6}$")


class ItemInput(Input):
    kind: Literal["task", "event"]
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=5000)
    status: Literal["todo", "doing", "done"] = "todo"
    priority: Literal["normal", "high", "low"] = "normal"
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    due_at: datetime | None = None
    document_ids: list[uuid.UUID] = Field(default_factory=list, max_length=20)
    category_id: uuid.UUID | None = None


def item_data(item):
    return {key: (str(value) if isinstance(value, uuid.UUID) else value.isoformat() if isinstance(value, datetime) else value)
            for key in ("id", "kind", "title", "description", "status", "priority", "starts_at", "ends_at", "due_at", "document_ids", "category_id")
            for value in [getattr(item, key)]}


async def owned(db, model, resource_id, user_id):
    result = (await db.execute(select(model).where(model.id == resource_id, model.user_id == user_id))).scalar_one_or_none()
    if not result:
        raise HTTPException(404, "Data tidak ditemukan.")
    return result


async def used_storage(db, user_id):
    return (await account_storage_usage(db, [user_id])).get(user_id, 0)


@router.get("/summary")
async def summary(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    documents = (await db.execute(select(func.count()).select_from(Document).where(document_scope(user.id)))).scalar_one()
    tasks = (await db.execute(select(func.count()).select_from(WorkspaceItem).where(WorkspaceItem.user_id == user.id, WorkspaceItem.kind == "task", WorkspaceItem.status != "done"))).scalar_one()
    now = datetime.now(timezone.utc)
    soon = now + timedelta(days=1)
    items = (await db.execute(select(WorkspaceItem).where(WorkspaceItem.user_id == user.id, WorkspaceItem.status != "done",
        or_(and_(WorkspaceItem.kind == "task", WorkspaceItem.due_at <= soon),
            and_(WorkspaceItem.kind == "event", WorkspaceItem.starts_at >= now, WorkspaceItem.starts_at <= soon)))
        .order_by(func.coalesce(WorkspaceItem.due_at, WorkspaceItem.starts_at)).limit(20))).scalars().all()
    reminders = [item_data(item) for item in items]
    return ok_response(data={"document_count": documents, "open_tasks": tasks, "storage_bytes": await used_storage(db, user.id),
                             "quota_mb": user.storage_quota_mb, "reminders": reminders[:20]})


@router.get("/folders")
async def folders(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(Folder).where(Folder.user_id == user.id).order_by(Folder.name))).scalars().all()
    return ok_response(data=[{"id": str(row.id), "name": row.name} for row in rows])


@router.post("/folders", status_code=201)
async def create_folder(body: FolderInput, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not body.name.strip():
        raise HTTPException(422, "Nama folder wajib diisi.")
    folder = Folder(id=uuid.uuid4(), user_id=user.id, name=body.name.strip())
    db.add(folder)
    await db.commit()
    return ok_response(data={"id": str(folder.id), "name": folder.name}, status_code=201)


@router.patch("/folders/{folder_id}")
async def rename_folder(folder_id: uuid.UUID, body: FolderInput, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    folder = await owned(db, Folder, folder_id, user.id)
    if not body.name.strip():
        raise HTTPException(422, "Nama folder wajib diisi.")
    folder.name = body.name.strip()
    await db.commit()
    return ok_response()


@router.delete("/folders/{folder_id}")
async def delete_folder(folder_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    folder = await owned(db, Folder, folder_id, user.id)
    await db.delete(folder)
    await db.commit()
    return ok_response(message="Folder dihapus. Dokumennya tetap tersedia tanpa folder.")


@router.get("/documents")
async def documents(folder_id: uuid.UUID | None = None, search: str = "", page: int = Query(1, ge=1),
                    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if folder_id:
        await owned(db, Folder, folder_id, user.id)
    count, rows = await list_owned_documents(db, user.id, page=page, search=search, folder_id=folder_id, saved_only=True)
    return ok_response(data={"total": count, "items": [{"id": str(row.id), "name": row.custom_name, "folder_id": str(row.folder_id) if row.folder_id else None,
                            "feature": row.feature, "status": row.status, "format": Path(row.output_file or "").suffix.lower().lstrip("."),
                            "download_available": download_available(row), "size": row.output_size or row.original_size} for row in rows]})


@router.post("/documents", status_code=201)
async def upload_document(file: UploadFile = File(...), folder_id: uuid.UUID | None = Form(None),
                          user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if folder_id:
        await owned(db, Folder, folder_id, user.id)
    # Lock the account so concurrent uploads cannot exceed the private storage quota.
    await db.execute(select(User.id).where(User.id == user.id).with_for_update())
    ext = validate_file_extension(file.filename or "", ALLOWED_CONVERTER_EXTENSIONS)
    directory = Path(settings.STORAGE_PATH) / "documents" / "originals"
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{uuid.uuid4()}{ext}"
    try:
        if ext == ".pptx":
            size = await stage_pptx_upload(file, path)
        else:
            content = await validate_and_read_upload(file, ext)
            size = len(content)
            path.write_bytes(content)
        if await used_storage(db, user.id) + size > user.storage_quota_mb * 1024 * 1024:
            raise HTTPException(413, "Kuota penyimpanan pribadi tidak mencukupi.")
        document = Document(id=uuid.uuid4(), user_id=user.id, folder_id=folder_id, feature="upload", custom_name=Path((file.filename or "dokumen").replace("\\", "/")).name,
                            original_file=str(path), output_file=str(path), original_size=size, output_size=0, status="done",
                            is_saved=True, save_requested=True, stored_size_bytes=size)
        db.add(document)
        await db.flush()
        record_document_activity(db, document, "uploaded")
        await db.commit()
    except BaseException:
        try:
            await db.rollback()
        finally:
            path.unlink(missing_ok=True)
        raise
    return ok_response(data={"id": str(document.id)}, status_code=201)


@router.get("/documents/{document_id}")
async def document_detail(document_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    document = await require_document(db, document_id, user.id)
    folder = await owned(db, Folder, document.folder_id, user.id) if document.folder_id else None
    related = (await db.execute(select(WorkspaceItem).where(
        WorkspaceItem.user_id == user.id,
        WorkspaceItem.document_ids.contains([str(document.id)]),
    ).order_by(desc(WorkspaceItem.created_at)))).scalars().all()
    return ok_response(data={
        "id": str(document.id), "name": document.custom_name or "Dokumen",
        "feature": document.feature, "status": document.status,
        "format": Path(document.output_file or "").suffix.lower().lstrip("."),
        "size": document.output_size or document.original_size,
        "created_at": document.created_at.isoformat() + "Z",
        "folder_id": str(folder.id) if folder else None, "folder_name": folder.name if folder else None,
        "is_saved": document.is_saved, "download_available": download_available(document),
        "related_items": [item_data(item) for item in related],
    })


@router.patch("/documents/{document_id}/folder")
async def move_document(document_id: uuid.UUID, body: MoveInput, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    document = await require_document(db, document_id, user.id, DocumentAction.UPDATE, lock=True)
    if body.folder_id:
        await owned(db, Folder, body.folder_id, user.id)
    if document.folder_id != body.folder_id:
        record_document_activity(db, document, "moved")
    document.folder_id = body.folder_id
    await db.commit()
    return ok_response()


def category_data(category):
    return {"id": str(category.id), "name": category.name, "color": category.color}


async def save_category(body, category, db):
    if not body.name.strip():
        raise HTTPException(422, "Nama kategori wajib diisi.")
    category.name = body.name.strip()
    category.color = body.color.lower()
    db.add(category)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, "Kategori dengan nama tersebut sudah ada.")


@router.get("/categories")
async def categories(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(AgendaCategory).where(AgendaCategory.user_id == user.id).order_by(func.lower(AgendaCategory.name)))).scalars().all()
    return ok_response(data=[category_data(row) for row in rows])


@router.post("/categories", status_code=201)
async def create_category(body: CategoryInput, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    category = AgendaCategory(id=uuid.uuid4(), user_id=user.id)
    await save_category(body, category, db)
    return ok_response(data=category_data(category), status_code=201)


@router.patch("/categories/{category_id}")
async def update_category(category_id: uuid.UUID, body: CategoryInput, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    category = await owned(db, AgendaCategory, category_id, user.id)
    await save_category(body, category, db)
    return ok_response(data=category_data(category))


@router.delete("/categories/{category_id}")
async def delete_category(category_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    category = await owned(db, AgendaCategory, category_id, user.id)
    await db.delete(category)
    await db.commit()
    return ok_response(message="Kategori dihapus. Agendanya tetap tersedia tanpa kategori.")


@router.get("/items")
async def items(kind: Literal["task", "event"] | None = None, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    query = select(WorkspaceItem).where(WorkspaceItem.user_id == user.id)
    if kind:
        query = query.where(WorkspaceItem.kind == kind)
    rows = (await db.execute(query.order_by(desc(WorkspaceItem.created_at)).limit(500))).scalars().all()
    return ok_response(data=[item_data(row) for row in rows])


async def assign_item(body, item, user, db):
    if not body.title.strip():
        raise HTTPException(422, "Judul wajib diisi.")
    for document_id in body.document_ids:
        await require_document(db, document_id, user.id, DocumentAction.LINK)
    if body.category_id:
        category = (await db.execute(select(AgendaCategory).where(
            AgendaCategory.id == body.category_id, AgendaCategory.user_id == user.id).with_for_update())).scalar_one_or_none()
        if not category:
            raise HTTPException(404, "Kategori tidak ditemukan.")
    values = body.model_dump()
    for name in ("starts_at", "ends_at", "due_at"):
        value = values[name]
        if value:
            values[name] = (value if value.tzinfo else value.replace(tzinfo=WORKSPACE_TIMEZONES[user.timezone])).astimezone(timezone.utc)
    if body.kind == "event" and (not values["starts_at"] or not values["ends_at"] or values["ends_at"] <= values["starts_at"]):
        raise HTTPException(422, "Waktu selesai kegiatan harus sesudah waktu mulai.")
    if body.kind == "task":
        values["starts_at"] = values["ends_at"] = None
    else:
        values["due_at"] = None
    values["document_ids"] = [str(value) for value in body.document_ids]
    values["title"] = body.title.strip()
    for name, value in values.items():
        setattr(item, name, value)


@router.post("/items", status_code=201)
async def create_item(body: ItemInput, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    item = WorkspaceItem(id=uuid.uuid4(), user_id=user.id)
    await assign_item(body, item, user, db)
    db.add(item)
    await db.commit()
    return ok_response(data=item_data(item), status_code=201)


@router.put("/items/{item_id}")
async def update_item(item_id: uuid.UUID, body: ItemInput, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    item = await owned(db, WorkspaceItem, item_id, user.id)
    await assign_item(body, item, user, db)
    await db.commit()
    return ok_response(data=item_data(item))


@router.delete("/items/{item_id}")
async def delete_item(item_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    item = await owned(db, WorkspaceItem, item_id, user.id)
    await db.delete(item)
    await db.commit()
    return ok_response()
