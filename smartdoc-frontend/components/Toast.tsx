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

export function showToast(type: ToastType, message: string, title?: string, duration = 4000) {
  const id = Math.random().toString(36).substring(2, 9);
  const toast: ToastMessage = { id, type, message, title, duration };
  listeners.forEach((listener) => listener(toast));
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const handleToast = (newToast: ToastMessage) => {
      setToasts((prev) => [...prev, newToast]);

      if (newToast.duration) {
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== newToast.id));
        }, newToast.duration);
      }
    };

    listeners.add(handleToast);
    return () => {
      listeners.delete(handleToast);
    };
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: "20px",
        right: "20px",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        maxWidth: "380px",
        width: "calc(100vw - 32px)",
        pointerEvents: "none",
      }}
    >
      {toasts.map((t) => {
        const icons = {
          success: <CheckCircle2 size={18} style={{ color: "var(--clr-success)", flexShrink: 0 }} />,
          error: <XCircle size={18} style={{ color: "var(--clr-error)", flexShrink: 0 }} />,
          info: <Info size={18} style={{ color: "var(--color-cyan-edge)", flexShrink: 0 }} />,
          warning: <AlertTriangle size={18} style={{ color: "var(--clr-accent-amber, #f59e0b)", flexShrink: 0 }} />,
        };

        const borderColors = {
          success: "var(--clr-success-border)",
          error: "var(--clr-error-border)",
          info: "var(--clr-info-border)",
          warning: "#fde68a",
        };

        return (
          <div
            key={t.id}
            className="animate-fade-in"
            style={{
              pointerEvents: "auto",
              background: "var(--color-pure-white)",
              border: `1px solid ${borderColors[t.type] || "var(--color-stone-border)"}`,
              borderRadius: "var(--radius-cards)",
              padding: "12px 16px",
              boxShadow: "var(--shadow-md)",
              display: "flex",
              alignItems: "flex-start",
              gap: "12px",
            }}
          >
            {icons[t.type]}
            <div style={{ flex: 1, minWidth: 0 }}>
              {t.title && (
                <p style={{ fontWeight: 600, fontSize: "13.5px", color: "var(--color-ink-black)", marginBottom: "2px" }}>
                  {t.title}
                </p>
              )}
              <p style={{ fontSize: "13px", color: "var(--color-warm-gray)", lineHeight: 1.45 }}>
                {t.message}
              </p>
            </div>
            <button
              onClick={() => removeToast(t.id)}
              style={{
                color: "var(--color-ash-gray)",
                cursor: "pointer",
                padding: "2px",
                display: "flex",
                alignItems: "center",
              }}
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
