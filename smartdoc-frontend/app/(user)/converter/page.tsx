"use client";

import { useState } from "react";
import Link from "next/link";
import FileUpload from "@/components/FileUpload";
import JobProgressCard from "@/components/JobProgressCard";
import { useJobPolling } from "@/lib/useJobPolling";
import { convertFile, getDownloadUrl, JobStatus } from "@/lib/api";
import { showToast } from "@/components/Toast";
import { FileOutput, Download, CheckCircle2, Info, ArrowRight, AlertCircle, RefreshCw, Sparkles } from "lucide-react";

type OutputFormat = "pdf" | "docx" | "jpg" | "png";

const FORMAT_MAP: Record<string, OutputFormat[]> = {
  ".docx": ["pdf"],
  ".xlsx": ["pdf"],
  ".pptx": ["pdf"],
  ".pdf": ["docx", "jpg", "png"],
  ".jpg": ["pdf"],
  ".jpeg": ["pdf"],
  ".png": ["pdf"],
};

const FORMAT_LABELS: Record<string, string> = {
  pdf: "Dokumen PDF (.pdf)",
  docx: "Microsoft Word (.docx)",
  jpg: "Gambar JPEG (.jpg)",
  png: "Gambar PNG (.png)",
};

function getExtension(filename: string): string {
  return "." + filename.split(".").pop()!.toLowerCase();
}

