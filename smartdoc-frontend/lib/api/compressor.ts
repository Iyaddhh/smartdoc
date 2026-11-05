import { apiFetch } from "./client";
import type { ApiResponse } from "./types";

export async function compressFile(file: File, saveToWorkspace = false): Promise<ApiResponse<{ job_id: string; document_id: string; original_filename: string; original_size: number }>> {
  const form = new FormData();
  form.append("file", file);
  form.append("save_to_workspace", String(saveToWorkspace));
  return apiFetch("/api/compressor/process", { method: "POST", body: form });
}
