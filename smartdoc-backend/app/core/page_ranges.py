"""One strict, one-based page selection contract for all split entry points."""
import re


def parse_page_ranges(range_str: str, max_pages: int) -> list[int]:
    pages = set()
    for segment in range_str.split(","):
        match = re.fullmatch(r"\s*([0-9]+)\s*(?:-\s*([0-9]+)\s*)?", segment)
        if not match:
            raise ValueError("Rentang halaman tidak valid. Contoh: 1-3,5.")
        start = int(match[1])
        end = int(match[2] or match[1])
        if not 1 <= start <= end <= max_pages:
            raise ValueError("Rentang halaman tidak valid atau melebihi jumlah halaman.")
        pages.update(range(start - 1, end))
    return sorted(pages)
