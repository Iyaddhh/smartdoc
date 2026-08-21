import os
import zipfile
from typing import List, Tuple
from pathlib import Path
from pypdf import PdfReader, PdfWriter
from app.core.logger import logger

def parse_page_ranges(range_str: str, max_pages: int) -> List[int]:
    """
    Parses a page range string like '1-3, 5, 8-10' into 0-indexed page indices.
    E.g. '1-3, 5' -> [0, 1, 2, 4]
    """
    pages = set()
    parts = range_str.split(",")
    for part in parts:
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            sub = part.split("-")
            if len(sub) == 2:
                try:
                    start = max(1, int(sub[0].strip()))
                    end = min(max_pages, int(sub[1].strip()))
                    if start <= end:
                        for p in range(start, end + 1):
                            pages.add(p - 1)
                except ValueError:
                    continue
        else:
            try:
                p = int(part)
                if 1 <= p <= max_pages:
                    pages.add(p - 1)
            except ValueError:
                continue
    return sorted(list(pages))


def get_pdf_page_count(pdf_path: str) -> int:
    """Returns the total number of pages in a PDF."""
    try:
        reader = PdfReader(pdf_path)
        return len(reader.pages)
    except Exception as e:
        logger.error(f"Error reading PDF page count for {pdf_path}: {e}")
        return 0


def extract_pages_to_pdf(input_pdf: str, page_indices: List[int], output_pdf: str) -> bool:
    """
    Extracts selected page indices into a single new PDF.
    """
    try:
        reader = PdfReader(input_pdf)
        writer = PdfWriter()
        for idx in page_indices:
            if 0 <= idx < len(reader.pages):
                writer.add_page(reader.pages[idx])

        os.makedirs(os.path.dirname(output_pdf), exist_ok=True)
        with open(output_pdf, "wb") as f:
            writer.write(f)

        logger.info(f"Extracted {len(page_indices)} pages to {output_pdf}")
        return True
    except Exception as e:
        logger.error(f"Error extracting pages from {input_pdf}: {e}")
        return False


def split_pdf_by_chunks(input_pdf: str, chunk_size: int, output_zip_path: str, base_filename: str) -> bool:
    """
    Splits a PDF into chunks of `chunk_size` pages each and packs them into a ZIP file.
    """
    try:
        reader = PdfReader(input_pdf)
        total_pages = len(reader.pages)
        if total_pages == 0 or chunk_size <= 0:
            return False

        temp_dir = os.path.join(os.path.dirname(output_zip_path), f"temp_split_{Path(output_zip_path).stem}")
        os.makedirs(temp_dir, exist_ok=True)

        split_files = []
        part_num = 1
        for start_idx in range(0, total_pages, chunk_size):
            end_idx = min(start_idx + chunk_size, total_pages)
            writer = PdfWriter()
            for p in range(start_idx, end_idx):
                writer.add_page(reader.pages[p])

            part_filename = f"{base_filename}_part_{part_num}_(hal_{start_idx+1}-{end_idx}).pdf"
            part_path = os.path.join(temp_dir, part_filename)
            with open(part_path, "wb") as f:
                writer.write(f)

            split_files.append((part_path, part_filename))
            part_num += 1

        # Pack into ZIP
        os.makedirs(os.path.dirname(output_zip_path), exist_ok=True)
        with zipfile.ZipFile(output_zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
            for filepath, arcname in split_files:
                zipf.write(filepath, arcname)

        # Cleanup temp individual files
        for filepath, _ in split_files:
            try:
                os.remove(filepath)
            except Exception:
                pass
        try:
            os.rmdir(temp_dir)
        except Exception:
            pass

        logger.info(f"Split PDF into {len(split_files)} parts and zipped to {output_zip_path}")
        return True
    except Exception as e:
        logger.error(f"Error splitting PDF {input_pdf} by chunks: {e}")
        return False


def split_all_single_pages(input_pdf: str, output_zip_path: str, base_filename: str) -> bool:
    """
    Splits every single page into an individual PDF file and packs them into a ZIP archive.
    """
    return split_pdf_by_chunks(input_pdf, chunk_size=1, output_zip_path=output_zip_path, base_filename=base_filename)
