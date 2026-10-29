from pathlib import Path
from app.core.config import settings

def is_storage_file(path: str) -> bool:
    return Path(path).resolve().is_relative_to(Path(settings.STORAGE_PATH).resolve())
