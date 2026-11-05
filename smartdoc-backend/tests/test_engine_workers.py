import asyncio
import multiprocessing
import time
from pathlib import Path

import pytest
from app.core.workers import run_engine


def delayed_write(started, target):
    Path(started).write_text("ready")
    time.sleep(2)
    Path(target).write_text("late output")


def crash():
    import os
    os._exit(7)


def child_writer(started, target):
    import subprocess
    import sys
    subprocess.Popen([sys.executable, "-c",
                      "import time, pathlib, sys; time.sleep(2); pathlib.Path(sys.argv[1]).write_text('late')", target])
    Path(started).write_text("ready")
    time.sleep(30)


@pytest.mark.asyncio
async def test_engine_returns_result_and_reports_crash():
    assert await run_engine(pow, 2, 8, timeout=10) == 256
    with pytest.raises(RuntimeError, match="tanpa hasil"):
        await run_engine(crash, timeout=10)


@pytest.mark.asyncio
@pytest.mark.parametrize("cancel", [False, True])
async def test_stopped_engine_cannot_recreate_output(tmp_path, cancel):
    started, target = tmp_path / "started", tmp_path / "output"
    before = {p.pid for p in multiprocessing.active_children()}
    task = asyncio.create_task(run_engine(delayed_write, str(started), str(target), timeout=10))
    for _ in range(500):
        if started.exists():
            break
        await asyncio.sleep(.02)
    assert started.exists()
    if cancel:
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
    else:
        with pytest.raises(TimeoutError):
            await asyncio.wait_for(task, timeout=.05)
    assert {p.pid for p in multiprocessing.active_children()} == before
    await asyncio.sleep(2.1)
    assert not target.exists()


@pytest.mark.asyncio
async def test_engine_own_timeout():
    start = time.monotonic()
    with pytest.raises(TimeoutError, match="Batas waktu"):
        await run_engine(time.sleep, 30, timeout=.2)
    assert time.monotonic() - start < 5


@pytest.mark.asyncio
async def test_cancellation_stops_descendant_process(tmp_path):
    started, target = tmp_path / "started", tmp_path / "late"
    task = asyncio.create_task(run_engine(child_writer, str(started), str(target), timeout=10))
    for _ in range(500):
        if started.exists():
            break
        await asyncio.sleep(.02)
    assert started.exists()
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    await asyncio.sleep(2.1)
    assert not target.exists()
