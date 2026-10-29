"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import Sidebar from "@/components/layout/Sidebar";
import { getLoginPath } from "@/lib/auth-token";

/** Protects the user route group and renders the application shell. */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, authError, retryAuth } = useAuth();
  const router = useRouter();


  useEffect(() => {
    if (isLoading || authError) return;
    if (!isAuthenticated) {
      router.replace(getLoginPath());
    }
  }, [isAuthenticated, isLoading, authError, router]);

  if (authError && !isAuthenticated) {
    return <div role="alert">Koneksi ke server terputus. Sesi Anda masih tersimpan. <button type="button" onClick={retryAuth}>Coba lagi</button></div>;
  }

  // Loading: validasi token sedang berlangsung — pakai tone Seline Analytics
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
        <span
          style={{
            fontSize: "13px",
            color: "var(--color-warm-gray)",
            fontWeight: 500,
          }}
        >
          Memuat SmartDoc...
        </span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Belum auth dan bukan login page — jangan render sambil redirect
  if (!isAuthenticated) {
    return null;
  }

  // Authenticated — render layout utama dengan Sidebar
  return (
    <div className="layout">
      <Sidebar />
      <main className="main-content">{children}</main>
    </div>
  );
}
