import os
import io
import uuid
from typing import Optional, Tuple
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from app.core.logger import logger
from app.services.converter import convert_office_to_pdf


def hex_to_rgb(hex_str: str) -> Tuple[float, float, float]:
    """Convert #64748b to (0.39, 0.45, 0.54) range 0.0-1.0."""
    clean = hex_str.lstrip("#")
    if len(clean) == 3:
        clean = "".join([c * 2 for c in clean])
    if len(clean) != 6:
        return (0.4, 0.45, 0.5)
    r = int(clean[0:2], 16) / 255.0
    g = int(clean[2:4], 16) / 255.0
    b = int(clean[4:6], 16) / 255.0
    return (r, g, b)


def create_text_watermark_pdf(
    width: float,
    height: float,
    text: str,
    opacity: float = 0.25,
    angle: float = 45.0,
    font_size: int = 44,
    color_hex: str = "#64748b",
) -> bytes:
    """
    Menghasilkan berkas PDF watermark transparan 1 halaman menggunakan ReportLab.
    """
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(width, height))

    # Set transparency
    c.setFillAlpha(max(0.05, min(0.9, opacity)))
    c.setStrokeAlpha(max(0.05, min(0.9, opacity)))

    # Set font & color
    c.setFont("Helvetica-Bold", font_size)
    r, g, b = hex_to_rgb(color_hex)
    c.setFillColorRGB(r, g, b)

    # Position at center and rotate
    c.saveState()
    c.translate(width / 2.0, height / 2.0)
    c.rotate(angle)
    c.drawCentredString(0, 0, text)
    c.restoreState()

    c.save()
    buf.seek(0)
    return buf.getvalue()


def apply_watermark_and_security(
    input_path: str,
    output_path: str,
    is_docx: bool = False,
    watermark_text: Optional[str] = None,
    opacity: float = 0.25,
    angle: float = 45.0,
    font_size: int = 44,
    color_hex: str = "#64748b",
    password: Optional[str] = None,
) -> bool:
    """
    Menambahkan watermark teks dan/atau memproteksi PDF dengan password AES.
    """
    temp_pdf_to_clean: Optional[str] = None
    try:
        working_pdf = input_path

        # 1. Jika DOCX, konversi dulu ke PDF kerja sementara
        if is_docx:
            temp_pdf_to_clean = f"{input_path}_temp_wm.pdf"
            ok = convert_office_to_pdf(input_path, temp_pdf_to_clean)
            if not ok or not os.path.exists(temp_pdf_to_clean):
                raise RuntimeError("Gagal mengonversi berkas Word ke PDF untuk pemberian watermark.")
            working_pdf = temp_pdf_to_clean

        reader = PdfReader(working_pdf)
        writer = PdfWriter()

        # 2. Tambahkan watermark jika diisi
        for page in reader.pages:
            if watermark_text and watermark_text.strip():
                p_width = float(page.mediabox.width)
                p_height = float(page.mediabox.height)

                wm_bytes = create_text_watermark_pdf(
                    width=p_width,
                    height=p_height,
                    text=watermark_text.strip(),
                    opacity=opacity,
                    angle=angle,
                    font_size=font_size,
                    color_hex=color_hex,
                )

                wm_reader = PdfReader(io.BytesIO(wm_bytes))
                wm_page = wm_reader.pages[0]
                page.merge_page(wm_page)

            writer.add_page(page)

        # 3. Tambahkan proteksi password jika diisi
        if password and password.strip():
            writer.encrypt(
                user_password=password.strip(),
                owner_password=f"{password.strip()}_owner_{uuid.uuid4().hex[:6]}",
                use_128bit=True,
            )
            logger.info(f"Proteksi password AES-128 diaktifkan pada: {output_path}")

        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, "wb") as f_out:
            writer.write(f_out)

        logger.info(f"Watermark/Security sukses -> {output_path}")
        return True

    except Exception as e:
        logger.error(f"Gagal memproses watermark/security: {e}")
        return False

    finally:
        if temp_pdf_to_clean and os.path.exists(temp_pdf_to_clean):
            try:
                os.remove(temp_pdf_to_clean)
            except Exception:
                pass
