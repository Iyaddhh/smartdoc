"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from "lucide-react";

export type ToastType = "success" | "error" | "info" | "warning";

export interface ToastMessage {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration?: number;
}

type ToastListener = (toast: ToastMessage) => void;
const listeners: Set<ToastListener> = new Set();

let lastToastSignature = "";
let lastToastTime = 0;

export function showToast(type: ToastType, message: string, title?: string, duration = 3500) {
  const now = Date.now();
  const signature = `${type}:${title || ""}:${message}`;
  
  // Ignore duplicate identical toast fired within 1.5 seconds
  if (signature === lastToastSignature && now - lastToastTime < 1500) {
    return;
  }
  lastToastSignature = signature;
  lastToastTime = now;

  const id = Math.random().toString(36).substring(2, 9);
  const toast: ToastMessage = { id, type, message, title, duration };
  listeners.forEach((listener) => listener(toast));
}

export default function ToastContainer() {
  const [activeToast, setActiveToast] = useState<ToastMessage | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const handleToast = (newToast: ToastMessage) => {
      if (timer) clearTimeout(timer);
      setActiveToast(newToast);

      if (newToast.duration && newToast.duration > 0) {
        timer = setTimeout(() => {
          setActiveToast((current) => (current?.id === newToast.id ? null : current));
        }, newToast.duration);
      }
    };

    listeners.add(handleToast);
    return () => {
      listeners.delete(handleToast);
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Listen to ESC key to close modal toast
  useEffect(() => {
    if (!activeToast) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActiveToast(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeToast]);

  if (!activeToast) return null;

  const config = {
    success: {
      icon: <CheckCircle2 size={32} style={{ color: "#10b981" }} />,
      bgIcon: "#ecfdf5",
      borderIcon: "#a7f3d0",
      progressColor: "#10b981",
      defaultTitle: "Berhasil",
      btnClass: "btn-primary",
    },
    error: {
      icon: <XCircle size={32} style={{ color: "#ef4444" }} />,
      bgIcon: "#fef2f2",
      borderIcon: "#fecaca",
      progressColor: "#ef4444",
      defaultTitle: "Terjadi Kendala",
      btnClass: "btn-primary",
    },
    info: {
      icon: <Info size={32} style={{ color: "#0284c7" }} />,
      bgIcon: "#f0f9ff",
      borderIcon: "#bae6fd",
      progressColor: "#0284c7",
      defaultTitle: "Informasi",
      btnClass: "btn-primary",
    },
    warning: {
      icon: <AlertTriangle size={32} style={{ color: "#d97706" }} />,
      bgIcon: "#fffbeb",
      borderIcon: "#fde68a",
      progressColor: "#d97706",
      defaultTitle: "Pemberitahuan",
      btnClass: "btn-primary",
    },
  };

  const activeConfig = config[activeToast.type];
  const durationMs = activeToast.duration || 3500;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(12, 10, 9, 0.45)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        zIndex: 999999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        animation: "fadeIn 0.18s ease-out",
      }}
      onClick={() => setActiveToast(null)}
    >
      <style>{`
        @keyframes toastProgressCountdown {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>

      <div
        className="card"
        style={{
          background: "var(--color-pure-white)",
          border: "1px solid var(--color-stone-border)",
          borderRadius: "18px",
          padding: "28px 24px 26px",
          width: "100%",
          maxWidth: "400px",
          boxShadow: "0 24px 48px -12px rgba(0, 0, 0, 0.28)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          position: "relative",
          animation: "scaleUp 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards",
          gap: "16px",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Right Close Button */}
        <button
          onClick={() => setActiveToast(null)}
          aria-label="Tutup notifikasi"
          style={{
            position: "absolute",
            top: "14px",
            right: "14px",
            background: "transparent",
            border: "none",
            color: "var(--color-ash-gray)",
            cursor: "pointer",
            padding: "6px",
            borderRadius: "8px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.15s ease",
            zIndex: 2,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--color-ink-black)";
            e.currentTarget.style.background = "var(--color-stone-canvas)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--color-ash-gray)";
            e.currentTarget.style.background = "transparent";
          }}
        >
          <X size={18} />
        </button>

        {/* Large Centered Status Icon Badge */}
        <div
          style={{
            width: "64px",
            height: "64px",
            borderRadius: "20px",
            background: activeConfig.bgIcon,
            border: `1px solid ${activeConfig.borderIcon}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 8px 20px -4px rgba(0,0,0,0.06)",
            marginTop: "4px",
          }}
        >
          {activeConfig.icon}
        </div>

        {/* Title & Message */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <h3
            style={{
              fontSize: "17.5px",
              fontWeight: 700,
              color: "var(--color-ink-black)",
              margin: 0,
              letterSpacing: "-0.2px",
            }}
          >
            {activeToast.title || activeConfig.defaultTitle}
          </h3>
          <p
            style={{
              fontSize: "13.5px",
              color: "var(--color-warm-gray)",
              lineHeight: 1.5,
              margin: 0,
              padding: "0 8px",
            }}
          >
            {activeToast.message}
          </p>
        </div>

        {/* Action Button */}
        <div style={{ width: "100%", marginTop: "4px", marginBottom: "4px" }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setActiveToast(null)}
            style={{
              width: "100%",
              padding: "10px 20px",
              fontSize: "13.5px",
              fontWeight: 600,
              borderRadius: "10px",
            }}
          >
            Mengerti
          </button>
        </div>

        {/* Animated Progress Bar at the Bottom Edge */}
        {durationMs > 0 && (
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: "4px",
              background: "var(--color-stone-canvas)",
              overflow: "hidden",
            }}
          >
            <div
              key={activeToast.id}
              style={{
                height: "100%",
                background: activeConfig.progressColor,
                animation: `toastProgressCountdown ${durationMs}ms linear forwards`,
                borderRadius: "0 2px 2px 0",
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
