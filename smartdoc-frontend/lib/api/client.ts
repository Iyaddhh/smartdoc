import type { ApiResponse } from "./types";
import { handleUnauthorized } from "../auth-token";
import { sessionFetch } from "../session";
export { API_BASE } from "../session";

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<ApiResponse<T>> {
  try {
    const headers = new Headers(init?.headers);
    if (!headers.has("Accept")) headers.set("Accept", "application/json");

    const res = await sessionFetch(path, {
      ...init,
      headers,
    });

    // Auto-redirect ke /login jika token expired atau tidak ada
    if (res.status === 401 && typeof window !== "undefined") {
      handleUnauthorized();
      return {
        httpStatus: res.status,
        success: false,
        data: null,
        message: "Sesi berakhir. Silakan login kembali.",
        error: "Unauthorized",
      };
    }

    if (res.status === 204) {
      return { httpStatus: 204, success: true, data: null, message: "Selesai", error: null };
    }
    const json = (await res.json().catch(() => null)) as ApiResponse<T> | null;

    if (!res.ok) {
      return {
        httpStatus: res.status,
        success: false,
        data: null,
        message: json?.message || `HTTP Error ${res.status}`,
        error: json?.error || `Permintaan gagal dengan status HTTP ${res.status}`,
      };
    }

    if (json && typeof json === "object" && typeof json.success === "boolean") {
      return { ...json, data: json.success ? json.data ?? null : null, httpStatus: res.status };
    }

    return {
      httpStatus: res.status,
      success: false,
      data: null,
      message: "Respons server tidak valid. Periksa status sebelum mencoba lagi.",
      error: "INVALID_RESPONSE",
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
