import asyncio
import time
import shutil
import tempfile
import pytest
from pathlib import Path
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.concurrency import job_semaphore, libreoffice_semaphore


@pytest.mark.asyncio
async def test_job_semaphore_limits_concurrency_to_three():
    """
    Verifikasi bahwa job_semaphore benar-benar membatasi maksimal 3 job jalan bersamaan,
    dan job ke-4 serta ke-5 harus mengantre.
    """
    active_jobs = 0
    max_observed_concurrency = 0
    execution_timeline = []

    async def _mock_job(job_num: int):
        nonlocal active_jobs, max_observed_concurrency
        async with job_semaphore:
            active_jobs += 1
            if active_jobs > max_observed_concurrency:
                max_observed_concurrency = active_jobs
            start_t = time.time()
            execution_timeline.append((job_num, "START", start_t))
            
            # Simulate work
            await asyncio.sleep(0.3)
            
            end_t = time.time()
            execution_timeline.append((job_num, "END", end_t))
            active_jobs -= 1

    # Launch 5 jobs concurrently
    tasks = [asyncio.create_task(_mock_job(i)) for i in range(1, 6)]
    await asyncio.gather(*tasks)

    # Concurrency must never exceed 3
    assert max_observed_concurrency == 3, f"Expected max concurrency 3, got {max_observed_concurrency}"
    assert len(execution_timeline) == 10


@pytest.mark.asyncio
async def test_libreoffice_semaphore_limits_concurrency_to_one():
    """
    Verifikasi bahwa libreoffice_semaphore membatasi eksekusi soffice hanya 1 proses per waktu.
    """
    active_lo = 0
    max_lo_concurrency = 0

    async def _mock_lo_job():
        nonlocal active_lo, max_lo_concurrency
        async with libreoffice_semaphore:
            active_lo += 1
            if active_lo > max_lo_concurrency:
                max_lo_concurrency = active_lo
            await asyncio.sleep(0.2)
            active_lo -= 1

    tasks = [asyncio.create_task(_mock_lo_job()) for _ in range(4)]
    await asyncio.gather(*tasks)

    # Concurrency must never exceed 1
    assert max_lo_concurrency == 1, f"Expected max LibreOffice concurrency 1, got {max_lo_concurrency}"


@pytest.mark.asyncio
async def test_event_loop_does_not_freeze_during_heavy_job():
    """
    Verifikasi bahwa saat background task berat sedang berjalan via asyncio.to_thread / non-blocking,
    request ke /health tetap dijawab secara instan (< 150ms).
    """
    transport = ASGITransport(app=app)
    
    # Start a CPU-heavy/blocking simulation in worker thread
    def _heavy_computation():
        t_end = time.time() + 0.8
        while time.time() < t_end:
            pass  # Busy loop
        return True

    heavy_task = asyncio.create_task(asyncio.to_thread(_heavy_computation))

    # Concurrently hit /health multiple times while heavy task is executing
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        latencies = []
        for _ in range(5):
            t0 = time.time()
            res = await client.get("/health")
            t1 = time.time()
            assert res.status_code == 200
            assert res.json()["data"]["status"] == "healthy"
            latencies.append(t1 - t0)
            await asyncio.sleep(0.05)

    await heavy_task

    # All health checks must be instant (average < 100ms)
    avg_latency = sum(latencies) / len(latencies)
    assert avg_latency < 0.15, f"Event loop frozen: /health average latency too high: {avg_latency:.3f}s"


@pytest.mark.asyncio
async def test_anti_zombie_subprocess_reaping_on_timeout():
    """
    Verifikasi bahwa jika subprocess timeout, proses OS benar-benar di-kill dan di-reap,
    tidak meninggalkan zombie / hanging process.
    """
    # Use ping -n 10 (Windows) or sleep 10 (Unix) which runs for ~10 seconds
    cmd = ["ping", "127.0.0.1", "-n", "10"] if shutil.which("ping") else ["sleep", "10"]

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )

    process_killed = False
    try:
        # Timeout after 0.2 seconds
        await asyncio.wait_for(proc.communicate(), timeout=0.2)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()  # Reap process
        process_killed = True

    assert process_killed is True
    # Verify the returncode is not None (meaning process is fully terminated and reaped)
    assert proc.returncode is not None, "Process was not reaped; returncode is None"


def test_windows_libreoffice_profile_uri_format():
    """
    Verifikasi bahwa Path(temp_dir).as_uri() menghasilkan URI yang valid untuk flag LibreOffice -env:UserInstallation
    """
    temp_dir = tempfile.mkdtemp(prefix="lo_test_profile_")
    try:
        profile_uri = Path(temp_dir).as_uri()
        assert profile_uri.startswith("file:///"), f"Invalid URI format: {profile_uri}"
        # Flag option format check
        flag = f"-env:UserInstallation={profile_uri}"
        assert "-env:UserInstallation=file:///" in flag
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)
