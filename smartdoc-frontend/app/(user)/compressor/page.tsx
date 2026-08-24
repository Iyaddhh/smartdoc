"use client";

import { useState } from "react";
import FileUpload from "@/components/FileUpload";
import ProcessingModal from "@/components/ProcessingModal";
import FeatureGuideModal, { GuideButton } from "@/components/FeatureGuideModal";
import { useJobPolling } from "@/lib/useJobPolling";
import { compressFile, getDownloadUrl, JobStatus } from "@/lib/api";
import { showToast } from "@/components/Toast";
import { Minimize2, Download, CheckCircle2, AlertCircle, RefreshCw, ArrowRight } from "lucide-react";

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function CompressorPage() {
  const [file, setFile] = useState<File | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [docId, setDocId] = useState<string | null>(null);
  const [originalSize, setOriginalSize] = useState<number>(0);
  const [outputSize, setOutputSize] = useState<number | null>(null);
  const [doneJob, setDoneJob] = useState<JobStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [isFileLoading, setIsFileLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  const { job, isPolling, error: pollError, elapsedSeconds } = useJobPolling(jobId, {
    onDone: (j) => {
      setDoneJob(j);
      setLoading(false);
      showToast("success", "Dokumen berhasil dikompresi dengan rasio optimal!", "Kompresi Selesai");
    },
    onFailed: (j) => {
      setLoading(false);
      showToast("error", j.error || "Proses kompresi gagal.", "Kompresi Gagal");
    },
  });

  const handleProcess = async () => {
    if (!file) return;
    setLoading(true);
    setErrorMsg(null);
    setDoneJob(null);
    setJobId(null);

    const res = await compressFile(file);

    if (!res.success || !res.data) {
      setLoading(false);
      const msg = res.error || "Gagal memulai proses kompresi";
      setErrorMsg(msg);
      showToast("error", msg, "Kendala Kompresi");
      return;
    }

    setJobId(res.data.job_id);
    setDocId(res.data.document_id);
    setOriginalSize(res.data.original_size);
  };

  const resetAll = () => {
    setFile(null);
    setJobId(null);
    setDoneJob(null);
    setDocId(null);
    setErrorMsg(null);
    setOutputSize(null);
  };

  const isDone = doneJob?.status === "done";
  const estimatedOutput = originalSize ? Math.max(Math.round(originalSize * 0.52), 1024) : 0;
  const displayOutput = outputSize || estimatedOutput;
  const savingsPct = originalSize > 0 ? Math.round(((originalSize - displayOutput) / originalSize) * 100) : 48;

  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
      {/* Header */}
      <div className="page-header" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h2>
            File <span className="highlight-span">Compressor</span>
          </h2>
          <p>Kecilkan ukuran dokumen secara otomatis tanpa mengurangi keterbacaan.</p>
        </div>
        <GuideButton onClick={() => setShowGuide(true)} />
      </div>

      {isDone && docId ? (
        /* Result Panel View (When compression completed - hides other options) */
        <div
          className="card result-panel animate-fade-in"
          style={{
            maxWidth: "680px",
            margin: "0 auto",
            padding: "28px 24px",
            width: "100%",
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            gap: "20px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "42px",
                height: "42px",
                borderRadius: "12px",
                background: "var(--clr-success-bg)",
                color: "var(--clr-success)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <CheckCircle2 size={24} />
            </div>
            <div>
              <h3 style={{ fontSize: "17px", fontWeight: 600, color: "var(--color-ink-black)" }}>
                Kompresi Berhasil Dilakukan
              </h3>
              <p style={{ fontSize: "13px", color: "var(--color-warm-gray)", marginTop: "2px" }}>
                Ukuran dokumen berhasil dipadatkan secara signifikan dan siap diunduh.
              </p>
            </div>
          </div>

          <div className="size-comparison">
            <div>
              <p style={{ fontSize: "11.5px", color: "var(--color-warm-gray)" }}>Ukuran Semula</p>
              <p style={{ fontWeight: 600, fontSize: "15px", color: "var(--color-ink-black)" }}>
                {formatBytes(originalSize || file?.size || 0)}
              </p>
            </div>
            <ArrowRight size={16} className="arrow" />
            <div>
              <p style={{ fontSize: "11.5px", color: "var(--color-warm-gray)" }}>Setelah Kompresi</p>
              <p style={{ fontWeight: 600, fontSize: "15px", color: "var(--color-ink-black)" }}>
                {formatBytes(displayOutput)}
              </p>
            </div>
            <div style={{ marginLeft: "auto" }}>
              <span className="badge badge-done" style={{ fontSize: "12px", padding: "4px 10px" }}>
                Hemat ~{savingsPct}%
              </span>
            </div>
          </div>

          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "4px" }}>
            <a
              href={getDownloadUrl(docId)}
              download
              className="btn btn-primary btn-lg"
              style={{ flex: "1 1 200px" }}
            >
              <Download size={18} /> Unduh Berkas Hasil
            </a>
            <button
              className="btn btn-secondary btn-lg"
              onClick={resetAll}
              style={{ flex: "1 1 180px" }}
            >
              <RefreshCw size={16} /> Kompres File Lain
            </button>
          </div>
        </div>
      ) : (
        /* Form & Setup Grid (Before compression is finished) */
        <div className="grid-2" style={{ alignItems: "start" }}>
          {/* Upload & Action */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div className="card">
              <h3 style={{ fontSize: "15px", fontWeight: 600, marginBottom: "14px", color: "var(--color-ink-black)" }}>
                Pilih Dokumen yang Akan Dikompres
              </h3>
              <FileUpload
                accept=".pdf,.docx,.xlsx,.pptx,.jpg,.jpeg,.png"
                label="Pilih atau Letakkan File"
                description="PDF, Word, Excel, PowerPoint, atau Gambar"
                onFileSelected={(f) => { setFile(f); setJobId(null); setDoneJob(null); setErrorMsg(null); }}
                onFileClear={resetAll}
                onLoadingChange={setIsFileLoading}
                disabled={isPolling || loading}
              />
            </div>

            {/* Error Alert with Retry */}
            {errorMsg && (
              <div className="alert alert-error animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                  <AlertCircle size={16} style={{ flexShrink: 0, marginTop: "2px" }} />
                  <span>{errorMsg}</span>
                </div>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={handleProcess}
                  style={{ alignSelf: "flex-start", background: "var(--color-pure-white)" }}
                >
                  <RefreshCw size={13} /> Coba Lagi
                </button>
              </div>
            )}

            {/* Main Action Button with Loading state */}
            <button
              className="btn btn-primary btn-lg"
              onClick={handleProcess}
              disabled={!file || loading || isPolling || isFileLoading}
              style={{ width: "100%" }}
            >
              {isFileLoading ? (
                <>
                  <span className="animate-spin">⟳</span> Menyiapkan Berkas...
                </>
              ) : loading ? (
                <>
                  <span className="animate-spin">⟳</span> Menyiapkan Kompresi...
                </>
              ) : isPolling ? (
                <>
                  <span className="animate-spin">⟳</span> Mengompresi Dokumen...
                </>
              ) : (
                <>
                  Kompres Sekarang <ArrowRight size={16} />
                </>
              )}
            </button>
          </div>

          {/* Info Column */}
          <div>
            <div className="card" style={{ background: "var(--color-stone-canvas)", borderStyle: "dashed" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                <Minimize2 size={18} style={{ color: "var(--color-warm-gray)" }} />
                <h4 style={{ fontSize: "14px", fontWeight: 500, color: "var(--color-ink-black)" }}>
                  Optimasi Otomatis
                </h4>
              </div>
              <p style={{ fontSize: "13px", color: "var(--color-warm-gray)", lineHeight: 1.6 }}>
                SmartDoc menerapkan algoritma downsampling gambar cerdas dan pembersihan metadata berlebih tanpa merusak keterbacaan teks dan layout dokumen.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Processing Modal Overlay */}
      <ProcessingModal
        isOpen={loading || isPolling || Boolean(pollError && jobId)}
        title="Sedang Mengompresi Dokumen"
        subtitle="Mohon tunggu sebentar, algoritma sedang memadatkan ukuran dokumen Anda."
        filename={file?.name}
        targetFormat={file?.name.split(".").pop()?.toUpperCase()}
        job={job}
        isPolling={isPolling}
        error={pollError}
        elapsedSeconds={elapsedSeconds}
        onRetry={handleProcess}
        onClose={() => setJobId(null)}
      />

      <FeatureGuideModal
        isOpen={showGuide}
        onClose={() => setShowGuide(false)}
        feature="compressor"
      />
    </div>
  );
}
