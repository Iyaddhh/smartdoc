import { getToken, handleUnauthorized } from "../auth-token";

export async function fetchFile(url: string, signal?: AbortSignal) {
  const token = getToken();
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal,
  });
  if (!response.ok) {
    if (response.status === 401) handleUnauthorized(token);
    const error = await response.json().catch(() => null);
    throw new Error(error?.message || "Gagal mengambil berkas.");
  }
  return { blob: await response.blob(), disposition: response.headers.get("Content-Disposition") };
}
