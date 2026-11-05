import { getExtension, isImageFile } from "./file-validation";

export type ConversionFormat = "pdf" | "docx" | "jpg" | "png";

export const conversionFormatLabels: Record<ConversionFormat, string> = {
  pdf: "PDF",
  docx: "Word (DOCX)",
  jpg: "Gambar JPG (ZIP)",
  png: "Gambar PNG (ZIP)",
};

export function getConversionFormats(files: readonly { name: string }[]): ConversionFormat[] {
  if (!files.length) return [];
  if (files.every((file) => isImageFile(file.name))) return ["pdf"];
  if (files.length !== 1) return [];
  const extension = getExtension(files[0].name);
  if (extension === ".pdf") return ["docx", "jpg", "png"];
  if ([".docx", ".xlsx", ".pptx"].includes(extension)) return ["pdf"];
  return [];
}
