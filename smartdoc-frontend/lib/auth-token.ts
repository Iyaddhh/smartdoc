export const TOKEN_KEY = "smartdoc_access_token";
export type UserRole = "user" | "admin";
export type AccessRole = "guest" | UserRole;
const LOGIN_ROLE_KEY = "smartdoc_login_role";
export const AUTH_CHANGED_EVENT = "smartdoc-auth-changed";

export function clearSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

export function handleUnauthorized(requestToken: string | null) {
  if (typeof window === "undefined") return;
  if (getToken() !== requestToken) return;
  clearSession();
  const loginPath = getLoginPath();
  if (window.location.pathname !== loginPath) window.location.href = loginPath;
}

export function rememberLoginRole(role: UserRole) {
  localStorage.setItem(LOGIN_ROLE_KEY, role);
}

export function getLoginPath(): string {
  return typeof window !== "undefined" && localStorage.getItem(LOGIN_ROLE_KEY) === "admin"
    ? "/admin/login"
    : "/login";
}

export function getToken(): string | null {
  return typeof window === "undefined" ? null : localStorage.getItem(TOKEN_KEY);
}
