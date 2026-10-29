import { apiFetch } from "./client";
import type { ApiResponse } from "./types";

export async function convertFile(
  files: File | File[],
  outputFormat: string,
  customTitle?: string
): Promise<ApiResponse<{ job_id: string; document_id: string; output_format: string }>> {
  const form = new FormData();
  if (Array.isArray(files)) {
    files.forEach((f) => form.append("files", f));
  } else {
    form.append("file", files);
  }
  form.append("output_format", outputFormat);
  if (customTitle && customTitle.trim()) {
    form.append("custom_title", customTitle.trim());
  }
  return apiFetch("/api/converter/process", { method: "POST", body: form });
}
