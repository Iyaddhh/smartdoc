import { apiFetch } from "./client";
import type { ApiResponse } from "./types";

export async function watermarkDocument(params: {
  file: File;
  watermarkText?: string;
  opacity?: number;
  angle?: number;
  fontSize?: number;
  colorHex?: string;
  password?: string;
}): Promise<ApiResponse<{ job_id: string; document_id: string; original_filename: string; custom_name: string; has_password: boolean }>> {
  const form = new FormData();
  form.append("file", params.file);
  if (params.watermarkText) form.append("watermark_text", params.watermarkText);
  if (params.opacity !== undefined) form.append("opacity", String(params.opacity));
  if (params.angle !== undefined) form.append("angle", String(params.angle));
  if (params.fontSize !== undefined) form.append("font_size", String(params.fontSize));
  if (params.colorHex) form.append("color_hex", params.colorHex);
  if (params.password) form.append("password", params.password);
  return apiFetch("/api/watermark/process", { method: "POST", body: form });
}
