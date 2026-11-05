"""Balanced raster optimization without changing image format, size or alpha."""
import io
import math
import struct

from PIL import Image, ImageChops, ImageStat

from app.core.logger import logger
from app.core.validators import validate_image_dimensions
from app.core.config import settings


def _png_chunks(data: bytes):
    if not data.startswith(b"\x89PNG\r\n\x1a\n"):
        raise ValueError("Invalid PNG signature")
    offset = 8
    while offset < len(data):
        size = struct.unpack(">I", data[offset:offset + 4])[0]
        end = offset + size + 12
        if end > len(data):
            raise ValueError("Truncated PNG chunk")
        yield data[offset + 4:offset + 8], data[offset:end]
        offset = end


def _preserve_png_metadata(original: bytes, encoded: bytes) -> bytes:
    old_chunks = list(_png_chunks(original))
    new_chunks = list(_png_chunks(encoded))
    core = {b"IHDR", b"PLTE", b"tRNS", b"IDAT", b"IEND"}
    before, after = [], []
    seen_data = False
    for kind, chunk in old_chunks:
        if kind == b"IDAT":
            seen_data = True
        if kind not in core:
            (after if seen_data else before).append(chunk)
    return (b"\x89PNG\r\n\x1a\n" + new_chunks[0][1] + b"".join(before)
            + b"".join(chunk for kind, chunk in new_chunks if kind not in {b"IHDR", b"IEND"})
            + b"".join(after) + new_chunks[-1][1])


def _jpeg_parts(data: bytes):
    if not data.startswith(b"\xff\xd8"):
        raise ValueError("Invalid JPEG signature")
    offset = 2
    while offset < len(data):
        start = offset
        if data[offset] != 255:
            raise ValueError("Invalid JPEG marker")
        while data[offset] == 255:
            offset += 1
        marker = data[offset]
        offset += 1
        if marker == 0xDA:
            yield marker, data[start:]
            return
        size = struct.unpack(">H", data[offset:offset + 2])[0]
        if size < 2 or offset + size > len(data):
            raise ValueError("Truncated JPEG segment")
        offset += size
        yield marker, data[start:offset]


def _preserve_jpeg_metadata(original: bytes, encoded: bytes) -> bytes:
    def is_metadata(marker):
        return 0xE0 <= marker <= 0xEF or marker == 0xFE
    metadata = b"".join(segment for marker, segment in _jpeg_parts(original) if is_metadata(marker))
    image = b"".join(segment for marker, segment in _jpeg_parts(encoded) if not is_metadata(marker))
    return b"\xff\xd8" + metadata + image


def optimize_pptx_image(raw: bytes, extension: str, quality: int = 85) -> bytes:
    """Retain the source if optimization is unsupported, unsafe or not smaller."""
    try:
        validate_image_dimensions(raw)
        with Image.open(io.BytesIO(raw)) as image:
            if image.width * image.height > settings.MAX_PPTX_IMAGE_PIXELS:
                return raw
            if getattr(image, "n_frames", 1) != 1:
                return raw
            if extension in {".jpg", ".jpeg"}:
                if image.format != "JPEG" or image.mode not in {"RGB", "L"}:
                    return raw
                target = io.BytesIO()
                image.save(target, format="JPEG", quality=quality, optimize=True)
                candidate = _preserve_jpeg_metadata(raw, target.getvalue())
            elif extension == ".png":
                if image.format != "PNG" or image.mode not in {"RGB", "RGBA"}:
                    return raw
                chunks = {kind for kind, _chunk in _png_chunks(raw)}
                # Do not strip signatures, animations, color-key transparency,
                # or precision from images that Pillow cannot preserve exactly.
                if chunks.intersection({b"dSIG", b"acTL", b"tRNS", b"PLTE", b"hIST"}) or raw[24] != 8:
                    return raw
                rgb = image.convert("RGB")
                palette = rgb.quantize(colors=256, method=Image.Quantize.MEDIANCUT)
                rgb_result = palette.convert("RGB")
                rms = ImageStat.Stat(ImageChops.difference(rgb, rgb_result)).rms
                mse = sum(value * value for value in rms) / 3
                if mse and 10 * math.log10(255**2 / mse) < 35:
                    return raw
                if image.mode == "RGBA":
                    candidate_image = rgb_result.convert("RGBA")
                    candidate_image.putalpha(image.getchannel("A"))
                elif chunks.intersection({b"bKGD", b"sBIT", b"hIST"}):
                    candidate_image = rgb_result
                else:
                    candidate_image = palette
                target = io.BytesIO()
                candidate_image.save(target, format="PNG", optimize=True, compress_level=9)
                candidate = _preserve_png_metadata(raw, target.getvalue())
            else:
                return raw
            if len(candidate) >= len(raw):
                return raw
            with Image.open(io.BytesIO(candidate)) as check:
                check.load()
                if check.format != image.format or check.size != image.size:
                    return raw
                if image.mode == "RGBA" and check.convert("RGBA").getchannel("A").tobytes() != image.getchannel("A").tobytes():
                    return raw
            return candidate
    except Exception as error:
        logger.warning("PPTX image retained after optimization failure: {}", error)
        return raw
