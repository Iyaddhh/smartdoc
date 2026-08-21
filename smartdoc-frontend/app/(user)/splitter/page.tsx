"use client";

import { useState, useMemo } from "react";
import FileUpload from "@/components/FileUpload";
import JobProgressCard from "@/components/JobProgressCard";
import { useJobPolling } from "@/lib/useJobPolling";
import { splitDocument, getSplitDocumentInfo, getDownloadUrl, DocumentInfo, JobStatus } from "@/lib/api";
import { showToast } from "@/components/Toast";
import {
  Scissors,
  Download,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Archive,
  BookOpen,
  Eye,
  Check,
  Maximize2,
  X,
  FileText,
} from "lucide-react";

type SplitMode = "extract_range" | "fixed_interval" | "all_single";

// Parse range expression like "1-3, 5" into set of numbers {1, 2, 3, 5}
function parseRangeToSet(rangeStr: string, maxPages: number): Set<number> {
  const set = new Set<number>();
  const parts = rangeStr.split(",");
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (trimmed.includes("-")) {
      const [startStr, endStr] = trimmed.split("-");
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (!isNaN(start) && !isNaN(end)) {
        for (
          let i = Math.max(1, Math.min(start, end));
          i <= Math.min(maxPages, Math.max(start, end));
          i++
        ) {
          set.add(i);
        }
      }
    } else {
      const p = parseInt(trimmed, 10);
      if (!isNaN(p) && p >= 1 && p <= maxPages) {
        set.add(p);
      }
    }
  }
  return set;
}

// Convert set of numbers {1, 2, 3, 5, 8, 9, 10} to range string "1-3, 5, 8-10"
function setToRangeString(set: Set<number>): string {
  const sorted = Array.from(set).sort((a, b) => a - b);
  if (sorted.length === 0) return "";
  const ranges: string[] = [];
  let start = sorted[0];
  let end = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === end + 1) {
      end = sorted[i];
    } else {
      ranges.push(start === end ? `${start}` : `${start}-${end}`);
      start = sorted[i];
      end = sorted[i];
    }
  }
  ranges.push(start === end ? `${start}` : `${start}-${end}`);
  return ranges.join(", ");
}

