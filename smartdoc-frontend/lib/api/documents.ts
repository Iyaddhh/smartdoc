import { apiFetch, API_BASE } from "./client";
import type { ApiResponse, DocumentItem } from "./types";
import { getToken, handleUnauthorized } from "../auth-token";

export async function fetchFirstPagePreview(file: File): Promise<ApiResponse<{ thumbnail: string; thumbnails?: string[]; total_pages?: number; filename: string }>> {
  const form = new FormData();
  form.append("file", file);
  return apiFetch("/api/documents/first-page-preview", { method: "POST", body: form });
}

export async function listDocuments(params?: {
  page?: number;
  limit?: number;
  feature?: string;
  search?: string;
}): Promise<ApiResponse<{
  page: number;
  limit: number;
  total_items: number;
  total_pages: number;
  items: DocumentItem[];
}>> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.feature) qs.set("feature", params.feature);
  if (params?.search) qs.set("search", params.search);
  return apiFetch(`/api/documents?${qs}`);
}

export function getDownloadUrl(docId: string): string {
  return `${API_BASE}/api/documents/${docId}/download`;
}

export function getPreviewUrl(docId: string): string {
  return `${API_BASE}/api/documents/${docId}/preview`;
}

export async function getDocument(docId: string): Promise<ApiResponse<DocumentItem>> {
  return apiFetch(`/api/documents/${docId}`);
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

export async function batchDeleteDocuments(docIds: string[]): Promise<ApiResponse<{ deleted_count: number }>> {
  return apiFetch("/api/documents/batch-delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids: docIds }),
  });
}

export async function batchDownloadDocuments(docIds: string[]): Promise<Blob> {
  const token = getToken();
  const res = await fetch(`${API_BASE}/api/documents/batch-download`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ ids: docIds }),
  });
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined") {
      handleUnauthorized(token);
    }
    const errorData = await res.json().catch(() => null);
    throw new Error(errorData?.message || "Gagal mengunduh berkas terpilih.");
  }
  return res.blob();
}
