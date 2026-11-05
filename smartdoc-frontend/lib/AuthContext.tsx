"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { sessionFetch } from "./session";
import { AUTH_CHANGED_EVENT, TOKEN_KEY, rememberLoginRole, type UserRole, type AccessRole } from "./auth-token";
import { authPageError, type AuthErrorStatus } from "./page-errors";

export interface AuthUser {
  id: string; username: string; email: string; role: UserRole;
  display_name: string; timezone: string; onboarding_complete: boolean; storage_quota_mb: number;
}
interface AuthContextValue {
  user: AuthUser | null; isLoading: boolean; isAuthenticated: boolean; role: AccessRole;
  authError: boolean; authErrorStatus: AuthErrorStatus | null; retryAuth: () => void;
  isLoggingOut: boolean;
  login: (email: string, password: string, role?: UserRole, rememberMe?: boolean) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<boolean>;
  acceptProfile: (profile: AuthUser) => void;
}
const Context = createContext<AuthContextValue | null>(null);
const REVISION = "smartdoc_session_changed";

function notifyTabs() { localStorage.setItem(REVISION, crypto.randomUUID()); }

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [authErrorStatus, setAuthErrorStatus] = useState<AuthErrorStatus | null>(null);
  const authError = authErrorStatus !== null;
  const [isLoggingOut, setLoggingOut] = useState(false);
  const [revision, setRevision] = useState(0);
  const retryAuth = useCallback(() => setRevision((value) => value + 1), []);
  const acceptProfile = useCallback((profile: AuthUser) => { setLoggingOut(false); setUser(profile); setAuthErrorStatus(null); rememberLoginRole(profile.role); notifyTabs(); }, []);

  useEffect(() => {
    let active = true;
    localStorage.removeItem(TOKEN_KEY); // Migrate old browser sessions; auth tokens never return to storage.
    const restore = async () => {
      setLoading(true);
      try {
        const response = await sessionFetch("/api/auth/me");
        if (!active) return;
        if (response.status === 401) {
          setUser(null); setAuthErrorStatus(null); return;
        }
        if (!response.ok) {
          if (response.status === 403) setUser(null);
          setAuthErrorStatus(authPageError(response.status)); return;
        }
        const body = await response.json();
        if (!active) return;
        if (!body.success || !body.data) throw new Error("Profile unavailable");
        setUser(body.data);
        if (body.data) rememberLoginRole(body.data.role);
        setAuthErrorStatus(null);
      } catch { if (active) setAuthErrorStatus(503); }
      finally { if (active) setLoading(false); }
    };
    void restore();
    const onStorage = (event: StorageEvent) => { if (event.key === REVISION || event.key === null) retryAuth(); };
    window.addEventListener("storage", onStorage);
    window.addEventListener(AUTH_CHANGED_EVENT, retryAuth);
    return () => { active = false; window.removeEventListener("storage", onStorage); window.removeEventListener(AUTH_CHANGED_EVENT, retryAuth); };
  }, [revision, retryAuth]);

  const login = useCallback(async (email: string, password: string, role: UserRole = "user", rememberMe = false) => {
    try {
      const response = await sessionFetch(role === "admin" ? "/api/auth/admin/login" : "/api/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, remember_me: rememberMe }),
      }, false);
      const body = await response.json();
      if (!response.ok || response.status !== 200 || body?.success !== true || !body.data?.id || !["user", "admin"].includes(body.data.role)) return { success: false, error: body?.message || "Login belum dapat dikonfirmasi." };
      setLoggingOut(false); setUser(body.data); setAuthErrorStatus(null); rememberLoginRole(role); notifyTabs();
      return { success: true };
    } catch { return { success: false, error: "Gagal terhubung ke server." }; }
  }, []);

  const logout = useCallback(async () => {
    try {
      const response = await sessionFetch("/api/auth/logout", { method: "POST" }, false);
      if (!response.ok) return false;
      setLoggingOut(true); setUser(null); setAuthErrorStatus(null); notifyTabs(); return true;
    } catch { return false; }
  }, []);
  return <Context.Provider value={{ user, isLoading, isAuthenticated: !!user, role: user?.role || "guest", authError, authErrorStatus, isLoggingOut, retryAuth, acceptProfile, login, logout }}>{children}</Context.Provider>;
}

export function useAuth() {
  const context = useContext(Context);
  if (!context) throw new Error("useAuth requires AuthProvider");
  return context;
}
