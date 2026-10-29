"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { AUTH_CHANGED_EVENT, TOKEN_KEY, clearSession, rememberLoginRole, type UserRole, type AccessRole } from "./auth-token";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface AuthUser {
  id: string;
  username: string;
  email: string;
  role: UserRole;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  role: AccessRole;
  authError: boolean;
  retryAuth: () => void;
  login: (username: string, password: string, role?: UserRole) => Promise<{ success: boolean; error?: string }>;
  register: (username: string, email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<boolean>;
}

// ─── Context ──────────────────────────────────────────────────────────────────
const AuthContext = createContext<AuthContextValue | null>(null);

const API_BASE = typeof window !== "undefined" ? "" : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000");

// ─── Provider ─────────────────────────────────────────────────────────────────
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true); // true until token validated
  const [authError, setAuthError] = useState(false);
  const [authRevision, setAuthRevision] = useState(0);
  const retryAuth = useCallback(() => setAuthRevision((value) => value + 1), []);

  // On mount: restore token from localStorage and verify it
  useEffect(() => {
    let active = true;
    const onStorage = (event: StorageEvent) => {
      if (event.key === TOKEN_KEY) retryAuth();
    };
    const onAuthChanged = () => retryAuth();
    window.addEventListener("storage", onStorage);
    window.addEventListener(AUTH_CHANGED_EVENT, onAuthChanged);
    const savedToken = localStorage.getItem(TOKEN_KEY);
    if (!savedToken) {
      // Synchronize with browser storage after hydration or a cross-tab session change.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setToken(null);
      setUser(null);
      setAuthError(false);
      setIsLoading(false);
      return () => {
        active = false;
        window.removeEventListener("storage", onStorage);
        window.removeEventListener(AUTH_CHANGED_EVENT, onAuthChanged);
      };
    }
    setIsLoading(true);
    setAuthError(false);
    // Verify token by calling /api/auth/me
    fetch(`${API_BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${savedToken}` },
    })
      .then(async (res) => {
        if (res.status === 401 || res.status === 403) {
          if (active && localStorage.getItem(TOKEN_KEY) === savedToken) clearSession();
          return null;
        }
        if (!res.ok) throw new Error("Server unavailable");
        const json = await res.json();
        if (!active) return null;
        if (json?.success && json?.data) {
          if (json.data.role !== "user" && json.data.role !== "admin") {
            if (localStorage.getItem(TOKEN_KEY) === savedToken) clearSession();
            return null;
          }
          rememberLoginRole(json.data.role);
          setToken(savedToken);
          setUser(json.data as AuthUser);
        } else {
          if (localStorage.getItem(TOKEN_KEY) === savedToken) clearSession();
        }
      })
      .catch(() => {
        if (active) setAuthError(true);
      })
      .finally(() => { if (active) setIsLoading(false); });
    return () => {
      active = false;
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(AUTH_CHANGED_EVENT, onAuthChanged);
    };
  }, [authRevision, retryAuth]);

  // ── Login ──────────────────────────────────────────────────────────────────
  const login = useCallback(async (username: string, password: string, role: UserRole = "user") => {
    try {
      const form = new URLSearchParams();
      form.append("username", username);
      form.append("password", password);

      const endpoint = role === "admin" ? "/api/auth/admin/login" : "/api/auth/login";
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        return { success: false, error: json?.message || json?.detail || "Username atau password salah." };
      }

      const accessToken: string = json?.access_token;
      if (!accessToken) return { success: false, error: "Token tidak diterima dari server." };

      // Fetch user info
      const meRes = await fetch(`${API_BASE}/api/auth/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const meJson = await meRes.json().catch(() => null);

      if (!meRes.ok || !meJson?.success || !meJson?.data || meJson.data.role !== role) {
        return { success: false, error: meJson?.message || "Gagal memuat profil pengguna." };
      }
      localStorage.setItem(TOKEN_KEY, accessToken);
      rememberLoginRole(role);
      setToken(accessToken);
      setUser(meJson?.data as AuthUser ?? null);
      setAuthError(false);
      return { success: true };
    } catch {
      return { success: false, error: "Gagal terhubung ke server. Pastikan backend aktif." };
    }
  }, []);

  // ── Register ───────────────────────────────────────────────────────────────
  const register = useCallback(async (username: string, email: string, password: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        return { success: false, error: json?.message || json?.detail || "Registrasi gagal." };
      }
      return { success: true };
    } catch {
      return { success: false, error: "Gagal terhubung ke server." };
    }
  }, []);

  // ── Logout ─────────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    const currentToken = localStorage.getItem(TOKEN_KEY);
    try {
      const response = await fetch(`${API_BASE}/api/auth/logout`, {
        method: "POST",
        headers: currentToken ? { Authorization: `Bearer ${currentToken}` } : {},
      });
      if (!response.ok && response.status !== 401) return false;
      if (localStorage.getItem(TOKEN_KEY) === currentToken) {
        clearSession();
        setToken(null);
        setUser(null);
      }
      return true;
    } catch {
      return false;
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: !!token && !!user,
        role: token && user ? user.role : "guest",
        authError,
        retryAuth,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}

// ─── Token Accessor (untuk api.ts) ────────────────────────────────────────────
export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}
