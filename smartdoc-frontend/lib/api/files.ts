import { handleUnauthorized } from "../auth-token";
import { sessionFetch } from "../session";
import { isCompletedFile } from "../success-feedback";

export async function fetchFile(url: string, signal?: AbortSignal, init?: RequestInit) {
  const response = await sessionFetch(url, {
    ...init,
    signal,
  });
  if (!response.ok) {
    if (response.status === 401) handleUnauthorized();
    const error = await response.json().catch(() => null);
    throw new Error(error?.message || "Gagal mengambil berkas.");
  }
  const blob = await response.blob();
  if (!isCompletedFile(response, blob)) throw new Error("Berkas tidak tersedia atau respons unduhan tidak valid.");
  return { blob, disposition: response.headers.get("Content-Disposition") };
}
