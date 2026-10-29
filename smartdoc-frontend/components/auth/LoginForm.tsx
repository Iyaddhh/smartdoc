"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { UserRole } from "@/lib/auth-token";
import { useRouter } from "next/navigation";
import { Sparkles, User, Lock, Eye, EyeOff, ArrowRight, ShieldCheck, AlertCircle } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";

export default function LoginForm({ role }: { role: UserRole }) {
  const { login, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  // Sesi aktif diarahkan ke workspace yang dilindungi.
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [isAuthenticated, isLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isPending) return;

    setError(null);
    setIsPending(true);

    try {
      const res = await login(username.trim(), password, role);
      if (!res.success) {
        setError(res.error || "Username atau password salah.");
        setIsPending(false);
      } else {
        // Berhasil login — langsung arahkan ke dashboard
        router.replace("/dashboard");
      }
    } catch {
      setError("Terjadi kesalahan pada jaringan atau server.");
      setIsPending(false);
    }
  };

  if (isLoading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "var(--color-stone-canvas)",
          gap: "14px",
        }}
      >
        <div
          style={{
            width: 34,
            height: 34,
            border: "2.5px solid var(--color-stone-muted)",
            borderTopColor: "var(--color-cyan-signal)",
            borderRadius: "50%",
            animation: "spin 0.7s linear infinite",
          }}
        />
        <span style={{ fontSize: "13px", color: "var(--color-warm-gray)", fontWeight: 500 }}>
          Memuat SmartDoc...
        </span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "var(--color-stone-canvas)",
        padding: "24px 16px",
        fontFamily: "var(--font-inter)",
      }}
    >
      {/* Container Card */}
      <div
        className="animate-fade-in"
        style={{
          width: "100%",
          maxWidth: "400px",
          backgroundColor: "var(--color-pure-white)",
          border: "1px solid var(--color-stone-border)",
          borderRadius: "var(--radius-feature-card)",
          boxShadow: "var(--shadow-md)",
          padding: "36px 32px",
          boxSizing: "border-box",
        }}
      >
        {/* Brand Header */}
        <div style={{ marginBottom: "28px", textAlign: "left" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              marginBottom: "16px",
            }}
          >
            <div
              className="sidebar-logo-mark"
              style={{
                width: 32,
                height: 32,
                borderRadius: "var(--radius-icons)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Sparkles size={18} strokeWidth={2} />
            </div>
            <div>
              <div
                style={{
                  fontSize: "15px",
                  fontWeight: 600,
                  color: "var(--color-ink-black)",
                  lineHeight: 1.2,
                }}
              >
                SmartDoc
              </div>
              <div
                style={{
                  fontSize: "11px",
                  color: "var(--color-warm-gray)",
                  letterSpacing: "0.02em",
                }}
              >
                Document Workspace
              </div>
            </div>
          </div>

          <h1
            style={{
              fontFamily: "var(--font-roobert)",
              fontSize: "22px",
              fontWeight: 600,
              color: "var(--color-ink-black)",
              letterSpacing: "var(--tracking-heading-sm)",
              margin: 0,
            }}
          >
            {role === "admin" ? "Masuk sebagai Admin" : "Masuk sebagai User"}
          </h1>
          <p
            style={{
              fontSize: "13px",
              color: "var(--color-warm-gray)",
              marginTop: "4px",
              marginBottom: 0,
              lineHeight: 1.5,
            }}
          >
            {role === "admin" ? "Gunakan akun admin untuk masuk ke SmartDoc." : "Akses dokumen, alat konversi, dan riwayat berkas Anda."}
          </p>
        </div>

        {/* Error Notification */}
        {error && (
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "8px",
              backgroundColor: "var(--clr-error-bg)",
              border: "1px solid var(--clr-error-border)",
              color: "var(--clr-error)",
              borderRadius: "var(--radius-inputs)",
              padding: "10px 12px",
              fontSize: "13px",
              lineHeight: 1.4,
              marginBottom: "20px",
            }}
            role="alert"
          >
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: "2px" }} />
            <span>{error}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          {/* Username Field */}
          <div>
            <label
              htmlFor="username"
              style={{
                display: "block",
                fontSize: "13px",
                fontWeight: 500,
                color: "var(--color-ink-black)",
                marginBottom: "6px",
              }}
            >
              Username
            </label>
            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
              <User
                size={16}
                style={{
                  position: "absolute",
                  left: "12px",
                  color: "var(--color-ash-gray)",
                  pointerEvents: "none",
                }}
              />
              <input
                id="username"
                type="text"
                autoComplete="username"
                autoFocus
                required
                placeholder="Masukkan username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input"
                style={{
                  paddingLeft: "36px",
                  fontSize: "14px",
                  minHeight: "40px",
                  borderRadius: "var(--radius-inputs)",
                }}
              />
            </div>
          </div>

          {/* Password Field */}
          <div>
            <label
              htmlFor="password"
              style={{
                display: "block",
                fontSize: "13px",
                fontWeight: 500,
                color: "var(--color-ink-black)",
                marginBottom: "6px",
              }}
            >
              Password
            </label>
            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
              <Lock
                size={16}
                style={{
                  position: "absolute",
                  left: "12px",
                  color: "var(--color-ash-gray)",
                  pointerEvents: "none",
                }}
              />
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                placeholder="Masukkan password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                style={{
                  paddingLeft: "36px",
                  paddingRight: "38px",
                  fontSize: "14px",
                  minHeight: "40px",
                  borderRadius: "var(--radius-inputs)",
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                style={{
                  position: "absolute",
                  right: "10px",
                  color: "var(--color-ash-gray)",
                  padding: "4px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "var(--radius-inputs)",
                }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            id="login-submit-btn"
            type="submit"
            disabled={isPending}
            className="btn btn-primary"
            style={{
              width: "100%",
              minHeight: "42px",
              fontSize: "14px",
              fontWeight: 500,
              marginTop: "6px",
              gap: "8px",
            }}
          >
            {isPending ? (
              <>
                <div
                  style={{
                    width: 16,
                    height: 16,
                    border: "2px solid rgba(255,255,255,0.4)",
                    borderTopColor: "#fff",
                    borderRadius: "50%",
                    animation: "spin 0.6s linear infinite",
                  }}
                />
                <span>Memproses...</span>
              </>
            ) : (
              <>
                <span>Masuk</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        <p style={{ marginTop: "20px", fontSize: "13px", textAlign: "center" }}>
          <Link href={role === "admin" ? "/login" : "/admin/login"} style={{ color: "var(--color-cyan-edge)" }}>
            {role === "admin" ? "Masuk sebagai user" : "Masuk sebagai admin"}
          </Link>
        </p>
        {/* Security badge footer */}
        <p style={{ marginTop: "12px", fontSize: "13px", textAlign: "center" }}>
          <Link href="/">Kembali ke beranda</Link>
        </p>
        <div
          style={{
            marginTop: "24px",
            paddingTop: "18px",
            borderTop: "1px solid var(--color-stone-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            color: "var(--color-ash-gray)",
            fontSize: "12px",
          }}
        >
          <ShieldCheck size={14} style={{ color: "var(--color-cyan-edge)" }} />
          <span>Sesi terenkripsi & dilindungi</span>
        </div>
      </div>
    </div>
  );
}
