export const documentToolLabels = {
  converter: "Konversi", compressor: "Kompresi", splitter: "Pisah halaman", merger: "Gabung berkas", watermark: "Watermark & sandi",
} as const;
export type DocumentTool = keyof typeof documentToolLabels;

export function availableDocumentTools(format: string): DocumentTool[] {
  const extension = format.toLowerCase().replace(/^\./, "");
  if (["pdf", "docx"].includes(extension)) return ["converter", "compressor", "splitter", "merger", "watermark"];
  if (["xlsx", "pptx", "jpg", "jpeg", "png"].includes(extension)) return ["converter", "compressor", "merger"];
  return [];
}
