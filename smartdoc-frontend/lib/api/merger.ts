import { apiFetch } from "./client";
import type { ApiResponse } from "./types";

export async function getMergerDocInfo(file: File): Promise<ApiResponse<{ filename: string; total_pages: number; file_size: number }>> {
  const form = new FormData();
  form.append("file", file);
  return apiFetch("/api/merger/info", { method: "POST", body: form });
}

export async function mergeDocuments(params: {
  files: File[];
  mergeMode?: "sequence" | "insert";
  insertPosition?: "start" | "end" | "custom";
  afterPage?: number;
  customTitle?: string;
}): Promise<ApiResponse<{ job_id: string; document_id: string; file_count: number; custom_name: string }>> {
  const form = new FormData();
  params.files.forEach((file) => {
    form.append("files", file);
  });
  if (params.mergeMode) form.append("merge_mode", params.mergeMode);
  if (params.insertPosition) form.append("insert_position", params.insertPosition);
  if (params.afterPage !== undefined) form.append("after_page", String(params.afterPage));
  if (params.customTitle) form.append("custom_title", params.customTitle);
  return apiFetch("/api/merger/process", { method: "POST", body: form });
}
