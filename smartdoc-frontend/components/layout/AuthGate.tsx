"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import Sidebar from "@/components/layout/Sidebar";
import { getHomePath, getLoginPath } from "@/lib/auth-token";
import ErrorScreen from "@/components/errors/ErrorScreen";

/** Protects the user route group and renders the application shell. */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isLoading, authError, authErrorStatus, isLoggingOut, retryAuth } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const adminArea = pathname === "/administration" || pathname.startsWith("/administration/");


  useEffect(() => {
    if (isLoading || authError || isLoggingOut) return;
    if (!isAuthenticated) {
      router.replace(getLoginPath());
    } else if (user && !user.onboarding_complete) {
      router.replace("/auth/onboarding");
    }
  }, [user, isAuthenticated, isLoading, authError, isLoggingOut, router, adminArea]);

  // Validate the session before rendering the private workspace.
  if (isLoading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "var(--color-canvas-white)",
          gap: "14px",
        }}
      >
        <div
          style={{
            width: 34,
            height: 34,
            border: "2.5px solid var(--color-smoke)",
            borderTopColor: "var(--color-electric-blue)",
            borderRadius: "50%",
            animation: "spin 0.7s linear infinite",
          }}
        />
        <span
          style={{
            fontSize: "13px",
            color: "var(--color-graphite)",
            fontWeight: 500,
          }}
        >
          Memuat SmartDoc...
        </span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (authErrorStatus) {
    return <ErrorScreen status={authErrorStatus} onRetry={authErrorStatus === 403 ? undefined : retryAuth} />;
  }

  // Belum auth dan bukan login page — jangan render sambil redirect
  if (!isAuthenticated) {
    return null;
  }
  if (!user?.onboarding_complete) return null;
  if ((user.role === "admin") !== adminArea) {
    return <ErrorScreen status={403} homeHref={getHomePath(user.role)} homeLabel="Ke halaman saya" />;
  }

  // Authenticated — render layout utama dengan Sidebar
  return (
    <div className="layout">
      <Sidebar />
      <main className="main-content">{children}</main>
    </div>
  );
}
