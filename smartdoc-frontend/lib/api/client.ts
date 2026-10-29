import type { ApiResponse } from "./types";
import { getToken, handleUnauthorized } from "../auth-token";
export const API_BASE = typeof window !== "undefined" ? "" : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000");

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<ApiResponse<T>> {
  try {
    const token = getToken();
    const headers = new Headers(init?.headers);
    if (!headers.has("Accept")) headers.set("Accept", "application/json");
    if (token) headers.set("Authorization", `Bearer ${token}`);

    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers,
    });

    // Auto-redirect ke /login jika token expired atau tidak ada
    if (res.status === 401 && typeof window !== "undefined") {
      handleUnauthorized(token);
      return {
        success: false,
        data: null,
        message: "Sesi berakhir. Silakan login kembali.",
        error: "Unauthorized",
      };
    }

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
