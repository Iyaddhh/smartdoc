import os
import uuid
from pathlib import Path
from typing import List, Optional
from pypdf import PdfReader, PdfWriter
from app.core.logger import logger
from app.services.converter import convert_office_to_pdf, images_to_pdf

OFFICE_EXTENSIONS = {".docx", ".xlsx", ".pptx"}
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png"}


def _prepare_working_pdf(path: str, temp_files_to_clean: List[str]) -> str:
    """Konversi file Office atau Gambar ke PDF perantara jika diperlukan."""
    ext = Path(path).suffix.lower()
    if ext in OFFICE_EXTENSIONS:
        temp_pdf = f"{path}_converted_{uuid.uuid4().hex[:8]}.pdf"
        temp_files_to_clean.append(temp_pdf)
        ok = convert_office_to_pdf(path, temp_pdf)
        if not ok or not os.path.exists(temp_pdf):
            raise RuntimeError(f"Gagal mengonversi berkas Office ke PDF: {path}")
        return temp_pdf
    elif ext in IMAGE_EXTENSIONS:
        temp_pdf = f"{path}_img_{uuid.uuid4().hex[:8]}.pdf"
        temp_files_to_clean.append(temp_pdf)
        ok = images_to_pdf([path], temp_pdf)
        if not ok or not os.path.exists(temp_pdf):
            raise RuntimeError(f"Gagal mengonversi gambar ke PDF: {path}")
        return temp_pdf
    return path


def merge_documents(input_paths: List[str], output_path: str) -> bool:
    """
    Menggabungkan beberapa dokumen berurutan (PDF, Office, Gambar) menjadi satu file PDF utuh.
    """
    writer = PdfWriter()
    temp_files_to_clean: List[str] = []

    try:
        for path in input_paths:
            if not os.path.exists(path):
                logger.warning(f"File tidak ditemukan untuk digabungkan: {path}")
                continue

            working_pdf = _prepare_working_pdf(path, temp_files_to_clean)
            reader = PdfReader(working_pdf)
            for page in reader.pages:
                writer.add_page(page)

        if len(writer.pages) == 0:
            raise ValueError("Tidak ada halaman yang dapat digabungkan dari berkas yang diunggah.")

        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, "wb") as f_out:
            writer.write(f_out)

        logger.info(f"Merge sukses: {len(input_paths)} berkas ({len(writer.pages)} hal) -> {output_path}")
        return True

    except Exception as e:
        logger.error(f"Error saat menggabungkan dokumen: {e}")
        return False

    finally:
        for temp_p in temp_files_to_clean:
            if os.path.exists(temp_p):
                try:
                    os.remove(temp_p)
                except Exception:
                    pass


def insert_document(
    main_doc_path: str,
    insert_doc_path: str,
    output_path: str,
    insert_position: str = "end",  # "start", "end", "custom"
    after_page: int = 1,
) -> bool:
    """
    Menyisipkan dokumen tambahan ke dokumen utama pada posisi tertentu:
    - 'start': Disisipkan di awal halaman (halaman pertama / cover)
    - 'end': Disisipkan di akhir halaman (lampiran belakang)
    - 'custom': Disisipkan setelah halaman ke-`after_page`
    """
    writer = PdfWriter()
    temp_files_to_clean: List[str] = []

    try:
        main_pdf = _prepare_working_pdf(main_doc_path, temp_files_to_clean)
        insert_pdf = _prepare_working_pdf(insert_doc_path, temp_files_to_clean)

        main_reader = PdfReader(main_pdf)
        insert_reader = PdfReader(insert_pdf)

        main_pages = list(main_reader.pages)
        insert_pages = list(insert_reader.pages)

        total_main = len(main_pages)

        if insert_position == "start":
            # Sisipkan di awal (insert pages + main pages)
            for p in insert_pages:
                writer.add_page(p)
            for p in main_pages:
                writer.add_page(p)

        elif insert_position == "custom":
            # Sisipkan setelah halaman ke-`after_page` (1-indexed)
            split_idx = max(0, min(total_main, after_page))
            # Halaman awal sampai split_idx
            for p in main_pages[:split_idx]:
                writer.add_page(p)
            # Halaman sisipan
            for p in insert_pages:
                writer.add_page(p)
            # Halaman sisa setelah split_idx
            for p in main_pages[split_idx:]:
                writer.add_page(p)

        else:  # "end"
            # Sisipkan di akhir (main pages + insert pages)
            for p in main_pages:
                writer.add_page(p)
            for p in insert_pages:
                writer.add_page(p)

        if len(writer.pages) == 0:
            raise ValueError("Tidak ada halaman yang dapat disisipkan.")

        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, "wb") as f_out:
            writer.write(f_out)

        logger.info(f"Insert sukses ({insert_position}, after_page={after_page}): -> {output_path}")
        return True

    except Exception as e:
        logger.error(f"Error saat menyisipkan dokumen: {e}")
        return False

    finally:
        for temp_p in temp_files_to_clean:
            if os.path.exists(temp_p):
                try:
                    os.remove(temp_p)
                except Exception:
                    pass
