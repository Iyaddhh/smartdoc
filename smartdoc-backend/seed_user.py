"""
seed_user.py — Script untuk membuat seed user awal pada SmartDoc.

Penggunaan:
    python seed_user.py --username NAME --email EMAIL --role admin
"""
import argparse
import getpass
import asyncio
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from app.db.base import AsyncSessionLocal
from app.models.user import User
from app.core.security import hash_password


async def seed_user(username: str, email: str, password: str, role: str = "user", update_existing: bool = False):
    async with AsyncSessionLocal() as session:
        stmt = select(User).where((User.username == username) | (User.email == email))
        result = await session.execute(stmt)
        existing_user = result.scalar_one_or_none()

        if existing_user:
            if update_existing:
                existing_user.role = role
                existing_user.hashed_password = hash_password(password)
                existing_user.token_version += 1
                existing_user.is_active = True
                await session.commit()
                print(f"[UPDATED] User '{username}' ({email}, role: {role}) password & role diperbarui.")
            else:
                print("[SKIP] Akun sudah ada. Gunakan --update untuk mengubah akun secara eksplisit.")
            return existing_user

        new_user = User(
            id=uuid.uuid4(),
            username=username,
            email=email,
            hashed_password=hash_password(password),
            role=role,
            is_active=True,
            created_at=datetime.now(timezone.utc).replace(tzinfo=None),
        )
        session.add(new_user)
        await session.commit()
        await session.refresh(new_user)
        print(f"[CREATED] User '{username}' ({email}, role: {role}) berhasil dibuat! (ID: {new_user.id})")
        return new_user


async def main():
    parser = argparse.ArgumentParser(description="Seed initial users for SmartDoc")
    parser.add_argument("--username", type=str, required=True, help="Username baru")
    parser.add_argument("--email", type=str, required=True, help="Email baru")
    parser.add_argument("--password", type=str, help="Password baru")
    parser.add_argument("--role", choices=["user", "admin"], default="user", help="Role akun baru")
    parser.add_argument("--update", action="store_true", help="Update password jika user sudah ada")
    args = parser.parse_args()

    password = args.password or getpass.getpass("Password akun: ")
    if len(password) < 8 or len(password.encode("utf-8")) > 72:
        parser.error("Password harus minimal 8 karakter dan maksimal 72 byte UTF-8.")
    await seed_user(args.username, args.email, password, role=args.role, update_existing=args.update)

    print("\nSelesai! Anda dapat login dengan akun di atas.")


if __name__ == "__main__":
    asyncio.run(main())
