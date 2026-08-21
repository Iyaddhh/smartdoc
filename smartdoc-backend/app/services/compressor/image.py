import os
import subprocess
from pathlib import Path
from PIL import Image
from app.core.logger import logger


def compress_jpg(input_path: str, output_path: str, quality: int = 82) -> bool:
    original_size = os.path.getsize(input_path)
    try:
        img = Image.open(input_path)
        img.save(output_path, format="JPEG", quality=quality, optimize=True)
    except Exception as e:
        logger.error(f"JPG compression error: {e}")
        import shutil
        shutil.copy2(input_path, output_path)
        return False

    compressed_size = os.path.getsize(output_path)
    if compressed_size >= original_size:
        import shutil
        shutil.copy2(input_path, output_path)
        return False
    logger.info(f"JPG terkompresi: {original_size} -> {compressed_size} bytes")
    return True


def compress_png(input_path: str, output_path: str) -> bool:
    original_size = os.path.getsize(input_path)

    # Coba pngquant dulu
    try:
        result = subprocess.run(
            ["pngquant", "--quality=65-85", "--force", "--output", output_path, input_path],
            capture_output=True, timeout=60
        )
        if result.returncode == 0:
            compressed_size = os.path.getsize(output_path)
            if compressed_size < original_size:
                logger.info(f"PNG terkompresi via pngquant: {original_size} -> {compressed_size} bytes")
                return True
    except (subprocess.TimeoutExpired, FileNotFoundError):
        logger.warning("pngquant tidak tersedia, fallback ke Pillow")

    # Fallback: Pillow optimize
    try:
        img = Image.open(input_path)
        img.save(output_path, format="PNG", optimize=True)
        compressed_size = os.path.getsize(output_path)
        if compressed_size >= original_size:
            import shutil
            shutil.copy2(input_path, output_path)
            return False
    except Exception as e:
        logger.error(f"PNG compression error: {e}")
        import shutil
        shutil.copy2(input_path, output_path)
        return False

    return True
