"use client";

import { useState } from "react";
import Link from "next/link";
import FileUpload from "@/components/FileUpload";
import JobProgressCard from "@/components/JobProgressCard";
import { useJobPolling } from "@/lib/useJobPolling";
import { watermarkDocument, getDownloadUrl, JobStatus } from "@/lib/api";
import { showToast } from "@/components/Toast";
import {
  ShieldCheck,
  Download,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Lock,
  Eye,
  EyeOff,
  Type,
} from "lucide-react";

const PRESET_TEXTS = ["RAHASIA", "CONFIDENTIAL", "DRAFT", "SALINAN RESMI", "SAMPLE"];

const COLOR_OPTIONS = [
  { label: "Slate Gray", hex: "#64748b" },
  { label: "Crimson Red", hex: "#ef4444" },
  { label: "Sky Blue", hex: "#0284c7" },
  { label: "Forest Green", hex: "#059669" },
];

export default function WatermarkPage() {
  const [file, setFile] = useState<File | null>(null);

  // Watermark Settings
  const [watermarkText, setWatermarkText] = useState("CONFIDENTIAL");
  const [opacity, setOpacity] = useState(0.25);
  const [angle, setAngle] = useState(45);
  const [fontSize, setFontSize] = useState(44);
  const [colorHex, setColorHex] = useState("#64748b");

  // Security / Password Settings
  const [enablePassword, setEnablePassword] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Job status
  const [jobId, setJobId] = useState<string | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [doneJob, setDoneJob] = useState<JobStatus | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { job, isPolling, error: pollError, elapsedSeconds } = useJobPolling(jobId, {
    onDone: (j) => {
      setDoneJob(j);
      showToast("success", "Watermark & keamanan dokumen berhasil diterapkan!", "Proses Selesai");
    },
    onFailed: (j) => {
      showToast("error", j.error || "Proses watermark/keamanan gagal.", "Gagal Memproses");
    },
  });

  const isDone = doneJob?.status === "done";

  const handleFileSelect = (f: File) => {
    setFile(f);
    setJobId(null);
    setDocumentId(null);
    setDoneJob(null);
    setSubmitError(null);
  };

  const handleProcess = async () => {
    if (!file) {
      showToast("warning", "Pilih berkas PDF atau Word terlebih dahulu.", "Peringatan");
      return;
    }

    if (!watermarkText.trim() && (!enablePassword || !password.trim())) {
      setSubmitError("Harap isi teks watermark atau aktifkan kata sandi penguncian.");
      showToast("warning", "Isi teks watermark atau password.", "Validasi");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setDoneJob(null);

    const res = await watermarkDocument({
      file,
      watermarkText: watermarkText.trim() || undefined,
      opacity,
      angle,
      fontSize,
      colorHex,
      password: enablePassword && password.trim() ? password.trim() : undefined,
    });

    setIsSubmitting(false);

    if (!res.success || !res.data) {
      const err = res.error || "Gagal memulai proses watermark/proteksi berkas";
      setSubmitError(err);
      showToast("error", err, "Gagal Memproses");
      return;
    }

    setJobId(res.data.job_id);
    setDocumentId(res.data.document_id);
    showToast("info", "Sedang menerapkan watermark & proteksi berkas...", "Diproses");
  };

  const handleReset = () => {
    setFile(null);
    setJobId(null);
    setDocumentId(null);
    setDoneJob(null);
    setSubmitError(null);
    setPassword("");
    setEnablePassword(false);
  };

  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
      {/* Header */}
      <div className="page-header">
        <h2>
          Watermark & <span className="highlight-span">Proteksi Dokumen</span>
        </h2>
        <p>Beri cap air visual kustom dan amankan berkas PDF Anda dengan enkripsi kata sandi kuat.</p>
      </div>

      <div className="grid-2" style={{ alignItems: "start" }}>
        {/* Left Column: Configuration Controls */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Step 1: Upload */}
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <h3 style={{ fontSize: "15px", fontWeight: 600, color: "var(--color-ink-black)" }}>
              1. Unggah Berkas
            </h3>
            <FileUpload
              accept=".pdf,.docx"
              maxSizeMB={50}
              onFileSelected={handleFileSelect}
              disabled={isSubmitting || !!jobId}
            />
          </div>

          {/* Step 2: Watermark Options */}
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Type size={16} style={{ color: "var(--color-cyan-edge)" }} />
              <h3 style={{ fontSize: "15px", fontWeight: 600, color: "var(--color-ink-black)" }}>
                2. Pengaturan Cap Air (Watermark)
              </h3>
            </div>

            {/* Watermark Text Input */}
            <div>
              <label style={{ fontSize: "12px", fontWeight: 500, display: "block", marginBottom: "4px", color: "var(--color-ink-black)" }}>
                Teks Watermark:
              </label>
              <input
                className="input"
                value={watermarkText}
                onChange={(e) => setWatermarkText(e.target.value)}
                disabled={!!jobId}
                placeholder="cth: CONFIDENTIAL / RAHASIA"
                style={{ fontSize: "13px" }}
              />
              {/* Presets */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" }}>
                {PRESET_TEXTS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => !jobId && setWatermarkText(t)}
                    disabled={!!jobId}
                    style={{
                      fontSize: "11px",
                      padding: "2px 8px",
                      borderRadius: "var(--radius-tags)",
                      background: watermarkText === t ? "var(--color-ink-black)" : "var(--color-stone-canvas)",
                      color: watermarkText === t ? "var(--color-pure-white)" : "var(--color-warm-gray)",
                      border: "1px solid var(--color-stone-border)",
                      cursor: jobId ? "default" : "pointer",
                      transition: "var(--transition-fast)",
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Opacity Slider */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <label style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-ink-black)" }}>
                  Transparansi (Opasitas):
                </label>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--color-cyan-edge)" }}>
                  {Math.round(opacity * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0.1}
                max={0.8}
                step={0.05}
                value={opacity}
                onChange={(e) => setOpacity(parseFloat(e.target.value))}
                disabled={!!jobId}
                style={{ width: "100%", accentColor: "var(--color-cyan-edge)" }}
              />
            </div>

            {/* Angle & Color Selection */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              {/* Angle */}
              <div>
                <label style={{ fontSize: "12px", fontWeight: 500, display: "block", marginBottom: "4px", color: "var(--color-ink-black)" }}>
                  Sudut Rotasi:
                </label>
                <div style={{ display: "flex", gap: "6px" }}>
                  {[
                    { label: "45°", val: 45 },
                    { label: "0°", val: 0 },
                    { label: "-45°", val: -45 },
                  ].map((item) => (
                    <button
                      key={item.val}
                      type="button"
                      onClick={() => !jobId && setAngle(item.val)}
                      disabled={!!jobId}
                      style={{
                        flex: 1,
                        padding: "4px",
                        fontSize: "12px",
                        fontWeight: angle === item.val ? 600 : 400,
                        background: angle === item.val ? "var(--color-ink-black)" : "var(--color-stone-canvas)",
                        color: angle === item.val ? "var(--color-pure-white)" : "var(--color-ink-black)",
                        border: "1px solid var(--color-stone-border)",
                        borderRadius: "var(--radius-inputs)",
                        cursor: jobId ? "default" : "pointer",
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Color Selection */}
              <div>
                <label style={{ fontSize: "12px", fontWeight: 500, display: "block", marginBottom: "4px", color: "var(--color-ink-black)" }}>
                  Warna Cap:
                </label>
                <div style={{ display: "flex", gap: "8px", alignItems: "center", height: "30px" }}>
                  {COLOR_OPTIONS.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => !jobId && setColorHex(c.hex)}
                      disabled={!!jobId}
                      title={c.label}
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: "50%",
                        background: c.hex,
                        border: colorHex === c.hex ? "2px solid var(--color-ink-black)" : "1px solid rgba(0,0,0,0.15)",
                        transform: colorHex === c.hex ? "scale(1.15)" : "scale(1)",
                        cursor: jobId ? "default" : "pointer",
                        transition: "var(--transition-fast)",
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Step 3: Password Security */}
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Lock size={16} style={{ color: "var(--clr-success)" }} />
                <h3 style={{ fontSize: "15px", fontWeight: 600, color: "var(--color-ink-black)" }}>
                  3. Proteksi Kata Sandi (Opsional)
                </h3>
              </div>
              <input
                type="checkbox"
                checked={enablePassword}
                onChange={(e) => setEnablePassword(e.target.checked)}
                disabled={!!jobId}
                style={{ width: 16, height: 16, cursor: "pointer", accentColor: "var(--color-cyan-edge)" }}
              />
            </div>

            {enablePassword && (
              <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-ink-black)" }}>
                  Kata Sandi Pembuka PDF:
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    type={showPassword ? "text" : "password"}
                    className="input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={!!jobId}
                    placeholder="Masukkan password kuat..."
                    style={{ fontSize: "13px", paddingRight: "36px" }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: "absolute",
                      right: "8px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "var(--color-ash-gray)",
                      padding: "4px",
                    }}
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                <span style={{ fontSize: "11px", color: "var(--color-ash-gray)" }}>
                  Dokumen akan dienkripsi dengan standar AES-128 bit.
                </span>
              </div>
            )}
          </div>

          {submitError && (
            <div className="alert alert-error animate-fade-in">
              <AlertCircle size={15} style={{ flexShrink: 0 }} />
              <span>{submitError}</span>
            </div>
          )}

          {/* Action Button */}
          {!jobId && (
            <button
              className="btn btn-primary btn-lg"
              onClick={handleProcess}
              disabled={isSubmitting || !file}
              style={{ width: "100%" }}
            >
              {isSubmitting ? (
                <>
                  <span className="animate-spin">⟳</span> Menyiapkan Berkas...
                </>
              ) : (
                <>
                  <ShieldCheck size={16} /> Terapkan Watermark & Keamanan
                </>
              )}
            </button>
          )}
        </div>

        {/* Right Column: Interactive Real-time Watermark Preview */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {jobId ? (
            <>
              <JobProgressCard
                job={job}
                isPolling={isPolling}
                error={pollError || submitError}
                elapsedSeconds={elapsedSeconds}
                onRetry={handleProcess}
              />

              {isDone && documentId && (
                <div className="result-panel animate-fade-in">
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div className="stat-icon green" style={{ width: 44, height: 44, borderRadius: "50%" }}>
                      <CheckCircle2 size={22} style={{ color: "var(--clr-success)" }} />
                    </div>
                    <div>
                      <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--color-ink-black)" }}>
                        Dokumen Berhasil Diamankan!
                      </h3>
                      <p style={{ fontSize: "13px", color: "var(--color-warm-gray)" }}>
                        {enablePassword && password
                          ? "Watermark dan enkripsi kata sandi telah diterapkan."
                          : "Cap air visual telah disematkan ke seluruh halaman dokumen."}
                      </p>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "4px" }}>
                    <a href={getDownloadUrl(documentId)} download style={{ flex: "1 1 auto" }}>
                      <button className="btn btn-primary btn-lg" style={{ width: "100%" }}>
                        <Download size={16} /> Unduh Berkas Terproteksi
                      </button>
                    </a>
                    <button className="btn btn-secondary btn-lg" onClick={handleReset} style={{ flex: "1 1 auto" }}>
                      <RotateCcw size={15} /> Proses Dokumen Lain
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Live Interactive Canvas Mock Preview */
            <div className="card" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Eye size={16} style={{ color: "var(--color-cyan-edge)" }} />
                  <h3 style={{ fontSize: "15px", fontWeight: 600, color: "var(--color-ink-black)" }}>
                    Pratinjau Langsung (Live Visual Preview)
                  </h3>
                </div>
                {enablePassword && (
                  <span className="badge badge-done" style={{ fontSize: "11px", gap: "4px" }}>
                    <Lock size={11} /> Terkunci Password
                  </span>
                )}
              </div>

              {/* Realistic Document Canvas */}
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  height: "360px",
                  background: "#ffffff",
                  border: "1px solid var(--color-stone-border)",
                  borderRadius: "var(--radius-cards)",
                  boxShadow: "var(--shadow-md)",
                  display: "flex",
                  flexDirection: "column",
                  padding: "24px 28px",
                  overflow: "hidden",
                  userSelect: "none",
                }}
              >
                {/* Simulated Document Lines */}
                <div style={{ width: "40%", height: "10px", background: "#e2e8f0", borderRadius: "4px", marginBottom: "16px" }} />
                <div style={{ width: "100%", height: "6px", background: "#f1f5f9", borderRadius: "3px", marginBottom: "8px" }} />
                <div style={{ width: "92%", height: "6px", background: "#f1f5f9", borderRadius: "3px", marginBottom: "8px" }} />
                <div style={{ width: "96%", height: "6px", background: "#f1f5f9", borderRadius: "3px", marginBottom: "8px" }} />
                <div style={{ width: "75%", height: "6px", background: "#f1f5f9", borderRadius: "3px", marginBottom: "20px" }} />

                <div style={{ width: "100%", height: "60px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "6px", marginBottom: "20px" }} />

                <div style={{ width: "95%", height: "6px", background: "#f1f5f9", borderRadius: "3px", marginBottom: "8px" }} />
                <div style={{ width: "88%", height: "6px", background: "#f1f5f9", borderRadius: "3px", marginBottom: "8px" }} />
                <div style={{ width: "60%", height: "6px", background: "#f1f5f9", borderRadius: "3px" }} />

                {/* Overlaid Dynamic Watermark */}
                {watermarkText.trim() && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      pointerEvents: "none",
                    }}
                  >
                    <span
                      style={{
                        fontSize: `${Math.max(18, Math.min(36, fontSize * 0.7))}px`,
                        fontWeight: 800,
                        color: colorHex,
                        opacity: opacity,
                        transform: `rotate(${angle}deg)`,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        whiteSpace: "nowrap",
                        transition: "all 0.15s ease",
                      }}
                    >
                      {watermarkText}
                    </span>
                  </div>
                )}
              </div>

              <div style={{ borderTop: "1px solid var(--color-stone-border)", paddingTop: "12px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12.5px" }}>
                <span style={{ color: "var(--color-ash-gray)" }}>Hasil disimpan otomatis</span>
                <Link href="/riwayat-dokumen" style={{ color: "var(--color-cyan-edge)", fontWeight: 500 }}>
                  Lihat Riwayat Dokumen →
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
