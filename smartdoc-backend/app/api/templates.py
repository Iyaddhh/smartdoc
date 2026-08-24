import os
import uuid
import json
from typing import Optional
from fastapi import APIRouter, Depends, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from app.db.base import get_db
from app.models.template import Template
from app.core.config import settings
from app.core.response import ok_response, fail_response
from app.core.validators import (
    validate_docx_template, validate_file_extension, validate_and_read_upload,
    validate_file_magic_bytes, validate_image_dimensions
)
from app.core.logger import logger

router = APIRouter(prefix="/api/templates", tags=["Templates"])


@router.get("")
async def list_templates(
    is_active: Optional[bool] = True,
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Template).order_by(desc(Template.created_at))
    if is_active is not None:
        stmt = stmt.where(Template.is_active == is_active)
    result = await db.execute(stmt)
    templates = result.scalars().all()
    return ok_response(
        data=[_tpl_to_dict(t) for t in templates],
        message=f"{len(templates)} template ditemukan"
    )


@router.get("/{template_id}")
async def get_template(template_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    tpl = await db.get(Template, template_id)
    if not tpl:
        return fail_response("Template tidak ditemukan", status_code=404)
    return ok_response(data=_tpl_to_dict(tpl), message="Detail template berhasil diambil")


@router.post("")
async def create_template(
    name: str = Form(...),
    description: Optional[str] = Form(default=None),
    fields_json: str = Form(..., description='JSON array: [{key, label, type, zone: {x_norm,y_norm,w_norm,h_norm}}]'),
    docx_file: UploadFile = File(..., description="File .docx template kosong"),
    thumbnail_file: Optional[UploadFile] = File(default=None, description="Gambar preview thumbnail"),
    db: AsyncSession = Depends(get_db),
):
    # Parse fields
    try:
        fields = json.loads(fields_json)
        assert isinstance(fields, list)
    except Exception:
        return fail_response("fields_json harus berupa JSON array yang valid", status_code=422)

    # Validasi file .docx
    validate_file_extension(docx_file.filename, {".docx"})
    docx_content = await validate_and_read_upload(docx_file, ".docx")
    validate_file_magic_bytes(docx_content, ".docx")

    # Simpan file docx sementara untuk validasi
    temp_docx = os.path.join(settings.STORAGE_PATH, "temp", f"{uuid.uuid4()}.docx")
    with open(temp_docx, "wb") as f:
        f.write(docx_content)

    try:
        validate_docx_template(temp_docx, fields)
    finally:
        if os.path.exists(temp_docx):
            os.remove(temp_docx)

    # Simpan permanen file docx template
    tpl_id = uuid.uuid4()
    tpl_dir = os.path.join(settings.STORAGE_PATH, "templates", str(tpl_id))
    os.makedirs(tpl_dir, exist_ok=True)
    docx_path = os.path.join(tpl_dir, "template_v1.docx")
    with open(docx_path, "wb") as f:
        f.write(docx_content)

    # Simpan thumbnail jika ada
    thumbnail_path = None
    if thumbnail_file:
        thumb_ext = validate_file_extension(thumbnail_file.filename, {".jpg", ".jpeg", ".png"})
        thumb_content = await validate_and_read_upload(thumbnail_file, thumb_ext)
        validate_file_magic_bytes(thumb_content, thumb_ext)
        validate_image_dimensions(thumb_content)
        thumbnail_path = os.path.join(tpl_dir, f"thumbnail{thumb_ext}")
        with open(thumbnail_path, "wb") as f:
            f.write(thumb_content)

    # Buat record Template di DB
    tpl = Template(
        id=tpl_id,
        name=name,
        description=description,
        version=1,
        is_active=True,
        docx_path=docx_path,
        thumbnail_path=thumbnail_path,
        fields=fields,
    )
    db.add(tpl)
    await db.commit()
    await db.refresh(tpl)

    logger.info(f"Template dibuat: '{name}' (id={tpl_id})")
    return ok_response(
        data=_tpl_to_dict(tpl),
        message=f"Template '{name}' berhasil dibuat",
        status_code=201
    )


@router.put("/{template_id}")
async def update_template(
    template_id: uuid.UUID,
    name: Optional[str] = Form(default=None),
    description: Optional[str] = Form(default=None),
    fields_json: Optional[str] = Form(default=None),
    docx_file: Optional[UploadFile] = File(default=None),
    thumbnail_file: Optional[UploadFile] = File(default=None),
    db: AsyncSession = Depends(get_db),
):
    tpl = await db.get(Template, template_id)
    if not tpl:
        return fail_response("Template tidak ditemukan", status_code=404)

    tpl_dir = os.path.join(settings.STORAGE_PATH, "templates", str(tpl.id))
    os.makedirs(tpl_dir, exist_ok=True)

    if name is not None:
        tpl.name = name
    if description is not None:
        tpl.description = description

    if fields_json is not None:
        try:
            fields = json.loads(fields_json)
            assert isinstance(fields, list)
            tpl.fields = fields
        except Exception:
            return fail_response("fields_json harus berupa JSON array yang valid", status_code=422)

    # Jika upload .docx baru -> increment version
    if docx_file:
        validate_file_extension(docx_file.filename, {".docx"})
        docx_content = await validate_and_read_upload(docx_file, ".docx")
        validate_file_magic_bytes(docx_content, ".docx")
        new_version = tpl.version + 1
        new_docx_path = os.path.join(tpl_dir, f"template_v{new_version}.docx")
        with open(new_docx_path, "wb") as f:
            f.write(docx_content)
        tpl.docx_path = new_docx_path
        tpl.version = new_version

    if thumbnail_file:
        thumb_ext = validate_file_extension(thumbnail_file.filename, {".jpg", ".jpeg", ".png"})
        thumb_content = await validate_and_read_upload(thumbnail_file, thumb_ext)
        validate_file_magic_bytes(thumb_content, thumb_ext)
        validate_image_dimensions(thumb_content)
        thumbnail_path = os.path.join(tpl_dir, f"thumbnail{thumb_ext}")
        with open(thumbnail_path, "wb") as f:
            f.write(thumb_content)
        tpl.thumbnail_path = thumbnail_path

    await db.commit()
    await db.refresh(tpl)

    logger.info(f"Template {template_id} diupdate (v{tpl.version})")
    return ok_response(data=_tpl_to_dict(tpl), message="Template berhasil diperbarui")


@router.delete("/{template_id}")
async def delete_template(template_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Soft delete: set is_active=False agar dokumen historis tetap aman."""
    tpl = await db.get(Template, template_id)
    if not tpl:
        return fail_response("Template tidak ditemukan", status_code=404)

    tpl.is_active = False
    await db.commit()
    logger.info(f"Template {template_id} dinonaktifkan (soft delete)")
    return ok_response(message=f"Template '{tpl.name}' berhasil dinonaktifkan")


def _tpl_to_dict(tpl: Template) -> dict:
    return {
        "id": str(tpl.id),
        "name": tpl.name,
        "description": tpl.description,
        "version": tpl.version,
        "is_active": tpl.is_active,
        "fields": tpl.fields,
        "thumbnail": tpl.thumbnail_path,
        "created_at": tpl.created_at.isoformat(),
    }
