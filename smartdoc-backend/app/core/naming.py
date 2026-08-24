from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.document import Document


async def get_unique_document_name(db: AsyncSession, base_stem: str, ext: str) -> str:
    """
    Menghasilkan nama file unik dengan format bertingkat:
    - Contoh: "Dokumen.pdf"
    - Jika sudah ada: "Dokumen (1).pdf"
    - Jika sudah ada: "Dokumen (2).pdf"
    dst.
    """
    ext_clean = ext if ext.startswith(".") else f".{ext}"
    initial_name = f"{base_stem}{ext_clean}"

    stmt = select(Document.custom_name).where(
        Document.custom_name.ilike(f"{base_stem}%{ext_clean}")
    )
    result = await db.execute(stmt)
    existing_names = set(result.scalars().all())

    if initial_name not in existing_names:
        return initial_name

    counter = 1
    while True:
        candidate = f"{base_stem} ({counter}){ext_clean}"
        if candidate not in existing_names:
            return candidate
        counter += 1
