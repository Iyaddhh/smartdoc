import os
import re
from pathlib import Path
from PIL import Image
import docx
from app.core.logger import logger


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

            # 1. Hapus tab berlebih di tengah kalimat
            text = re.sub(r'([^\n\t])\t+([^\n\t])', r'\1 \2', text)
            text = re.sub(r'(?m)^\t+', '', text)

            # 2. Perbaiki pemisahan bullet points yang menempel atau di akhir baris sebelumnya
            text = re.sub(r'(\S)\s*[●•\u25cf\u2022]\u200b?\s*', r'\1\n•  ', text)
            text = re.sub(r'^[●•\u25cf\u2022]\u200b?\s*', '•  ', text)
            text = re.sub(r'(?m)^[●•\u25cf\u2022]\u200b?\s*', '•  ', text)

            # 3. Pisahkan judul cover dan akronim
            text = re.sub(r'(Software Requirements Specification)\s*\((SRS)\)', r'\1\n(\2)', text)

            # 4. Pertahankan nomor desimal sub-bab (1.1, 1.2, 1.5) dari zero-width space
            text = re.sub(r'(\d+)\.\u200b(\d+)', r'\1.\2', text)

            # 5. Rapikan penomoran list
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
            for r in p.runs:
                if r.text:
                    r.text = clean_text_str(r.text)

        for p in doc.paragraphs:
            process_paragraph_runs(p)

        for table in doc.tables:
            for row in table.rows:
                for cell in row.cells:
                    for p in cell.paragraphs:
                        process_paragraph_runs(p)

        doc.save(docx_path)
    except Exception as e:
        logger.warning(f"DOCX post-processing notice: {e}")


def _clean_docx_thumbnail_artifact(docx_path: str) -> None:
    """
    Menghapus thumbnail dummy/blank dan relasi thumbnail dari berkas .docx.
    Ini memastikan Windows File Explorer dan sistem operasi menampilkan icon aplikasi Word resmi (Word Logo)
    secara default dan bersih, tanpa kotak pratinjau halaman putih/blank.
    """
    try:
        import zipfile
        import xml.etree.ElementTree as ET

        temp_docx = docx_path + ".clean_tmp"
        with zipfile.ZipFile(docx_path, "r") as zin, zipfile.ZipFile(temp_docx, "w", compression=zipfile.ZIP_DEFLATED) as zout:
            for item in zin.infolist():
                # 1. Hapus file thumbnail internal jika ada
                if "thumbnail" in item.filename.lower():
                    continue

                # 2. Hapus relasi thumbnail dari _rels/.rels
                elif item.filename == "_rels/.rels":
                    rels_xml = zin.read(item.filename)
                    root = ET.fromstring(rels_xml)
                    for rel in list(root):
                        if "thumbnail" in rel.attrib.get("Type", "").lower() or "thumbnail" in rel.attrib.get("Target", "").lower():
                            root.remove(rel)
                    rels_clean = ET.tostring(root, encoding="utf-8", xml_declaration=True)
                    zout.writestr(item, rels_clean)

                # 3. Hapus override thumbnail dari [Content_Types].xml jika ada
                elif item.filename == "[Content_Types].xml":
                    ct_xml = zin.read(item.filename)
                    root = ET.fromstring(ct_xml)
                    for override in list(root):
                        if "thumbnail" in override.attrib.get("PartName", "").lower():
                            root.remove(override)
                    ct_clean = ET.tostring(root, encoding="utf-8", xml_declaration=True)
                    zout.writestr(item, ct_clean)

                else:
                    zout.writestr(item, zin.read(item.filename))

        os.replace(temp_docx, docx_path)
    except Exception as e:
        logger.warning(f"DOCX thumbnail cleaning notice: {e}")


def pdf_to_word(input_path: str, output_path: str) -> bool:
    """Konversi PDF text-based ke .docx menggunakan pdf2docx dengan beautifier formatting dan pembersihan artifact thumbnail."""
    try:
        from pdf2docx import Converter
        cv = Converter(input_path)
        try:
            cv.convert(output_path, start=0, end=None)
        finally:
            cv.close()
        # Jalankan beautifier untuk merapikan list dan bullet points
        _cleanup_docx_formatting(output_path)
        # Hapus placeholder thumbnail agar menampilkan icon Word resmi di Windows Explorer
        _clean_docx_thumbnail_artifact(output_path)
        logger.info(f"PDF -> DOCX: {input_path} -> {output_path}")
        return True
    except Exception as e:
        logger.error(f"pdf2docx error pada {input_path}: {e}")
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
        fmt_clean = "jpg" if fmt.lower() in ("jpg", "jpeg") else "png"
        for i, page in enumerate(pages):
            try:
                filename = f"page_{i + 1:03d}.{fmt_clean}"
                out_path = os.path.join(output_dir, filename)
                if fmt_clean == "jpg":
                    page.save(out_path, "JPEG", quality=90)
                else:
                    page.save(out_path, "PNG")
                paths.append(out_path)
            finally:
                try:
                    page.close()
                except Exception:
                    pass
        logger.info(f"PDF -> Images ({len(paths)} halaman): {input_path}")
        return paths
    except Exception as e:
        logger.error(f"pdf2image error pada {input_path}: {e}")
        return []


def images_to_pdf(image_paths: list[str], output_path: str) -> bool:
    """Gabungkan satu atau lebih gambar menjadi satu file PDF."""
    opened_images = []
    try:
        for p in image_paths:
            opened_images.append(Image.open(p).convert("RGB"))
        if not opened_images:
            return False
        opened_images[0].save(
            output_path,
            format="PDF",
            save_all=True,
            append_images=opened_images[1:]
        )
        logger.info(f"Images -> PDF: {len(opened_images)} gambar -> {output_path}")
        return True
    except Exception as e:
        logger.error(f"images_to_pdf error: {e}")
        return False
    finally:
        for img in opened_images:
            try:
                img.close()
            except Exception:
                pass
