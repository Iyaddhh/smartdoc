"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { JobStatus } from "@/lib/api";
import { Loader2, Timer, Sparkles, XCircle, RefreshCw, FileOutput } from "lucide-react";

interface ProcessingModalProps {
  isOpen: boolean;
  title?: string;
  subtitle?: string;
  filename?: string;
  targetFormat?: string;
  job: JobStatus | null;
  isPolling: boolean;
  error?: string | null;
  elapsedSeconds?: number;
  onRetry?: () => void;
  onClose?: () => void;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function getProgressDetail(status: string, progress: number): string {
  if (status === "done") return "Proses berhasil diselesaikan!";
  if (status === "failed") return "Terjadi kendala saat memproses dokumen";
  if (progress <= 15) return "Membaca & memvalidasi file...";
  if (progress <= 40) return "Menganalisis konten & struktur berkas...";
  if (progress <= 75) return "Mengeksekusi konversi & transformasi data...";
  if (progress <= 95) return "Menyusun output & finalisasi berkas...";
  return "Menyelesaikan proses...";
}

export default function ProcessingModal({
  isOpen,
  title = "Sedang Mengonversi Dokumen",
  subtitle = "Mohon tunggu sebentar, sistem sedang memproses berkas Anda.",
  filename,
  targetFormat,
  job,
  isPolling,
  error,
  elapsedSeconds = 0,
  onRetry,
  onClose,
}: ProcessingModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!mounted || !isOpen) return null;

  const status = error ? "failed" : (job?.status ?? (isPolling ? "processing" : "pending"));

  let progress = 0;
  if (status === "done") {
    progress = 100;
  } else if (status === "failed") {
    progress = job?.progress || 0;
  } else if (isPolling || status === "processing") {
    const estimatedProgress = Math.min(20 + elapsedSeconds * 14, 95);
    progress = Math.max(job?.progress || 0, estimatedProgress);
  }

  const detailText = getProgressDetail(status, progress);

  const modalContent = (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: "100vw",
        height: "100vh",
        backgroundColor: "rgba(12, 10, 9, 0.45)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 99999,
        padding: "20px",
        boxSizing: "border-box",
        animation: "fadeIn 0.2s ease-out",
      }}
    >
      <div
        className="card animate-fade-in"
        style={{
          width: "100%",
          maxWidth: "460px",
          background: "var(--color-pure-white)",
          borderRadius: "16px",
          padding: "28px 24px",
          boxShadow: "0 24px 48px -12px rgba(12, 10, 9, 0.25), 0 0 0 1px rgba(0,0,0,0.06)",
          display: "flex",
          flexDirection: "column",
          gap: "20px",
          position: "relative",
        }}
      >
        {/* Top Header Icon & Title */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "12px",
              background: status === "failed" ? "var(--clr-error-bg)" : "var(--color-sky-wash)",
              color: status === "failed" ? "var(--clr-error)" : "var(--color-cyan-edge)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {status === "failed" ? (
              <XCircle size={24} />
            ) : (
              <Loader2 size={24} className="animate-spin" />
            )}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <h3
              style={{
                fontSize: "16px",
                fontWeight: 600,
                color: "var(--color-ink-black)",
                marginBottom: "4px",
              }}
            >
              {status === "failed" ? "Konversi Terkendala" : title}
            </h3>
            <p
              style={{
                fontSize: "12.5px",
                color: "var(--color-warm-gray)",
                lineHeight: 1.4,
              }}
            >
              {status === "failed" ? "Gagal menyelesaikan proses konversi dokumen." : subtitle}
            </p>
          </div>
        </div>

        {/* File Info Box */}
        {(filename || targetFormat) && (
          <div
            style={{
              background: "var(--color-stone-canvas)",
              border: "1px solid var(--color-stone-border)",
              borderRadius: "10px",
              padding: "12px 14px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "10px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
              <FileOutput size={16} style={{ color: "var(--color-warm-gray)", flexShrink: 0 }} />
              <span
                style={{
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "var(--color-ink-black)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {filename || "Dokumen"}
              </span>
            </div>

            {targetFormat && (
              <span className="badge badge-neutral" style={{ flexShrink: 0, fontSize: "11px", fontWeight: 600 }}>
                Ke {targetFormat.toUpperCase()}
              </span>
            )}
          </div>
        )}

        {/* Progress & Status Section */}
        {status !== "failed" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {/* Progress Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span
                style={{
                  fontSize: "12.5px",
                  color: "var(--color-warm-gray)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                }}
              >
                <Timer size={13} />
                Berjalan: <strong>{formatDuration(elapsedSeconds)}</strong>
              </span>

              <span
                style={{
                  fontSize: "13px",
                  fontWeight: 700,
                  color: "var(--color-cyan-edge)",
                }}
              >
                {Math.round(progress)}%
              </span>
            </div>

            {/* Progress Bar */}
            <div className="progress-bar-track" style={{ height: "7px", borderRadius: "999px" }}>
              <div
                className="progress-bar-fill"
                style={{
                  width: `${progress}%`,
                  background: "var(--color-cyan-signal)",
                  transition: "width 0.4s ease",
                  borderRadius: "999px",
                }}
              />
            </div>

            {/* Dynamic Step Detail */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "2px" }}>
              <Sparkles size={13} style={{ color: "var(--color-cyan-edge)", flexShrink: 0 }} />
              <span style={{ fontSize: "12.5px", color: "var(--color-warm-gray)" }}>
                {detailText}
              </span>
            </div>
          </div>
        ) : (
          /* Error Box */
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div className="alert alert-error" style={{ fontSize: "12.5px" }}>
              {error || "Terjadi kesalahan saat memproses konversi dokumen."}
            </div>

            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "4px" }}>
              {onClose && (
                <button className="btn btn-secondary btn-sm" onClick={onClose}>
                  Tutup
                </button>
              )}
              {onRetry && (
                <button className="btn btn-primary btn-sm" onClick={onRetry}>
                  <RefreshCw size={13} /> Coba Lagi
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
