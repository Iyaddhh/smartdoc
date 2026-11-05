export const API_BASE = typeof window !== "undefined" ? "" : (process.env.API_INTERNAL_URL || "http://127.0.0.1:8000");

function csrfToken() {
  if (typeof document === "undefined") return "";
  return document.cookie.split("; ").find((item) => item.startsWith("smartdoc_csrf="))?.split("=").slice(1).join("=") || "";
}

async function request(path: string, init?: RequestInit) {
  const method = (init?.method || "GET").toUpperCase();
  if (!["GET", "HEAD", "OPTIONS"].includes(method) && !csrfToken()) {
    await fetch(`${API_BASE}/api/auth/csrf`, { credentials: "include", cache: "no-store" });
  }
  const headers = new Headers(init?.headers);
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) headers.set("X-CSRF-Token", csrfToken());
  return fetch(path.startsWith("http") ? path : `${API_BASE}${path}`, { ...init, headers, credentials: "include", cache: "no-store" });
}

let refreshFlight: Promise<void> | null = null;

export async function sessionFetch(path: string, init?: RequestInit, refresh = true): Promise<Response> {
  let response = await request(path, init);
  if (response.status !== 401 || !refresh || response.headers?.get("X-Session-Refresh") === "unavailable") return response;
  const recover = async () => {
    // A different tab may have refreshed while this tab waited for the lock.
    response = await request(path, init);
    if (response.status !== 401) return;
    const renewed = await request("/api/auth/refresh", { method: "POST" });
    if (renewed.ok) response = await request(path, init);
    else if (renewed.status !== 401) response = renewed;
  };
  if (typeof navigator !== "undefined" && navigator.locks) {
    await navigator.locks.request("smartdoc-session-refresh", recover);
  } else {
    if (!refreshFlight) refreshFlight = recover().finally(() => { refreshFlight = null; });
    await refreshFlight;
    if (response.status === 401) response = await request(path, init);
  }
  return response;
}
