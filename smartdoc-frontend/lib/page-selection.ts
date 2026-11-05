// Match the backend's strict, one-based page range contract before uploading a file.
export function validatePageSelection(expression: string, totalPages?: number): { pages: number[]; error: string } {
  const pages = new Set<number>();
  if (!expression.trim()) return { pages: [], error: "Pilih minimal satu halaman atau isi rentang halaman." };
  for (const segment of expression.split(",")) {
    const match = segment.match(/^\s*([0-9]+)\s*(?:-\s*([0-9]+)\s*)?$/);
    if (!match) return { pages: [], error: "Rentang halaman tidak valid. Contoh: 1-3,5." };
    const start = Number(match[1]);
    const end = Number(match[2] || match[1]);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start || (totalPages !== undefined && end > totalPages)) {
      return { pages: [], error: totalPages !== undefined ? `Pilih halaman antara 1 dan ${totalPages}, dengan urutan rentang dari kecil ke besar.` : "Nomor halaman harus positif dan rentang harus berurutan dari kecil ke besar." };
    }
    // Without document metadata, validate the syntax without expanding unbounded ranges.
    if (totalPages !== undefined) for (let page = start; page <= end; page++) pages.add(page);
  }
  return { pages: [...pages].sort((a, b) => a - b), error: "" };
}
