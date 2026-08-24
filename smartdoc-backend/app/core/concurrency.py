import asyncio

# Global concurrency limits for asynchronous document background jobs
# Controls overall background tasks to prevent overloading server resources
job_semaphore = asyncio.Semaphore(3)

# Dedicated lock/semaphore for LibreOffice headless processes to prevent file-lock race conditions
libreoffice_semaphore = asyncio.Semaphore(1)
