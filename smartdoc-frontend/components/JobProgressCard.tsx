"use client";

import { JobStatus } from "@/lib/api";
import { Loader2, CheckCircle2, XCircle, Clock, Timer, Sparkles, RefreshCw } from "lucide-react";

interface JobProgressCardProps {
  job: JobStatus | null;
  isPolling: boolean;
  error: string | null;
  elapsedSeconds?: number;
  onRetry?: () => void;
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
  if (progress <= 75) return "Mengeksekusi transformasi data...";
  if (progress <= 95) return "Menyimpan output & optimasi akhir...";
  return "Menyelesaikan proses...";
}

export default function JobProgressCard({
  job,
  isPolling,
  error,
  elapsedSeconds = 0,
  onRetry,
}: JobProgressCardProps) {
  if (!job && !isPolling && !error) return null;

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

  const labels: Record<string, string> = {
    pending: "Menyiapkan antrian",
    processing: "Sedang diproses",
    done: "Selesai",
    failed: "Proses Gagal",
  };

  const icons = {
    pending: <Clock size={14} className="animate-pulse" />,
    processing: <Loader2 size={14} className="animate-spin" />,
    done: <CheckCircle2 size={14} />,
    failed: <XCircle size={14} />,
  };

  const badgeClass = `badge badge-${status}`;
  const detailText = getProgressDetail(status, progress);

  return (
    <div
      className="card animate-fade-in"
      style={{
        marginTop: "16px",
        padding: "18px 20px",
        border: status === "failed" ? "1px solid var(--clr-error-border)" : undefined,
      }}
    >
      {/* Header Status & Elapsed Timer */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span className={badgeClass}>
            {icons[status as keyof typeof icons]}
            {labels[status] || status}
          </span>
          {isPolling && (
            <span style={{ fontSize: "12px", color: "var(--color-warm-gray)", display: "inline-flex", alignItems: "center", gap: "4px" }}>
              <Timer size={13} />
              {formatDuration(elapsedSeconds)}
            </span>
          )}
        </div>

        <span
          style={{
            fontSize: "13px",
            fontWeight: 600,
            color: status === "done" ? "var(--clr-success)" : status === "failed" ? "var(--clr-error)" : "var(--color-ink-black)",
          }}
        >
          {status === "done" ? "100%" : `${Math.round(progress)}%`}
        </span>
      </div>

      {/* Progress Bar */}
      <div className="progress-bar-track" style={{ height: "6px" }}>
        <div
          className="progress-bar-fill"
          style={{
            width: `${status === "done" ? 100 : progress}%`,
            background: status === "done"
              ? "var(--clr-success)"
              : status === "failed"
              ? "var(--clr-error)"
              : "var(--color-cyan-signal)",
          }}
        />
      </div>

      {/* Step Description */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "10px" }}>
        <p style={{ fontSize: "13px", color: "var(--color-warm-gray)", display: "flex", alignItems: "center", gap: "6px" }}>
          {isPolling && <Sparkles size={13} style={{ color: "var(--color-cyan-edge)" }} />}
          {detailText}
        </p>

        {status === "done" && elapsedSeconds > 0 && (
          <span style={{ fontSize: "12px", color: "var(--color-ash-gray)" }}>
            Selesai dalam {elapsedSeconds} detik
          </span>
        )}
      </div>

      {/* Error display with optional retry */}
      {error && (
        <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <div className="alert alert-error">
            <XCircle size={15} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>

          {onRetry && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={onRetry}
              style={{ alignSelf: "flex-start", marginTop: "4px" }}
            >
              <RefreshCw size={13} /> Coba Ulangi Proses
            </button>
          )}
        </div>
      )}
    </div>
  );
}
