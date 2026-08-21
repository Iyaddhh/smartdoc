const NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const API_BASE = NEXT_PUBLIC_API_URL;

// --- Types ---
export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T | null;
  message: string;
  error: string | null;
}

export interface JobStatus {
  id: string;
  document_id: string;
  feature: string;
  status: "pending" | "processing" | "done" | "failed";
  progress: number;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

export interface DocumentItem {
  id: string;
  feature: "converter" | "compressor" | "ocr" | "splitter" | "merger" | "watermark";
  custom_name: string | null;
  original_file: string | null;
  output_file: string | null;
  output_docx: string | null;
  output_pdf: string | null;
  original_size: number;
  output_size: number | null;
  status: string;
  confidence_score: number | null;
  created_at: string;
}

export interface TemplateItem {
  id: string;
  name: string;
  description: string | null;
  version: number;
  is_active: boolean;
  fields: TemplateField[];
  thumbnail: string | null;
  created_at: string;
}

export interface TemplateField {
  key: string;
  label: string;
  type: string;
  zone: { x_norm: number; y_norm: number; w_norm: number; h_norm: number };
}

export interface DocumentInfo {
  filename: string;
  format: string;
  total_pages: number;
  file_size: number;
  thumbnails?: string[];
}

// --- Robust Fetch Helper with Error Boundary & Graceful Fallback ---
async function apiFetch<T>(path: string, init?: RequestInit): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { Accept: "application/json", ...init?.headers },
      ...init,
    });

    const json = (await res.json().catch(() => null)) as ApiResponse<T> | null;

    if (!res.ok) {
      return {
        success: false,
        data: null,
        message: json?.message || `HTTP Error ${res.status}`,
        error: json?.error || `Permintaan gagal dengan status HTTP ${res.status}`,
      };
    }

    if (json && typeof json === "object" && "success" in json) {
      return json;
    }

    return {
      success: true,
      data: json as unknown as T,
      message: "OK",
      error: null,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Network error";
    return {
      success: false,
      data: null,
      message: "Gagal terhubung ke backend",
      error: `Server backend belum aktif atau tidak dapat dijangkau (${errorMsg}). Pastikan backend berjalan di port 8000.`,
    };
  }
}

// --- Jobs ---
export async function getJobStatus(jobId: string): Promise<ApiResponse<JobStatus>> {
  return apiFetch<JobStatus>(`/api/jobs/${jobId}`);
}

// --- Compressor ---
export async function compressFile(file: File): Promise<ApiResponse<{ job_id: string; document_id: string; original_filename: string; original_size: number }>> {
  const form = new FormData();
  form.append("file", file);
  return apiFetch("/api/compressor/process", { method: "POST", body: form });
}

// --- Converter ---
export async function convertFile(file: File, outputFormat: string): Promise<ApiResponse<{ job_id: string; document_id: string; output_format: string; redirect?: boolean; feature?: string }>> {
  const form = new FormData();
  form.append("file", file);
  form.append("output_format", outputFormat);
  return apiFetch("/api/converter/process", { method: "POST", body: form });
}

// --- Splitter ---
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

// --- Merger ---
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

// --- Watermark & Security ---
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

// --- Documents ---
export async function fetchFirstPagePreview(file: File): Promise<ApiResponse<{ thumbnail: string; thumbnails?: string[]; total_pages?: number; filename: string }>> {
  const form = new FormData();
  form.append("file", file);
  return apiFetch("/api/documents/first-page-preview", { method: "POST", body: form });
}

export async function listDocuments(params?: { page?: number; limit?: number; feature?: string }): Promise<ApiResponse<{ page: number; limit: number; items: DocumentItem[] }>> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.feature) qs.set("feature", params.feature);
  return apiFetch(`/api/documents?${qs}`);
}

export function getDownloadUrl(docId: string, fmt?: "docx" | "pdf"): string {
  return `${API_BASE}/api/documents/${docId}/download${fmt ? `?fmt=${fmt}` : ""}`;
}

export async function renameDocument(docId: string, customName: string): Promise<ApiResponse<{ id: string; custom_name: string }>> {
  return apiFetch(`/api/documents/${docId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ custom_name: customName }),
  });
}

export async function deleteDocument(docId: string): Promise<ApiResponse<null>> {
  return apiFetch(`/api/documents/${docId}`, { method: "DELETE" });
}

// --- Templates ---
export async function listTemplates(): Promise<ApiResponse<TemplateItem[]>> {
  return apiFetch("/api/templates");
}

export async function getTemplate(id: string): Promise<ApiResponse<TemplateItem>> {
  return apiFetch(`/api/templates/${id}`);
}

export async function createTemplate(form: FormData): Promise<ApiResponse<TemplateItem>> {
  return apiFetch("/api/templates", { method: "POST", body: form });
}

export async function updateTemplate(id: string, form: FormData): Promise<ApiResponse<TemplateItem>> {
  return apiFetch(`/api/templates/${id}`, { method: "PUT", body: form });
}

export async function deleteTemplate(id: string): Promise<ApiResponse<null>> {
  return apiFetch(`/api/templates/${id}`, { method: "DELETE" });
}
