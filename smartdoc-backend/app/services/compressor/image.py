import os
import shutil
import asyncio
from pathlib import Path
from PIL import Image
from app.core.logger import logger
from app.core.config import settings


def compress_jpg(input_path: str, output_path: str, quality: int | None = None) -> bool:
    """Kompres JPG dengan Pillow optimize."""
    target_quality = quality or settings.COMPRESSION_IMAGE_QUALITY
    original_size = os.path.getsize(input_path)
    img = None
    try:
        img = Image.open(input_path)
        img.save(output_path, format="JPEG", quality=target_quality, optimize=True)
    except Exception as e:
        logger.error(f"JPG compression error pada {input_path}: {e}")
        shutil.copy2(input_path, output_path)
        return False
    finally:
        if img:
            try:
                img.close()
            except Exception:
                pass

    compressed_size = os.path.getsize(output_path) if os.path.exists(output_path) else original_size
    if compressed_size >= original_size:
        shutil.copy2(input_path, output_path)
        return False
    logger.info(f"JPG terkompresi: {original_size} -> {compressed_size} bytes")
    return True


async def async_compress_png(input_path: str, output_path: str, timeout: int | None = None) -> bool:
    """Kompres PNG non-blocking via pngquant dengan fallback ke Pillow."""
    timeout_seconds = timeout or 60
    original_size = os.path.getsize(input_path)

    pngquant_bin = shutil.which("pngquant")
    if pngquant_bin:
        try:
            cmd = [pngquant_bin, "--quality=65-85", "--force", "--output", output_path, input_path]
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            try:
                stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout_seconds)
            except asyncio.TimeoutError:
                try:
                    proc.kill()
                    await proc.wait()
                except Exception:
                    pass
                logger.warning(f"pngquant timeout ({timeout_seconds}s) pada {input_path}")
            else:
                if proc.returncode == 0 and os.path.exists(output_path):
                    compressed_size = os.path.getsize(output_path)
                    if compressed_size < original_size:
                        logger.info(f"PNG terkompresi via pngquant: {original_size} -> {compressed_size} bytes")
                        return True
        except Exception as e:
            logger.warning(f"pngquant execution failed ({e}), fallback ke Pillow...")

    # Fallback: Pillow optimize
    def _pillow_png():
        img = None
        try:
            img = Image.open(input_path)
            img.save(output_path, format="PNG", optimize=True)
        finally:
            if img:
                try:
                    img.close()
                except Exception:
                    pass

    try:
        await asyncio.to_thread(_pillow_png)
        compressed_size = os.path.getsize(output_path) if os.path.exists(output_path) else original_size
        if compressed_size >= original_size:
            shutil.copy2(input_path, output_path)
            return False
    except Exception as e:
        logger.error(f"PNG compression error: {e}")
        shutil.copy2(input_path, output_path)
        return False

    logger.info(f"PNG terkompresi via Pillow: {original_size} -> {compressed_size} bytes")
    return True


def compress_png(input_path: str, output_path: str) -> bool:
    """Synchronous fallback helper."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                return pool.submit(lambda: asyncio.run(async_compress_png(input_path, output_path))).result()
        return loop.run_until_complete(async_compress_png(input_path, output_path))
    except Exception:
        return asyncio.run(async_compress_png(input_path, output_path))
