"use client";

import PageHeading from "@/components/ui/PageHeading";
import ToolStorage from "@/components/ToolStorage";

import DownloadLink from "@/components/DownloadLink";

import { useState } from "react";
import Link from "next/link";
import FileUpload from "@/components/FileUpload";
import ProcessingModal from "@/components/ProcessingModal";
import FeatureGuideModal, { GuideButton } from "@/components/FeatureGuideModal";
import { useJobPolling } from "@/hooks/useJobPolling";
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
  const [saveToWorkspace, setSaveToWorkspace] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  // Watermark Settings
  const [enableWatermark, setEnableWatermark] = useState(true);
  const [watermarkText, setWatermarkText] = useState("CONFIDENTIAL");
  const [opacity, setOpacity] = useState(0.25);
  const [angle, setAngle] = useState(45);
  const fontSize = 44;
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
  const [isFileLoading, setIsFileLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  const { job, isPolling, error: pollError, elapsedSeconds } = useJobPolling(jobId, {
    onDone: (j) => {
      setDoneJob(j);
      setIsSubmitting(false);
      showToast(
        "success",
        !enableWatermark && enablePassword
          ? "Dokumen berhasil dikunci dengan kata sandi!"
          : "Watermark & keamanan dokumen berhasil diterapkan!",
        "Proses Selesai"
      );
    },
    onFailed: (j) => {
      setIsSubmitting(false);
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

    const finalWatermarkText = enableWatermark ? watermarkText.trim() : "";
    if (!finalWatermarkText && (!enablePassword || !password)) {
      setSubmitError("Harap aktifkan teks watermark atau masukkan kata sandi penguncian.");
      showToast("warning", "Pilih minimal watermark atau kata sandi.", "Validasi");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setDoneJob(null);

    const res = await watermarkDocument({
      saveToWorkspace,
      file,
      watermarkText: finalWatermarkText || undefined,
      opacity,
      angle,
      fontSize,
      colorHex,
      password: enablePassword && password ? password : undefined,
    });

    if (!res.success || !res.data) {
      setIsSubmitting(false);
      const err = res.error || "Gagal memulai proses watermark/proteksi berkas";
      setSubmitError(err);
      showToast("error", err, "Gagal Memproses");
      return;
    }

    setJobId(res.data.job_id);
    setDocumentId(res.data.document_id);
  };

  const handleReset = () => {
    setFile(null);
    setJobId(null);
    setDocumentId(null);
    setDoneJob(null);
    setSubmitError(null);
    setPassword("");
    setEnablePassword(false);
    setEnableWatermark(true);
  };

  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
      {/* Header */}
      <div className="page-header" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
          <PageHeading title="Watermark & sandi" description="Tambahkan tanda air dan perlindungan kata sandi pada dokumen." />
          <GuideButton onClick={() => setShowGuide(true)} />
        </div>
      <ToolStorage value={saveToWorkspace} onChange={setSaveToWorkspace} disabled={Boolean(jobId)} documentId={documentId} done={isDone} />


      <div className="grid-2" style={{ alignItems: "start" }}>
        {/* Left Column: Configuration Controls */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Step 1: Upload */}
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <h3 style={{ fontSize: "15px", fontWeight: 500, color: "var(--color-midnight-ink)" }}>
              1. Unggah Berkas
            </h3>
            <FileUpload
              accept=".pdf,.docx"
              maxSizeMB={50}
              onFileSelected={handleFileSelect}
              onFileClear={handleReset}
              onLoadingChange={setIsFileLoading}
              disabled={isSubmitting || !!jobId}
            />
          </div>

          {/* Step 2: Watermark Options */}
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: "16px", opacity: isFileLoading ? 0.6 : 1 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Type size={16} style={{ color: "var(--color-electric-blue)" }} />
                <h3 style={{ fontSize: "15px", fontWeight: 500, color: "var(--color-midnight-ink)", margin: 0 }}>
                  2. Pengaturan Cap Air (Watermark)
                </h3>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                {isFileLoading && (
                  <span style={{ fontSize: "11.5px", color: "var(--color-electric-blue)", display: "flex", alignItems: "center", gap: "4px" }}>
                    <span className="animate-spin">⟳</span> Menyiapkan...
                  </span>
                )}
                <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", cursor: "pointer", color: "var(--color-midnight-ink)", fontWeight: 500 }}>
                  <input
                    type="checkbox"
                    checked={enableWatermark}
                    onChange={(e) => {
                      const val = e.target.checked;
                      setEnableWatermark(val);
                      if (!val && !enablePassword) {
                        setEnablePassword(true);
                      }
                    }}
                    disabled={!!jobId || isFileLoading}
                    style={{ width: 16, height: 16, cursor: "pointer", accentColor: "var(--color-electric-blue)" }}
                  />
                  <span>Gunakan Watermark</span>
                </label>
              </div>
            </div>

            {!enableWatermark ? (
              <div
                style={{
                  padding: "12px 14px",
                  background: "var(--color-canvas-white)",
                  border: "1px dashed var(--color-ash)",
                  borderRadius: "var(--radius-cards)",
                  fontSize: "12.5px",
                  color: "var(--color-graphite)",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <span>ℹ️</span>
                <span>Cap air dinonaktifkan. Berkas akan diproses murni tanpa teks watermark.</span>
              </div>
            ) : (
              <>
                {/* Watermark Text Input */}
                <div>
                  <label style={{ fontSize: "12px", fontWeight: 500, display: "block", marginBottom: "4px", color: "var(--color-midnight-ink)" }}>
                    Teks Watermark:
                  </label>
                  <input
                    className="input"
                    value={watermarkText}
                    maxLength={200}
                    onChange={(e) => setWatermarkText(e.target.value)}
                    disabled={!!jobId || isFileLoading}
                    placeholder="cth: CONFIDENTIAL / RAHASIA"
                    style={{ fontSize: "13px" }}
                  />
                  {/* Presets */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" }}>
                    {PRESET_TEXTS.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => !jobId && !isFileLoading && setWatermarkText(t)}
                        disabled={!!jobId || isFileLoading}
                        style={{
                          fontSize: "11px",
                          padding: "2px 8px",
                          borderRadius: "var(--radius-tags)",
                          background: watermarkText === t ? "var(--color-midnight-ink)" : "var(--color-canvas-white)",
                          color: watermarkText === t ? "var(--color-canvas-white)" : "var(--color-graphite)",
                          border: "1px solid var(--color-ash)",
                          cursor: (jobId || isFileLoading) ? "default" : "pointer",
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
                    <label style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-midnight-ink)" }}>
                      Transparansi (Opasitas):
                    </label>
                    <span style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-electric-blue)" }}>
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
                    disabled={!!jobId || isFileLoading}
                    style={{ width: "100%", accentColor: "var(--color-electric-blue)" }}
                  />
                </div>

                {/* Angle & Color Selection */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  {/* Angle */}
                  <div>
                    <label style={{ fontSize: "12px", fontWeight: 500, display: "block", marginBottom: "4px", color: "var(--color-midnight-ink)" }}>
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
                          onClick={() => !jobId && !isFileLoading && setAngle(item.val)}
                          disabled={!!jobId || isFileLoading}
                          style={{
                            flex: 1,
                            padding: "4px 8px",
                            fontSize: "12px",
                            fontWeight: 500,
                            borderRadius: "var(--radius-inputs)",
                            background: angle === item.val ? "var(--color-midnight-ink)" : "var(--color-canvas-white)",
                            color: angle === item.val ? "var(--color-canvas-white)" : "var(--color-graphite)",
                            border: "1px solid var(--color-ash)",
                            cursor: (jobId || isFileLoading) ? "default" : "pointer",
                          }}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Color Selection */}
                  <div>
                    <label style={{ fontSize: "12px", fontWeight: 500, display: "block", marginBottom: "4px", color: "var(--color-midnight-ink)" }}>
                      Warna Cap:
                    </label>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", height: "30px" }}>
                      {COLOR_OPTIONS.map((c) => (
                        <button
                          key={c.hex}
                          type="button"
                          onClick={() => !jobId && !isFileLoading && setColorHex(c.hex)}
                          disabled={!!jobId || isFileLoading}
                          title={c.label}
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: "50%",
                            background: c.hex,
                            border: colorHex === c.hex ? "2px solid var(--color-midnight-ink)" : "1px solid rgba(0,0,0,0.15)",
                            transform: colorHex === c.hex ? "scale(1.15)" : "scale(1)",
                            cursor: (jobId || isFileLoading) ? "default" : "pointer",
                            transition: "var(--transition-fast)",
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Step 3: Password Security */}
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: "14px", opacity: isFileLoading ? 0.6 : 1 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Lock size={16} style={{ color: "var(--clr-success)" }} />
                <h3 style={{ fontSize: "15px", fontWeight: 500, color: "var(--color-midnight-ink)" }}>
                  3. Proteksi Kata Sandi (Opsional)
                </h3>
              </div>
              <input
                type="checkbox"
                checked={enablePassword}
                onChange={(e) => setEnablePassword(e.target.checked)}
                disabled={!!jobId || isFileLoading}
                style={{ width: 16, height: 16, cursor: "pointer", accentColor: "var(--color-electric-blue)" }}
              />
            </div>

            {enablePassword && (
              <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-midnight-ink)" }}>
                  Kata Sandi Pembuka PDF:
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    type={showPassword ? "text" : "password"}
                    className="input"
                    value={password}
                    maxLength={128}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={!!jobId || isFileLoading}
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
                      color: "var(--color-graphite)",
                      padding: "4px",
                    }}
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                <span style={{ fontSize: "11px", color: "var(--color-graphite)" }}>
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
              disabled={isSubmitting || !file || isFileLoading}
              style={{ width: "100%" }}
            >
              {isFileLoading ? (
                <>
                  <span className="animate-spin">⟳</span> Menyiapkan Berkas...
                </>
              ) : isSubmitting ? (
                <>
                  <span className="animate-spin">⟳</span> Memproses Dokumen...
                </>
              ) : !enableWatermark && enablePassword ? (
                <>
                  <Lock size={16} /> Kunci PDF dengan Kata Sandi
                </>
              ) : enableWatermark && enablePassword ? (
                <>
                  <ShieldCheck size={16} /> Terapkan Watermark & Kata Sandi
                </>
              ) : (
                <>
                  <ShieldCheck size={16} /> Terapkan Watermark
                </>
              )}
            </button>
          )}
        </div>

        {/* Right Column: Interactive Real-time Watermark Preview */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {isDone && documentId ? (
            <div className="result-panel animate-fade-in">
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div className="stat-icon green" style={{ width: 44, height: 44, borderRadius: "50%" }}>
                  <CheckCircle2 size={22} style={{ color: "var(--clr-success)" }} />
                </div>
                <div>
                  <h3 style={{ fontSize: "16px", fontWeight: 500, color: "var(--color-midnight-ink)" }}>
                    Dokumen Berhasil Diamankan!
                  </h3>
                  <p style={{ fontSize: "13px", color: "var(--color-graphite)" }}>
                    {enablePassword && !enableWatermark
                      ? "Enkripsi kata sandi (tanpa watermark) telah berhasil diterapkan."
                      : enablePassword && enableWatermark
                      ? "Watermark dan enkripsi kata sandi telah diterapkan."
                      : "Cap air visual telah disematkan ke seluruh halaman dokumen."}
                  </p>
                </div>
              </div>

              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "4px" }}>
                <DownloadLink href={getDownloadUrl(documentId)} download style={{ flex: "1 1 auto" }}>
                  <button className="btn btn-primary btn-lg" style={{ width: "100%" }}>
                    <Download size={16} /> Unduh Berkas Terproteksi
                  </button>
                </DownloadLink>
                <button className="btn btn-secondary btn-lg" onClick={handleReset} style={{ flex: "1 1 auto" }}>
                  <RotateCcw size={15} /> Proses Dokumen Lain
                </button>
              </div>
            </div>
          ) : (
            /* Live Interactive Canvas Mock Preview */
            <div className="card" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Eye size={16} style={{ color: "var(--color-electric-blue)" }} />
                  <h3 style={{ fontSize: "15px", fontWeight: 500, color: "var(--color-midnight-ink)" }}>
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
                  background: "var(--color-canvas-white)",
                  border: "1px solid var(--color-ash)",
                  borderRadius: "var(--radius-cards)",
                  boxShadow: "none",
                  display: "flex",
                  flexDirection: "column",
                  padding: "24px 28px",
                  overflow: "hidden",
                  userSelect: "none",
                }}
              >
                {/* Simulated Document Lines */}
                <div style={{ width: "40%", height: "10px", background: "var(--color-smoke)", borderRadius: "var(--radius-cardssmall)", marginBottom: "16px" }} />
                <div style={{ width: "100%", height: "6px", background: "var(--color-paper-mist)", borderRadius: "3px", marginBottom: "8px" }} />
                <div style={{ width: "92%", height: "6px", background: "var(--color-paper-mist)", borderRadius: "3px", marginBottom: "8px" }} />
                <div style={{ width: "96%", height: "6px", background: "var(--color-paper-mist)", borderRadius: "3px", marginBottom: "8px" }} />
                <div style={{ width: "75%", height: "6px", background: "var(--color-paper-mist)", borderRadius: "3px", marginBottom: "20px" }} />

                <div style={{ width: "100%", height: "60px", background: "var(--color-canvas-white)", border: "1px solid var(--color-smoke)", borderRadius: "var(--radius-cardssmall)", marginBottom: "20px" }} />

                <div style={{ width: "95%", height: "6px", background: "var(--color-paper-mist)", borderRadius: "3px", marginBottom: "8px" }} />
                <div style={{ width: "88%", height: "6px", background: "var(--color-paper-mist)", borderRadius: "3px", marginBottom: "8px" }} />
                <div style={{ width: "60%", height: "6px", background: "var(--color-paper-mist)", borderRadius: "3px" }} />

                {/* Overlaid Dynamic Watermark */}
                {enableWatermark && watermarkText.trim() && (
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

              <div style={{ borderTop: "1px solid var(--color-ash)", paddingTop: "12px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12.5px" }}>
                <span style={{ color: "var(--color-graphite)" }}>Hasil disimpan otomatis</span>
                <Link href="/riwayat-dokumen" style={{ color: "var(--color-electric-blue)", fontWeight: 500 }}>
                  Lihat Riwayat Dokumen →
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
      {/* Processing Modal Overlay */}
      <ProcessingModal
        isOpen={isSubmitting || isPolling || Boolean((pollError || submitError) && jobId && !isDone)}
        title="Sedang Memproses Watermark"
        subtitle="Mohon tunggu sebentar, sistem sedang menyatukan cap air dan memproteksi dokumen Anda."
        filename={file?.name}
        targetFormat={file?.name.split(".").pop()?.toUpperCase() || "PDF"}
        job={job}
        isPolling={isPolling}
        error={pollError || submitError}
        elapsedSeconds={elapsedSeconds}
        onRetry={handleProcess}
        onClose={() => setJobId(null)}
      />

      <FeatureGuideModal
        isOpen={showGuide}
        onClose={() => setShowGuide(false)}
        feature="watermark"
      />
    </div>
  );
}
