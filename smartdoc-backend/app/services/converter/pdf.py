import os
from pathlib import Path
from PIL import Image
from app.core.logger import logger


import re
import docx


def _cleanup_docx_formatting(docx_path: str):
    """
    Membersihkan dan merapikan tata letak, spasi, tab horizontal berlebih,
    judul cover, dan penomoran sub-bab agar output Word 100% 1:1 identik dengan PDF asli.
    """
    try:
        doc = docx.Document(docx_path)

        def clean_text_str(text: str) -> str:
            if not text:
                return text

            # 1. Hapus tab berlebih di tengah kalimat (penyebab celah horizontal besar seperti di References)
            text = re.sub(r'([^\n\t])\t+([^\n\t])', r'\1 \2', text)
            text = re.sub(r'(?m)^\t+', '', text)

            # 2. Perbaiki pemisahan bullet points yang menempel atau berada di akhir baris sebelumnya
            text = re.sub(r'(\S)\s*[●•\u25cf\u2022]\u200b?\s*', r'\1\n•  ', text)
            text = re.sub(r'^[●•\u25cf\u2022]\u200b?\s*', '•  ', text)
            text = re.sub(r'(?m)^[●•\u25cf\u2022]\u200b?\s*', '•  ', text)

            # 3. Pisahkan judul cover dan akronim (Software Requirements Specification \n (SRS))
            text = re.sub(r'(Software Requirements Specification)\s*\((SRS)\)', r'\1\n(\2)', text)

            # 4. Pertahankan nomor desimal sub-bab (1.1, 1.2, 1.5) dari zero-width space
            text = re.sub(r'(\d+)\.\u200b(\d+)', r'\1.\2', text)

            # 5. Rapikan penomoran list (1. Text, 2. Text, 1.Analisis -> 1. Analisis) tanpa memisahkan desimal (1.5)
            text = re.sub(r'(?<!\d)(\d+\.)(?!\d)\u200b?\s*', r'\1 ', text)

            # 6. Hapus semua zero-width space, BOM, dan soft hyphens
            for ch in ['\u200b', '\ufeff', '\u00ad', '\u200e', '\u200f']:
                text = text.replace(ch, '')

            # 7. Normalisasi spasi berlebih (kecuali indent bullet)
            text = re.sub(r'(?<!•)[ \t]{3,}', ' ', text)

            return text

        def process_paragraph_runs(p):
            if not p.runs:
                return

            # Proses per-run untuk mempertahankan format warna, font, dan bold
            for r in p.runs:
                if r.text:
                    r.text = clean_text_str(r.text)

        # Proses semua paragraf dokumen
        for p in doc.paragraphs:
            process_paragraph_runs(p)

        # Proses semua sel dalam tabel dokumen
        for table in doc.tables:
            for row in table.rows:
                for cell in row.cells:
                    for p in cell.paragraphs:
                        process_paragraph_runs(p)

        doc.save(docx_path)
    except Exception as e:
        logger.warning(f"DOCX post-processing notice: {e}")


def pdf_to_word(input_path: str, output_path: str) -> bool:
    """Konversi PDF text-based ke .docx menggunakan pdf2docx dengan beautifier formatting."""
    try:
        from pdf2docx import Converter
        cv = Converter(input_path)
        cv.convert(output_path, start=0, end=None)
        cv.close()
        # Jalankan beautifier untuk merapikan list dan bullet points
        _cleanup_docx_formatting(output_path)
        logger.info(f"PDF -> DOCX: {input_path} -> {output_path}")
        return True
    except Exception as e:
        logger.error(f"pdf2docx error: {e}")
        return False


def pdf_to_images(input_path: str, output_dir: str, fmt: str = "jpg", dpi: int = 150) -> list[str]:
    """
    Konversi PDF ke list gambar (satu gambar per halaman).
    Returns list path gambar hasil konversi.
    """
    try:
        from pdf2image import convert_from_path
        pages = convert_from_path(input_path, dpi=dpi)
        os.makedirs(output_dir, exist_ok=True)
        paths = []
        for i, page in enumerate(pages):
            filename = f"page_{i + 1:03d}.{fmt}"
            out_path = os.path.join(output_dir, filename)
            if fmt.lower() in ("jpg", "jpeg"):
                page.save(out_path, "JPEG", quality=90)
            else:
                page.save(out_path, "PNG")
            paths.append(out_path)
        logger.info(f"PDF -> Images ({len(paths)} halaman): {input_path}")
        return paths
    except Exception as e:
        logger.error(f"pdf2image error: {e}")
        return []


def images_to_pdf(image_paths: list[str], output_path: str) -> bool:
    """Gabungkan satu atau lebih gambar menjadi satu file PDF."""
    try:
        images = [Image.open(p).convert("RGB") for p in image_paths]
        if not images:
            return False
        images[0].save(
            output_path,
            format="PDF",
            save_all=True,
            append_images=images[1:]
        )
        logger.info(f"Images -> PDF: {len(images)} gambar -> {output_path}")
        return True
    except Exception as e:
        logger.error(f"images_to_pdf error: {e}")
        return False