export default function ConverterPage() {
  const [file, setFile] = useState<File | null>(null);
  const [outputFormat, setOutputFormat] = useState<OutputFormat | "">("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [docId, setDocId] = useState<string | null>(null);
  const [doneJob, setDoneJob] = useState<JobStatus | null>(null);
  const [redirectOcr, setRedirectOcr] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { job, isPolling, error: pollError, elapsedSeconds } = useJobPolling(jobId, {
    onDone: (j) => {
      setDoneJob(j);
      showToast("success", `Dokumen berhasil dikonversi ke format ${outputFormat.toUpperCase()}!`, "Konversi Berhasil");
    },
    onFailed: (j) => {
      showToast("error", j.error || "Proses konversi gagal.", "Konversi Gagal");
    },
  });

  const availableFormats = file ? FORMAT_MAP[getExtension(file.name)] ?? [] : [];
  const isDone = doneJob?.status === "done";

  const handleFileSelected = (f: File) => {
    setFile(f);
    const exts = FORMAT_MAP[getExtension(f.name)] ?? [];
    setOutputFormat(exts.length === 1 ? exts[0] : "");
    setJobId(null);
    setDoneJob(null);
    setErrorMsg(null);
    setRedirectOcr(false);
  };

  const handleProcess = async () => {
    if (!file || !outputFormat) return;
    setLoading(true);
    setErrorMsg(null);
    setDoneJob(null);
    setRedirectOcr(false);

    const res = await convertFile(file, outputFormat);
    setLoading(false);

    if (!res.success || !res.data) {
      const msg = res.error || "Gagal memulai proses konversi";
      setErrorMsg(msg);
      showToast("error", msg, "Kendala Konversi");
      return;
    }

    if (res.data.redirect) {
      setRedirectOcr(true);
      showToast("info", "PDF ini terdeteksi scan fisik. Dialihkan ke fitur OCR.", "Deteksi Dokumen");
      return;
    }

    setJobId(res.data.job_id);
    setDocId(res.data.document_id);
  };

  const resetAll = () => {
    setFile(null);
    setJobId(null);
    setDoneJob(null);
    setDocId(null);
    setOutputFormat("");
    setErrorMsg(null);
    setRedirectOcr(false);
  };

  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
      {/* Header */}
      <div className="page-header">
        <h2>
          Document <span className="highlight-span">Converter</span>
        </h2>
        <p>Konversi dokumen antar berbagai format secara instan dan rapi.</p>
      </div>

      <div className="grid-2" style={{ alignItems: "start" }}>
        {/* Upload & Setup Column */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div className="card">
            <h3 style={{ fontSize: "15px", fontWeight: 600, marginBottom: "14px", color: "var(--color-ink-black)" }}>
              Pilih Dokumen Sumber
            </h3>
            <FileUpload
              accept=".pdf,.docx,.xlsx,.pptx,.jpg,.jpeg,.png"
              label="Pilih atau Letakkan File"
              description="Mendukung PDF, Word, Excel, PPT, dan Gambar (maks 50 MB)"
              onFileSelected={handleFileSelected}
              disabled={isPolling || loading}
            />
          </div>

          {/* Format selection */}
          {file && availableFormats.length > 0 && (
            <div className="card animate-fade-in">
              <h3 style={{ fontSize: "15px", fontWeight: 600, marginBottom: "12px", color: "var(--color-ink-black)" }}>
                Pilih Format Output
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {availableFormats.map((fmt) => (
                  <label
                    key={fmt}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      padding: "10px 14px",
                      borderRadius: "var(--radius-inputs)",
                      cursor: "pointer",
                      border: `1px solid ${outputFormat === fmt ? "var(--color-cyan-edge)" : "var(--color-stone-border)"}`,
                      background: outputFormat === fmt ? "var(--color-sky-wash)" : "var(--color-pure-white)",
                      transition: "var(--transition-fast)",
                    }}
                  >
                    <input
                      type="radio"
                      name="outputFormat"
                      value={fmt}
                      checked={outputFormat === fmt}
                      onChange={() => setOutputFormat(fmt)}
                      disabled={isPolling || loading}
                      style={{ accentColor: "var(--color-cyan-edge)" }}
                    />
                    <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--color-ink-black)" }}>
                      {FORMAT_LABELS[fmt]}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

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

          {/* OCR Redirect Banner */}
          {redirectOcr && (
            <div className="alert alert-info animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                <Info size={16} style={{ flexShrink: 0, marginTop: "2px" }} />
                <span>PDF ini merupakan pindaian fisik. Gunakan OCR Template-Based untuk mengekstrak dan mengubahnya menjadi DOCX.</span>
              </div>
              <Link href="/scan">
                <button className="btn btn-primary btn-sm">
                  Buka Fitur OCR <ArrowRight size={13} />
                </button>
              </Link>
            </div>
          )}

          {/* Main Action Button with Loading state */}
          <button
            className="btn btn-primary btn-lg"
            onClick={handleProcess}
            disabled={!file || !outputFormat || loading || isPolling || isDone}
            style={{ width: "100%" }}
          >
            {loading ? (
              <>
                <span className="animate-spin">⟳</span> Menyiapkan Konversi...
              </>
            ) : isPolling ? (
              <>
                <span className="animate-spin">⟳</span> Sedang Mengonversi Dokumen...
              </>
            ) : isDone ? (
              <>
                <CheckCircle2 size={16} /> Konversi Selesai
              </>
            ) : (
              <>
                Konversi Sekarang <ArrowRight size={16} />
              </>
            )}
          </button>

          {/* Progress Card */}
          <JobProgressCard
            job={job}
            isPolling={isPolling}
            error={pollError}
            elapsedSeconds={elapsedSeconds}
            onRetry={handleProcess}
          />
        </div>

        {/* Result Column / Dynamic Feedback */}
        <div>
          {isDone && docId ? (
            <div className="result-panel animate-fade-in">
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <CheckCircle2 size={22} style={{ color: "var(--clr-success)" }} />
                <div>
                  <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--color-ink-black)" }}>
                    Dokumen Berhasil Dikonversi
                  </h3>
                  <p style={{ fontSize: "12.5px", color: "var(--color-warm-gray)" }}>
                    Berkas siap diunduh dalam format <strong>{outputFormat?.toUpperCase()}</strong>
                  </p>
                </div>
              </div>

              <div
                style={{
                  background: "var(--color-stone-canvas)",
                  border: "1px solid var(--color-stone-border)",
                  borderRadius: "var(--radius-inputs)",
                  padding: "14px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <p style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-ink-black)" }}>
                    {file?.name}
                  </p>
                  <p style={{ fontSize: "11.5px", color: "var(--color-warm-gray)", marginTop: "2px" }}>
                    Output: .{outputFormat}
                  </p>
                </div>
                <span className="badge badge-done">Siap Unduh</span>
              </div>

              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "4px" }}>
                <a
                  href={getDownloadUrl(docId)}
                  download
                  className="btn btn-primary"
                >
                  <Download size={16} /> Unduh Berkas Hasil
                </a>
                <button
                  className="btn btn-secondary"
                  onClick={resetAll}
                >
                  Konversi File Lain
                </button>
              </div>
            </div>
          ) : isPolling ? (
            <div className="card animate-fade-in" style={{ textAlign: "center", padding: "40px 24px" }}>
              <div className="stat-icon cyan animate-pulse" style={{ width: 52, height: 52, margin: "0 auto 16px", borderRadius: "12px" }}>
                <Sparkles size={24} />
              </div>
              <h4 style={{ fontSize: "15px", fontWeight: 600, color: "var(--color-ink-black)", marginBottom: "4px" }}>
                Sedang Memproses Dokumen
              </h4>
              <p style={{ fontSize: "13px", color: "var(--color-warm-gray)", maxWidth: "320px", margin: "0 auto" }}>
                Sistem sedang mengonversi struktur file ke format {outputFormat?.toUpperCase()}. Anda dapat memantau status secara live.
              </p>
            </div>
          ) : (
            <div className="card" style={{ background: "var(--color-stone-canvas)", borderStyle: "dashed" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                <FileOutput size={18} style={{ color: "var(--color-warm-gray)" }} />
                <h4 style={{ fontSize: "14px", fontWeight: 500, color: "var(--color-ink-black)" }}>
                  Alur Pemrosesan
                </h4>
              </div>
              <p style={{ fontSize: "13px", color: "var(--color-warm-gray)", lineHeight: 1.6 }}>
                Unggah dokumen Anda di kolom sebelah kiri, pilih format tujuan yang tersedia, dan klik tombol konversi. Berkas hasil akan langsung tersedia untuk diunduh.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Supported formats table */}
      <div className="card">
        <h3 style={{ fontSize: "15px", fontWeight: 600, marginBottom: "14px", color: "var(--color-ink-black)" }}>
          Matriks Format yang Didukung
        </h3>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Format Asal</th>
                <th>Format Tujuan</th>
                <th>Mesin Pemroses</th>
              </tr>
            </thead>
            <tbody>
              {[
                { input: "Word (.docx)", output: "PDF", engine: "LibreOffice Headless" },
                { input: "Excel (.xlsx)", output: "PDF", engine: "LibreOffice Headless" },
                { input: "PowerPoint (.pptx)", output: "PDF", engine: "LibreOffice Headless" },
                { input: "PDF (Digital text)", output: "Word (.docx)", engine: "pdf2docx engine" },
                { input: "PDF", output: "JPG / PNG", engine: "pdf2image + Poppler" },
                { input: "Gambar (JPG/PNG)", output: "PDF", engine: "Pillow Engine" },
              ].map((row, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 500 }}>{row.input}</td>
                  <td>
                    <span className="badge badge-neutral">{row.output}</span>
                  </td>
                  <td style={{ color: "var(--color-warm-gray)", fontSize: "13px" }}>{row.engine}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
