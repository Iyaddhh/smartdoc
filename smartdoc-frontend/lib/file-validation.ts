import { formatBytes } from "./format";

export const IMAGE_EXTS = [".jpg", ".jpeg", ".png"];
export const MAX_IMAGE_MB = 12;
export const MAX_DOC_MB = 35;
export const MAX_PPTX_MB = 200;
export const MAX_IMAGE_DIM_PX = 10000;
export const MAX_MULTI_IMAGES = 50;

export function getExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot < 0 ? "" : filename.slice(dot).toLowerCase();
}

export function isImageFile(filename: string): boolean {
  return IMAGE_EXTS.includes(getExtension(filename));
}

export async function validateUpload(file: File, options: { accept?: string; maxSizeMB?: number; allowLargePptx?: boolean } = {}): Promise<{ valid: boolean; error?: string }> {
  const ext = getExtension(file.name);
  const invalid = (error: string) => ({ valid: false, error });
  if (!file.size) return invalid(`Berkas "${file.name}" kosong (0 bytes).`);
  if (options.accept && !options.accept.split(",").map((value) => value.trim().toLowerCase()).includes(ext)) {
    return invalid(`Format file "${ext}" tidak didukung. Format yang diterima: ${options.accept}`);
  }
  const categoryLimit = isImageFile(file.name) ? MAX_IMAGE_MB : ext === ".pptx" && options.allowLargePptx ? MAX_PPTX_MB : [".pdf", ".docx", ".xlsx", ".pptx"].includes(ext) ? MAX_DOC_MB : Infinity;
  const limit = Math.min(options.maxSizeMB ?? Infinity, categoryLimit);
  if (file.size > limit * 1024 * 1024) return invalid(`Ukuran "${file.name}" (${formatBytes(file.size)}) melebihi batas maksimal ${limit} MB.`);
  if (!isImageFile(file.name)) return { valid: true };
  return new Promise((resolve) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image.width > MAX_IMAGE_DIM_PX || image.height > MAX_IMAGE_DIM_PX
        ? invalid(`Dimensi gambar (${image.width}x${image.height}px) melebihi batas maksimum ${MAX_IMAGE_DIM_PX}px.`)
        : { valid: true });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(invalid(`Berkas "${file.name}" tidak dapat dibaca atau corrupt.`));
    };
    image.src = url;
  });
}

export function validateImageFile(file: File) {
  return validateUpload(file, { accept: IMAGE_EXTS.join(",") });
}
