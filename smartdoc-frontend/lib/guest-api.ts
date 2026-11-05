import type { ApiResponse } from "@/lib/api/types";

export type GuestPreview = { thumbnail: string; thumbnails: string[]; total_pages: number; filename: string };
const previews = new WeakMap<File, Promise<ApiResponse<GuestPreview>>>();

// Shared by upload and page selection; public requests never send account cookies.
export function previewGuestFile(file: File): Promise<ApiResponse<GuestPreview>> {
  const cached = previews.get(file);
  if (cached) return cached;
  const pending = (async () => {
    const body = new FormData();
    body.append("file", file);
    try {
      const response = await fetch("/api/guest/preview", { method: "POST", body, credentials: "omit", cache: "no-store" });
      const result = await response.json();
      if (!response.ok || result.success !== true || !result.data) {
        throw new Error(result.error || result.message || (typeof result.detail === "string" ? result.detail : "Pratinjau gagal dibuat."));
      }
      return result as ApiResponse<GuestPreview>;
    } catch (error) {
      previews.delete(file);
      return { success: false, data: null, message: "Pratinjau gagal dibuat.", error: error instanceof Error ? error.message : "Pratinjau gagal dibuat." };
    }
  })();
  previews.set(file, pending);
  return pending;
}
