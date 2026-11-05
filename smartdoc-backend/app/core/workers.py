"""Await synchronous engines before their callers clean up working files."""
import asyncio
import multiprocessing
import os
import signal
import pickle


def _engine_entry(connection, function, args):
    """Only trusted Python callables supplied by the server enter this process."""
    try:
        if os.name == "nt":
            from app.core.process_group import contain_windows_process
            contain_windows_process()
        else:
            os.setsid()
        connection.send((True, function(*args)))
    except BaseException as error:
        connection.send((False, str(error) or type(error).__name__))
    finally:
        connection.close()


async def run_engine(function, *args, timeout=None):
    """Run a CPU engine in a disposable process, reaping it before cleanup."""
    from app.core.config import settings
    # Reject closures/non-importable callables before spawning a child.
    pickle.dumps((function, args))
    context = multiprocessing.get_context("spawn")
    receiver, sender = context.Pipe(duplex=False)
    process = context.Process(target=_engine_entry, args=(sender, function, args), daemon=True)
    started = False
    try:
        process.start()
        started = True
        sender.close()
        async def result():
            while True:
                try:
                    ready = receiver.poll()
                except OSError as error:
                    raise RuntimeError("Engine berhenti tanpa hasil.") from error
                if ready:
                    try:
                        success, value = receiver.recv()
                    except (EOFError, OSError) as error:
                        raise RuntimeError("Engine berhenti tanpa hasil.") from error
                    if not success:
                        raise RuntimeError(value)
                    return value
                if not process.is_alive():
                    raise RuntimeError("Engine berhenti tanpa hasil.")
                await asyncio.sleep(0.02)
        try:
            return await asyncio.wait_for(result(), timeout=timeout or settings.JOB_TIMEOUT_SECONDS)
        except TimeoutError as error:
            raise TimeoutError("Batas waktu pemrosesan dokumen terlampaui.") from error
    finally:
        if started:
            if process.is_alive():
                if os.name == "nt":
                    process.terminate()
                else:
                    try:
                        os.killpg(process.pid, signal.SIGKILL)
                    except ProcessLookupError:
                        process.terminate()
            # terminate/kill stop the writer before callers remove output files.
            process.join(timeout=2)
            if process.is_alive():
                process.kill()
                process.join()
            process.close()
        receiver.close()
        sender.close()


async def run_sync(function, *args):
    task = asyncio.create_task(asyncio.to_thread(function, *args))
    try:
        return await asyncio.shield(task)
    except asyncio.CancelledError:
        # Cancelling an await does not stop a thread. Wait before file cleanup;
        # otherwise the worker can recreate files after the job has failed.
        try:
            await task
        except Exception:
            pass
        raise
