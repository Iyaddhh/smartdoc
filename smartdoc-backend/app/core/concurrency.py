import asyncio
from fastapi import HTTPException

# Global concurrency limits for asynchronous document background jobs
# Controls overall background tasks to prevent overloading server resources
job_semaphore = asyncio.Semaphore(3)

# Dedicated lock/semaphore for LibreOffice headless processes to prevent file-lock race conditions
libreoffice_semaphore = asyncio.Semaphore(1)

# Preview renders must not bypass all resource limits or create an unlimited wait queue.
preview_semaphore = asyncio.Semaphore(1)


async def preview_capacity():
    try:
        await asyncio.wait_for(preview_semaphore.acquire(), timeout=0.05)
    except asyncio.TimeoutError:
        raise HTTPException(status_code=429, detail="Pratinjau sedang sibuk. Coba lagi sebentar.", headers={"Retry-After": "2"})
    try:
        yield
    finally:
        preview_semaphore.release()
