"""Run the full suite against a disposable PostgreSQL database and temporary storage.

Usage: .venv\Scripts\python.exe run_tests.py [-q ...]
Uses the configured local PostgreSQL account; it needs CREATE DATABASE permission.
"""
import asyncio
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import uuid

import asyncpg
from sqlalchemy.engine import make_url
from app.core.config import settings


async def main():
    database = "smartdoc_test_" + uuid.uuid4().hex
    url = make_url(settings.DATABASE_URL)
    connection = await asyncpg.connect(
        host=url.host, port=url.port or 5432, user=url.username,
        password=url.password, database=url.database,
    )
    created = False
    backend = Path(__file__).resolve().parent
    try:
        await connection.execute(f'CREATE DATABASE "{database}"')
        created = True
        environment = os.environ.copy()
        environment["DATABASE_URL"] = url.set(database=database).render_as_string(hide_password=False)
        with tempfile.TemporaryDirectory(prefix="smartdoc-tests-") as storage:
            environment["STORAGE_PATH"] = storage
            migration = subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], cwd=backend, env=environment)
            if migration.returncode:
                return migration.returncode
            test_connection = await asyncpg.connect(
                host=url.host, port=url.port or 5432, user=url.username,
                password=url.password, database=database,
            )
            try:
                await test_connection.execute(
                    "INSERT INTO users (id, username, email, hashed_password, role, is_active) VALUES ($1,$2,$3,$4,$5,true)",
                    uuid.UUID("1223bef8-242e-4e79-b4ff-4db9e450e1fa"),
                    "smartdoc_test", "test@example.invalid", "unused-test-hash", "user",
                )
            finally:
                await test_connection.close()
            result = subprocess.run([sys.executable, "-m", "pytest", *sys.argv[1:]], cwd=backend, env=environment)
            return result.returncode
    finally:
        if created:
            await connection.execute("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid <> pg_backend_pid()", database)
            await connection.execute(f'DROP DATABASE "{database}"')
        await connection.close()


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
