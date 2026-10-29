import { apiFetch } from "./client";
import type { ApiResponse, DocumentInfo } from "./types";

export async function getSplitDocumentInfo(file: File): Promise<ApiResponse<DocumentInfo>> {
  const form = new FormData();
  form.append("file", file);
  return apiFetch("/api/splitter/info", { method: "POST", body: form });
}

export async function splitDocument(params: {
  file: File;
  splitMode: "extract_range" | "fixed_interval" | "all_single";
  rangeExpression?: string;
  chunkSize?: number;
  outputFormat?: "pdf" | "docx";
}): Promise<ApiResponse<{ job_id: string; document_id: string; original_filename: string; split_mode: string }>> {
  const form = new FormData();
  form.append("file", params.file);
  form.append("split_mode", params.splitMode);
  if (params.rangeExpression) form.append("range_expression", params.rangeExpression);
  if (params.chunkSize) form.append("chunk_size", String(params.chunkSize));
  if (params.outputFormat) form.append("output_format", params.outputFormat);
  return apiFetch("/api/splitter/process", { method: "POST", body: form });
}
