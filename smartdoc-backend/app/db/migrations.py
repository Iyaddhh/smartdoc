"""Schema migrations are a startup gate, including in development."""
import asyncio
from pathlib import Path
from alembic import command
from alembic.config import Config


async def upgrade_database() -> None:
    backend_root = Path(__file__).resolve().parents[2]

    def upgrade():
        config = Config(str(backend_root / "alembic.ini"))
        config.set_main_option("script_location", str(backend_root / "alembic"))
        command.upgrade(config, "head")

    # Never substitute create_all: it cannot upgrade an existing schema.
    await asyncio.to_thread(upgrade)