export default function SplitterPage() {
  const [file, setFile] = useState<File | null>(null);
  const [docInfo, setDocInfo] = useState<DocumentInfo | null>(null);
  const [fetchingInfo, setFetchingInfo] = useState(false);

  const [splitMode, setSplitMode] = useState<SplitMode>("extract_range");
  const [rangeExpression, setRangeExpression] = useState("1-3");
  const [chunkSize, setChunkSize] = useState<number>(2);
  const [outputFormat, setOutputFormat] = useState<"pdf" | "docx">("pdf");

  const [jobId, setJobId] = useState<string | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [doneJob, setDoneJob] = useState<JobStatus | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Modal zoom for inspecting a page thumbnail
  const [zoomPage, setZoomPage] = useState<{ index: number; src: string } | null>(null);

  const { job, isPolling, error: pollError, elapsedSeconds } = useJobPolling(jobId, {
    onDone: (j) => {
      setDoneJob(j);
      showToast("success", "Pemisahan dokumen berhasil selesai!", "Sukses");
    },
    onFailed: (j) => {
      showToast("error", j.error || "Proses pemisahan dokumen gagal.", "Gagal Memisahkan");
    },
  });

  const isDone = doneJob?.status === "done";

  // Selected pages set in extract_range mode
  const selectedPages = useMemo(() => {
    if (!docInfo || splitMode !== "extract_range") return new Set<number>();
    return parseRangeToSet(rangeExpression, docInfo.total_pages);
  }, [rangeExpression, docInfo, splitMode]);

  // Handle file select and fetch total pages + thumbnails
  const handleFileSelect = async (f: File) => {
    setFile(f);
    setJobId(null);
    setDocumentId(null);
    setDoneJob(null);
    setSubmitError(null);
    setDocInfo(null);

    setFetchingInfo(true);
    const res = await getSplitDocumentInfo(f);
    setFetchingInfo(false);

    if (res.success && res.data) {
      setDocInfo(res.data);
      if (res.data.total_pages > 1) {
        setRangeExpression(`1-${Math.min(3, res.data.total_pages)}`);
      } else {
        setRangeExpression("1");
      }
      showToast("success", `${res.data.total_pages} halaman berhasil dimuat untuk pratinjau.`, "Dokumen Siap");
    } else {
      showToast("warning", "Tidak dapat membuat pratinjau thumbnail halaman otomatis.", "Info Dokumen");
    }
  };

  // Toggle page selection on thumbnail click
  const togglePageSelection = (pageNum: number) => {
    if (jobId || !docInfo || splitMode !== "extract_range") return;
    const currentSet = new Set(selectedPages);
    if (currentSet.has(pageNum)) {
      currentSet.delete(pageNum);
    } else {
      currentSet.add(pageNum);
    }
    setRangeExpression(setToRangeString(currentSet));
  };

  // Select all / Deselect all
  const selectAllPages = () => {
    if (!docInfo) return;
    const set = new Set<number>();
    for (let i = 1; i <= docInfo.total_pages; i++) set.add(i);
    setRangeExpression(setToRangeString(set));
  };

  const clearPageSelection = () => {
    setRangeExpression("");
  };

  const handleProcess = async () => {
    if (!file) {
      showToast("warning", "Pilih berkas PDF atau Word (.docx) terlebih dahulu.", "Peringatan");
      return;
    }

    if (splitMode === "extract_range" && !rangeExpression.trim()) {
      setSubmitError("Pilih minimal satu halaman pada pratinjau atau isi rentang halaman.");
      showToast("warning", "Pilih halaman yang ingin diekstrak.", "Validasi Form");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setDoneJob(null);

    const res = await splitDocument({
      file,
      splitMode,
      rangeExpression: splitMode === "extract_range" ? rangeExpression.trim() : undefined,
      chunkSize: splitMode === "fixed_interval" ? chunkSize : undefined,
      outputFormat: splitMode === "extract_range" ? outputFormat : undefined,
    });

    setIsSubmitting(false);

    if (!res.success || !res.data) {
      const err = res.error || "Gagal memulai proses pemisahan dokumen";
      setSubmitError(err);
      showToast("error", err, "Gagal Memproses");
      return;
    }

    setJobId(res.data.job_id);
    setDocumentId(res.data.document_id);
    showToast("info", "Proses pemisahan dokumen sedang dikerjakan...", "Diproses");
  };

  const handleReset = () => {
    setFile(null);
    setDocInfo(null);
    setJobId(null);
    setDocumentId(null);
    setDoneJob(null);
    setSubmitError(null);
    setRangeExpression("1-3");
    setChunkSize(2);
  };

  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
      {/* Header */}
      <div className="page-header">
        <h2>
          Document <span className="highlight-span">Splitter</span>
        </h2>
        <p>Pisahkan, potong, atau ekstrak halaman dokumen dengan pratinjau visual interaktif.</p>
      </div>

      {/* Main Grid: Left Configuration & Right Document Preview */}
      <div className="grid-2" style={{ alignItems: "start" }}>
        {/* =========================================================================
            LEFT COLUMN: Controls, Upload, and Mode Selection
            ========================================================================= */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Step 1: File Upload */}
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ fontSize: "15px", fontWeight: 600, color: "var(--color-ink-black)" }}>
                1. Unggah Berkas
              </h3>
              {docInfo && (
                <span className="badge badge-done" style={{ fontSize: "11px" }}>
                  <BookOpen size={12} /> {docInfo.total_pages} Halaman Terdeteksi
                </span>
              )}
            </div>

            <FileUpload
              accept=".pdf,.docx"
              maxSizeMB={50}
              onFileSelected={handleFileSelect}
              disabled={isSubmitting || !!jobId}
            />

            {fetchingInfo && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "var(--color-warm-gray)" }}>
                <span className="animate-spin">⟳</span> Membuat pratinjau halaman visual...
              </div>
            )}
          </div>

          {/* Step 2: Split Mode Options */}
          {file && (
            <div className="card animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <h3 style={{ fontSize: "15px", fontWeight: 600, color: "var(--color-ink-black)" }}>
                2. Metode Pemisahan
              </h3>

              {/* Mode Selector Cards */}
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {/* Mode 1: Extract Range */}
                <div
                  onClick={() => !jobId && setSplitMode("extract_range")}
                  style={{
                    padding: "14px",
                    borderRadius: "var(--radius-inputs)",
                    border: `1px solid ${splitMode === "extract_range" ? "var(--color-cyan-edge)" : "var(--color-stone-border)"}`,
                    background: splitMode === "extract_range" ? "var(--color-stone-canvas)" : "var(--color-pure-white)",
                    cursor: jobId ? "default" : "pointer",
                    transition: "var(--transition-fast)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                    <input
                      type="radio"
                      name="splitMode"
                      checked={splitMode === "extract_range"}
                      onChange={() => setSplitMode("extract_range")}
                      disabled={!!jobId}
                    />
                    <span style={{ fontWeight: 600, fontSize: "14px", color: "var(--color-ink-black)" }}>
                      Ekstrak Halaman Pilihan
                    </span>
                  </div>
                  <p style={{ fontSize: "12.5px", color: "var(--color-warm-gray)", marginLeft: "24px" }}>
                    Klik halaman pada panel pratinjau di samping atau masukkan rentang angka.
                  </p>

                  {splitMode === "extract_range" && (
                    <div style={{ marginTop: "12px", marginLeft: "24px", display: "flex", flexDirection: "column", gap: "10px" }}>
                      <div>
                        <label style={{ fontSize: "12px", fontWeight: 500, display: "block", marginBottom: "4px", color: "var(--color-ink-black)" }}>
                          Rentang Halaman Terpilih:
                        </label>
                        <input
                          className="input"
                          placeholder="cth: 1-3, 5, 8-10"
                          value={rangeExpression}
                          onChange={(e) => setRangeExpression(e.target.value)}
                          disabled={!!jobId}
                          style={{ fontSize: "13px", height: "36px" }}
                        />
                        <span style={{ fontSize: "11px", color: "var(--color-ash-gray)", marginTop: "2px", display: "block" }}>
                          {selectedPages.size > 0
                            ? `${selectedPages.size} halaman terpilih (${Array.from(selectedPages).join(", ")})`
                            : "Belum ada halaman yang dipilih."}
                        </span>
                      </div>

                      {/* Format Output */}
                      <div>
                        <label style={{ fontSize: "12px", fontWeight: 500, display: "block", marginBottom: "4px", color: "var(--color-ink-black)" }}>
                          Format Berkas Hasil:
                        </label>
                        <div style={{ display: "flex", gap: "8px" }}>
                          <button
                            type="button"
                            className={`btn btn-sm ${outputFormat === "pdf" ? "btn-primary" : "btn-secondary"}`}
                            onClick={() => setOutputFormat("pdf")}
                            disabled={!!jobId}
                          >
                            PDF
                          </button>
                          <button
                            type="button"
                            className={`btn btn-sm ${outputFormat === "docx" ? "btn-primary" : "btn-secondary"}`}
                            onClick={() => setOutputFormat("docx")}
                            disabled={!!jobId}
                          >
                            Word (.docx)
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Mode 2: Fixed Interval Chunks */}
                <div
                  onClick={() => !jobId && setSplitMode("fixed_interval")}
                  style={{
                    padding: "14px",
                    borderRadius: "var(--radius-inputs)",
                    border: `1px solid ${splitMode === "fixed_interval" ? "var(--color-cyan-edge)" : "var(--color-stone-border)"}`,
                    background: splitMode === "fixed_interval" ? "var(--color-stone-canvas)" : "var(--color-pure-white)",
                    cursor: jobId ? "default" : "pointer",
                    transition: "var(--transition-fast)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                    <input
                      type="radio"
                      name="splitMode"
                      checked={splitMode === "fixed_interval"}
                      onChange={() => setSplitMode("fixed_interval")}
                      disabled={!!jobId}
                    />
                    <span style={{ fontWeight: 600, fontSize: "14px", color: "var(--color-ink-black)" }}>
                      Pecah per Rentang Tetap
                    </span>
                  </div>
                  <p style={{ fontSize: "12.5px", color: "var(--color-warm-gray)", marginLeft: "24px" }}>
                    Bagi dokumen menjadi potongan berkas terpisah setiap *N* halaman.
                  </p>

                  {splitMode === "fixed_interval" && (
                    <div style={{ marginTop: "12px", marginLeft: "24px", display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "13px", color: "var(--color-ink-black)" }}>Pecah setiap</span>
                      <input
                        type="number"
                        className="input"
                        min={1}
                        max={docInfo?.total_pages || 100}
                        value={chunkSize}
                        onChange={(e) => setChunkSize(Math.max(1, parseInt(e.target.value) || 1))}
                        disabled={!!jobId}
                        style={{ width: "70px", height: "34px", textAlign: "center", padding: "4px" }}
                      />
                      <span style={{ fontSize: "13px", color: "var(--color-ink-black)" }}>halaman</span>
                      {docInfo && (
                        <span style={{ fontSize: "11px", color: "var(--color-warm-gray)" }}>
                          (~{Math.ceil(docInfo.total_pages / chunkSize)} berkas dalam .zip)
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Mode 3: All Single Pages */}
                <div
                  onClick={() => !jobId && setSplitMode("all_single")}
                  style={{
                    padding: "14px",
                    borderRadius: "var(--radius-inputs)",
                    border: `1px solid ${splitMode === "all_single" ? "var(--color-cyan-edge)" : "var(--color-stone-border)"}`,
                    background: splitMode === "all_single" ? "var(--color-stone-canvas)" : "var(--color-pure-white)",
                    cursor: jobId ? "default" : "pointer",
                    transition: "var(--transition-fast)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                    <input
                      type="radio"
                      name="splitMode"
                      checked={splitMode === "all_single"}
                      onChange={() => setSplitMode("all_single")}
                      disabled={!!jobId}
                    />
                    <span style={{ fontWeight: 600, fontSize: "14px", color: "var(--color-ink-black)" }}>
                      Pecah Semua Halaman Tunggal
                    </span>
                  </div>
                  <p style={{ fontSize: "12.5px", color: "var(--color-warm-gray)", marginLeft: "24px" }}>
                    Setiap halaman dipisah menjadi 1 file PDF mandiri dan dikemas dalam arsip ZIP.
                  </p>
                </div>
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
                  disabled={isSubmitting}
                  style={{ width: "100%", marginTop: "4px" }}
                >
                  {isSubmitting ? (
                    <>
                      <span className="animate-spin">⟳</span> Menyiapkan Pemisahan...
                    </>
                  ) : (
                    <>
                      <Scissors size={16} /> Pisahkan Dokumen
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          {/* Progress & Result Box on Left Column */}
          {jobId && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
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
                        Pemisahan Selesai!
                      </h3>
                      <p style={{ fontSize: "13px", color: "var(--color-warm-gray)" }}>
                        {splitMode === "extract_range"
                          ? `Halaman berhasil diekstrak ke format ${outputFormat.toUpperCase()}`
                          : "Seluruh potongan berkas telah dikemas ke dalam arsip ZIP"}
                      </p>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "4px" }}>
                    <a href={getDownloadUrl(documentId)} download style={{ flex: "1 1 auto" }}>
                      <button className="btn btn-primary btn-lg" style={{ width: "100%" }}>
                        {splitMode === "extract_range" ? <Download size={16} /> : <Archive size={16} />}
                        {splitMode === "extract_range" ? "Unduh Hasil Ekstrak" : "Unduh Paket ZIP"}
                      </button>
                    </a>
                    <button className="btn btn-secondary btn-lg" onClick={handleReset} style={{ flex: "1 1 auto" }}>
                      <RotateCcw size={15} /> Pisahkan Berkas Lain
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* =========================================================================
            RIGHT COLUMN: Document Page Preview Gallery
            ========================================================================= */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: "14px", minHeight: "480px" }}>
            {/* Preview Panel Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--color-stone-border)", paddingBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Eye size={17} style={{ color: "var(--color-cyan-edge)" }} />
                <h3 style={{ fontSize: "15px", fontWeight: 600, color: "var(--color-ink-black)" }}>
                  Pratinjau Halaman Dokumen
                </h3>
              </div>

              {docInfo && docInfo.total_pages > 0 && splitMode === "extract_range" && (
                <div style={{ display: "flex", gap: "6px" }}>
                  <button className="btn btn-secondary btn-sm" onClick={selectAllPages} disabled={!!jobId}>
                    Pilih Semua
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={clearPageSelection} disabled={!!jobId}>
                    Bersihkan
                  </button>
                </div>
              )}
            </div>

            {/* Preview Content */}
            {!file ? (
              /* Empty Preview State */
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "60px 20px",
                  textAlign: "center",
                  flex: 1,
                }}
              >
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: "50%",
                    background: "var(--color-stone-canvas)",
                    border: "1px solid var(--color-stone-border)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--color-ash-gray)",
                    marginBottom: "16px",
                  }}
                >
                  <FileText size={28} />
                </div>
                <h4 style={{ fontSize: "15px", fontWeight: 600, color: "var(--color-ink-black)", marginBottom: "4px" }}>
                  Belum Ada Dokumen yang Dipilih
                </h4>
                <p style={{ fontSize: "13px", color: "var(--color-warm-gray)", maxWidth: "340px" }}>
                  Unggah berkas PDF atau Word (.docx) pada panel kiri untuk melihat pratinjau halaman visual di sini.
                </p>
              </div>
            ) : fetchingInfo ? (
              /* Shimmer Loading Previews */
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: "12px", padding: "8px 0" }}>
                {[...Array(6)].map((_, i) => (
                  <div
                    key={i}
                    className="skeleton"
                    style={{ height: 180, borderRadius: "var(--radius-cards)" }}
                  />
                ))}
              </div>
            ) : docInfo && docInfo.thumbnails && docInfo.thumbnails.length > 0 ? (
              /* Rendered Page Thumbnail Grid */
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
                  gap: "14px",
                  maxHeight: "680px",
                  overflowY: "auto",
                  padding: "4px",
                }}
              >
                {docInfo.thumbnails.map((thumbSrc, idx) => {
                  const pageNum = idx + 1;
                  const isSelected = selectedPages.has(pageNum);
                  const chunkPart = splitMode === "fixed_interval" ? Math.floor(idx / chunkSize) + 1 : null;

                  return (
                    <div
                      key={pageNum}
                      onClick={() => togglePageSelection(pageNum)}
                      style={{
                        position: "relative",
                        background: "var(--color-pure-white)",
                        borderRadius: "var(--radius-cards)",
                        border: isSelected && splitMode === "extract_range"
                          ? "2px solid var(--color-cyan-signal)"
                          : "1px solid var(--color-stone-border)",
                        boxShadow: isSelected && splitMode === "extract_range"
                          ? "0 0 0 2px var(--color-sky-wash)"
                          : "var(--shadow-subtle)",
                        cursor: splitMode === "extract_range" && !jobId ? "pointer" : "default",
                        overflow: "hidden",
                        display: "flex",
                        flexDirection: "column",
                        transition: "var(--transition-fast)",
                      }}
                    >
                      {/* Page Tag Header */}
                      <div
                        style={{
                          padding: "4px 8px",
                          background: isSelected && splitMode === "extract_range"
                            ? "var(--color-cyan-signal)"
                            : "var(--color-stone-canvas)",
                          color: isSelected && splitMode === "extract_range"
                            ? "var(--color-pure-white)"
                            : "var(--color-ink-black)",
                          fontSize: "11px",
                          fontWeight: 600,
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          borderBottom: "1px solid var(--color-stone-border)",
                        }}
                      >
                        <span>Hal {pageNum}</span>
                        {splitMode === "extract_range" && (
                          <span
                            style={{
                              width: 14,
                              height: 14,
                              borderRadius: "50%",
                              background: isSelected ? "var(--color-pure-white)" : "transparent",
                              border: `1px solid ${isSelected ? "var(--color-cyan-signal)" : "var(--color-stone-muted)"}`,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            {isSelected && <Check size={10} style={{ color: "var(--color-cyan-signal)" }} />}
                          </span>
                        )}
                        {splitMode === "fixed_interval" && chunkPart && (
                          <span style={{ fontSize: "10px", color: "var(--color-warm-gray)" }}>
                            Bagian {chunkPart}
                          </span>
                        )}
                      </div>

                      {/* Thumbnail Image */}
                      <div
                        style={{
                          width: "100%",
                          height: "155px",
                          position: "relative",
                          background: "#f4f4f3",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          overflow: "hidden",
                        }}
                      >
                        <img
                          src={thumbSrc}
                          alt={`Halaman ${pageNum}`}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "contain",
                          }}
                        />

                        {/* Zoom Inspect Button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setZoomPage({ index: pageNum, src: thumbSrc });
                          }}
                          title="Perbesar Pratinjau"
                          style={{
                            position: "absolute",
                            bottom: "6px",
                            right: "6px",
                            background: "rgba(12, 10, 9, 0.7)",
                            color: "white",
                            width: 24,
                            height: 24,
                            borderRadius: "4px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            opacity: 0.85,
                          }}
                        >
                          <Maximize2 size={12} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Fallback if thumbnails not rendered */
              <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--color-warm-gray)" }}>
                <p style={{ fontSize: "13px" }}>Dokumen memiliki {docInfo?.total_pages} halaman.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Zoom Inspect Modal */}
      {zoomPage && (
        <div
          onClick={() => setZoomPage(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(12, 10, 9, 0.75)",
            backdropFilter: "blur(3px)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--color-pure-white)",
              borderRadius: "var(--radius-cards)",
              padding: "16px",
              maxWidth: "600px",
              width: "100%",
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              boxShadow: "var(--shadow-xl)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 600, fontSize: "15px", color: "var(--color-ink-black)" }}>
                Pratinjau: Halaman {zoomPage.index}
              </span>
              <button onClick={() => setZoomPage(null)} style={{ color: "var(--color-ash-gray)", padding: "4px" }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", display: "flex", justifyContent: "center", background: "var(--color-stone-canvas)", padding: "12px", borderRadius: "var(--radius-inputs)" }}>
              <img
                src={zoomPage.src}
                alt={`Halaman ${zoomPage.index}`}
                style={{ maxWidth: "100%", maxHeight: "70vh", objectFit: "contain", boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
