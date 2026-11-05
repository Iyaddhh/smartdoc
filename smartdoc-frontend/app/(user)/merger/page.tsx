"use client";

import PageHeading from "@/components/ui/PageHeading";
import ToolStorage from "@/components/ToolStorage";

import { formatBytes } from "@/lib/format";

import DownloadLink from "@/components/DownloadLink";

import { useState, useRef } from "react";
import Link from "next/link";
import FileUpload from "@/components/FileUpload";
import ProcessingModal from "@/components/ProcessingModal";
import FeatureGuideModal, { GuideButton } from "@/components/FeatureGuideModal";
import { useJobPolling } from "@/hooks/useJobPolling";
import { mergeDocuments, getMergerDocInfo, getDownloadUrl, JobStatus } from "@/lib/api";
import { showToast } from "@/components/Toast";
import {
  Combine,
  Download,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  FileText,
  Layers,
  UploadCloud,
  FileSpreadsheet,
  FileImage,
  Presentation,
  Sparkles,
  ArrowUpToLine,
  ArrowDownToLine,
} from "lucide-react";


function getFileIcon(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return <FileText size={18} style={{ color: "var(--clr-error)" }} />;
  if (["doc", "docx"].includes(ext || "")) return <FileText size={18} style={{ color: "var(--color-electric-blue)" }} />;
  if (["xls", "xlsx"].includes(ext || "")) return <FileSpreadsheet size={18} style={{ color: "var(--clr-success)" }} />;
  if (["ppt", "pptx"].includes(ext || "")) return <Presentation size={18} style={{ color: "var(--clr-warning)" }} />;
  if (["jpg", "jpeg", "png"].includes(ext || "")) return <FileImage size={18} style={{ color: "var(--color-electric-blue)" }} />;
  return <FileText size={18} style={{ color: "var(--color-midnight-ink)" }} />;
}

type MergeTabMode = "sequence" | "insert";
type InsertPos = "start" | "end" | "custom";

export default function MergerPage() {
  const [saveToWorkspace, setSaveToWorkspace] = useState(false);
  const [tabMode, setTabMode] = useState<MergeTabMode>("insert");

  // State for Sequence Mode
  const [files, setFiles] = useState<File[]>([]);

  // State for Insert Mode
  const [mainDoc, setMainDoc] = useState<File | null>(null);
  const [mainDocPages, setMainDocPages] = useState<number>(1);
  const [insertDoc, setInsertDoc] = useState<File | null>(null);
  const [insertPos, setInsertPos] = useState<InsertPos>("start");
  const [afterPage, setAfterPage] = useState<number>(1);
  const [fetchingMainInfo, setFetchingMainInfo] = useState(false);

  // Common State
  const [customTitle, setCustomTitle] = useState("Dokumen_Gabungan");
  const [jobId, setJobId] = useState<string | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [doneJob, setDoneJob] = useState<JobStatus | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const { job, isPolling, error: pollError, elapsedSeconds } = useJobPolling(jobId, {
    onDone: (j) => {
      setDoneJob(j);
      showToast("success", "Penggabungan dokumen berhasil diselesaikan!", "Penggabungan Sukses");
    },
    onFailed: (j) => {
      showToast("error", j.error || "Proses penggabungan dokumen gagal.", "Gagal Menggabungkan");
    },
  });

  const isDone = doneJob?.status === "done";

  // Handle Main Doc Select in Insert Mode
  const handleMainDocSelect = async (f: File) => {
    setMainDoc(f);
    setJobId(null);
    setDocumentId(null);
    setDoneJob(null);
    setSubmitError(null);

    setFetchingMainInfo(true);
    const res = await getMergerDocInfo(f);
    setFetchingMainInfo(false);

    if (res.success && res.data) {
      setMainDocPages(res.data.total_pages);
      setAfterPage(Math.min(1, res.data.total_pages));
    }
  };

  // Handle Insert Doc Select
  const handleInsertDocSelect = (f: File) => {
    setInsertDoc(f);
    setJobId(null);
    setDocumentId(null);
    setDoneJob(null);
    setSubmitError(null);
  };

  // Handle adding files in Sequence Mode
  const handleAddFiles = (newFileList: FileList | null) => {
    if (!newFileList || newFileList.length === 0) return;
    const incoming = Array.from(newFileList);
    const valid: File[] = [];

    for (const f of incoming) {
      const ext = f.name.split(".").pop()?.toLowerCase() || "";
      const isImg = ["jpg", "jpeg", "png"].includes(ext);
      const limitMb = isImg ? 12 : 35;
      if (f.size > limitMb * 1024 * 1024) {
        showToast("error", `Berkas "${f.name}" melebihi batas ${limitMb} MB untuk ${isImg ? "gambar" : "dokumen"}.`, "Ukuran Terlalu Besar");
      } else {
        valid.push(f);
      }
    }

    if (valid.length > 0) {
      setFiles((prev) => [...prev, ...valid]);
      setJobId(null);
      setDocumentId(null);
      setDoneJob(null);
      setSubmitError(null);
      showToast("info", `${valid.length} berkas ditambahkan ke antrean.`, "Berkas Ditambahkan");
    }
  };

  const moveFileUp = (index: number) => {
    if (index === 0 || jobId) return;
    setFiles((prev) => {
      const next = [...prev];
      const temp = next[index - 1];
      next[index - 1] = next[index];
      next[index] = temp;
      return next;
    });
  };

  const moveFileDown = (index: number) => {
    if (index === files.length - 1 || jobId) return;
    setFiles((prev) => {
      const next = [...prev];
      const temp = next[index + 1];
      next[index + 1] = next[index];
      next[index] = temp;
      return next;
    });
  };

  const moveToStart = (index: number) => {
    if (index === 0 || jobId) return;
    setFiles((prev) => {
      const item = prev[index];
      const rest = prev.filter((_, i) => i !== index);
      return [item, ...rest];
    });
  };

  const moveToEnd = (index: number) => {
    if (index === files.length - 1 || jobId) return;
    setFiles((prev) => {
      const item = prev[index];
      const rest = prev.filter((_, i) => i !== index);
      return [...rest, item];
    });
  };
  // Handle Multiple File Selection in Sequence Mode
  const removeFile = (index: number) => {
    if (jobId) return;
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleProcess = async () => {
    setIsSubmitting(true);
    setSubmitError(null);
    setDoneJob(null);

    let res;
    if (tabMode === "insert") {
      if (!mainDoc || !insertDoc) {
        setSubmitError("Harap pilih Dokumen Utama dan Dokumen yang ingin disisipkan.");
        setIsSubmitting(false);
        return;
      }
      res = await mergeDocuments({
      saveToWorkspace,
        files: [mainDoc, insertDoc],
        mergeMode: "insert",
        insertPosition: insertPos,
        afterPage: insertPos === "custom" ? afterPage : undefined,
        customTitle: customTitle.trim() || undefined,
      });
    } else {
      if (files.length < 2) {
        setSubmitError("Harap pilih minimal 2 berkas untuk digabungkan.");
        setIsSubmitting(false);
        return;
      }
      res = await mergeDocuments({
      saveToWorkspace,
        files,
        mergeMode: "sequence",
        customTitle: customTitle.trim() || undefined,
      });
    }

    if (!res.success || !res.data) {
      setIsSubmitting(false);
      const err = res.error || "Gagal memulai proses penggabungan berkas";
      setSubmitError(err);
      showToast("error", err, "Gagal Memproses");
      return;
    }

    setJobId(res.data.job_id);
    setDocumentId(res.data.document_id);
  };

  const handleReset = () => {
    setFiles([]);
    setMainDoc(null);
    setInsertDoc(null);
    setJobId(null);
    setDocumentId(null);
    setDoneJob(null);
    setSubmitError(null);
    setCustomTitle("Dokumen_Gabungan");
  };

  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
      {/* Page Header */}
      <div className="page-header" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
          <PageHeading title="Gabung berkas" description="Susun dan gabungkan berkas menjadi satu dokumen PDF." />
          <GuideButton onClick={() => setShowGuide(true)} />
        </div>
      <ToolStorage value={saveToWorkspace} onChange={setSaveToWorkspace} disabled={Boolean(jobId)} documentId={documentId} done={isDone} />


      {/* Mode Selector Tabs */}
      <div style={{ display: "flex", gap: "8px", borderBottom: "1px solid var(--color-ash)", paddingBottom: "12px" }}>
        <button
          type="button"
          onClick={() => !jobId && setTabMode("insert")}
          className={`btn ${tabMode === "insert" ? "btn-primary" : "btn-secondary"}`}
          style={{ fontSize: "13px" }}
          disabled={!!jobId}
        >
          <Combine size={14} /> Sisipkan ke Dokumen (Awal / Akhir / Custom)
        </button>
        <button
          type="button"
          onClick={() => !jobId && setTabMode("sequence")}
          className={`btn ${tabMode === "sequence" ? "btn-primary" : "btn-secondary"}`}
          style={{ fontSize: "13px" }}
          disabled={!!jobId}
        >
          <Layers size={14} /> Urutan Bebas Banyak Berkas
        </button>
      </div>

      <div className="grid-2" style={{ alignItems: "start" }}>
        {/* =========================================================================
            LEFT COLUMN: Controls according to chosen mode
            ========================================================================= */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* ======================= MODE 1: SMART INSERT ======================= */}
          {tabMode === "insert" && (
            <>
              {/* Step 1: Main Document */}
              <div className="card" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3 style={{ fontSize: "15px", fontWeight: 500, color: "var(--color-midnight-ink)" }}>
                    1. Dokumen Utama (Main Document)
                  </h3>
                  {mainDoc && (
                    <span className="badge badge-done" style={{ fontSize: "11px" }}>
                      {mainDocPages} Halaman
                    </span>
                  )}
                </div>

                <FileUpload
                  accept=".pdf,.docx,.xlsx,.pptx,.jpg,.jpeg,.png"
                  maxSizeMB={50}
                  onFileSelected={handleMainDocSelect}
                  onFileClear={() => { setMainDoc(null); setJobId(null); setDoneJob(null); }}
                  disabled={isSubmitting || !!jobId}
                />

                {fetchingMainInfo && (
                  <div style={{ fontSize: "12px", color: "var(--color-graphite)", display: "flex", alignItems: "center", gap: "6px" }}>
                    <span className="animate-spin">⟳</span> Menghitung total halaman dokumen...
                  </div>
                )}
              </div>

              {/* Step 2: Document to Insert */}
              <div className="card" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <h3 style={{ fontSize: "15px", fontWeight: 500, color: "var(--color-midnight-ink)" }}>
                  2. Dokumen yang Ingin Disisipkan
                </h3>
                <p style={{ fontSize: "12.5px", color: "var(--color-graphite)", marginTop: "-6px" }}>
                  Unggah berkas lampiran, cover depan, lembar pengesahan, atau dokumen lain.
                </p>

                <FileUpload
                  accept=".pdf,.docx,.xlsx,.pptx,.jpg,.jpeg,.png"
                  maxSizeMB={50}
                  onFileSelected={handleInsertDocSelect}
                  onFileClear={() => { setInsertDoc(null); setJobId(null); setDoneJob(null); }}
                  disabled={isSubmitting || !!jobId}
                />
              </div>

              {/* Step 3: Insertion Position Options */}
              {mainDoc && insertDoc && (
                <div className="card animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <h3 style={{ fontSize: "15px", fontWeight: 500, color: "var(--color-midnight-ink)" }}>
                    3. Posisi Penyisipan Dokumen
                  </h3>

                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {/* Option 1: Start (Di Awal) */}
                    <div
                      onClick={() => !jobId && setInsertPos("start")}
                      style={{
                        padding: "12px 14px",
                        borderRadius: "var(--radius-inputs)",
                        border: `1px solid ${insertPos === "start" ? "var(--color-electric-blue)" : "var(--color-ash)"}`,
                        background: insertPos === "start" ? "var(--color-canvas-white)" : "var(--color-canvas-white)",
                        cursor: jobId ? "default" : "pointer",
                        transition: "var(--transition-fast)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
                        <input
                          type="radio"
                          name="insertPos"
                          checked={insertPos === "start"}
                          onChange={() => setInsertPos("start")}
                          disabled={!!jobId}
                        />
                        <span style={{ fontWeight: 500, fontSize: "13.5px", color: "var(--color-midnight-ink)" }}>
                          Di Awal Dokumen (Prepend / Cover Depan)
                        </span>
                      </div>
                      <p style={{ fontSize: "12px", color: "var(--color-graphite)", marginLeft: "24px" }}>
                        Dokumen sisipan akan diletakkan di halaman pertama sebelum dokumen utama.
                      </p>
                    </div>

                    {/* Option 2: End (Di Akhir) */}
                    <div
                      onClick={() => !jobId && setInsertPos("end")}
                      style={{
                        padding: "12px 14px",
                        borderRadius: "var(--radius-inputs)",
                        border: `1px solid ${insertPos === "end" ? "var(--color-electric-blue)" : "var(--color-ash)"}`,
                        background: insertPos === "end" ? "var(--color-canvas-white)" : "var(--color-canvas-white)",
                        cursor: jobId ? "default" : "pointer",
                        transition: "var(--transition-fast)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
                        <input
                          type="radio"
                          name="insertPos"
                          checked={insertPos === "end"}
                          onChange={() => setInsertPos("end")}
                          disabled={!!jobId}
                        />
                        <span style={{ fontWeight: 500, fontSize: "13.5px", color: "var(--color-midnight-ink)" }}>
                          Di Akhir Dokumen (Append / Lampiran Belakang)
                        </span>
                      </div>
                      <p style={{ fontSize: "12px", color: "var(--color-graphite)", marginLeft: "24px" }}>
                        Dokumen sisipan akan diletakkan setelah halaman terakhir dokumen utama.
                      </p>
                    </div>

                    {/* Option 3: Custom Page (Di Antara Halaman Tertentu) */}
                    <div
                      onClick={() => !jobId && setInsertPos("custom")}
                      style={{
                        padding: "12px 14px",
                        borderRadius: "var(--radius-inputs)",
                        border: `1px solid ${insertPos === "custom" ? "var(--color-electric-blue)" : "var(--color-ash)"}`,
                        background: insertPos === "custom" ? "var(--color-canvas-white)" : "var(--color-canvas-white)",
                        cursor: jobId ? "default" : "pointer",
                        transition: "var(--transition-fast)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
                        <input
                          type="radio"
                          name="insertPos"
                          checked={insertPos === "custom"}
                          onChange={() => setInsertPos("custom")}
                          disabled={!!jobId}
                        />
                        <span style={{ fontWeight: 500, fontSize: "13.5px", color: "var(--color-midnight-ink)" }}>
                          Kustom (Di Antara Halaman Tertentu)
                        </span>
                      </div>
                      <p style={{ fontSize: "12px", color: "var(--color-graphite)", marginLeft: "24px" }}>
                        Sisipkan dokumen di tengah-tengah halaman yang Anda tentukan.
                      </p>

                      {insertPos === "custom" && (
                        <div style={{ marginTop: "10px", marginLeft: "24px", display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontSize: "12.5px", color: "var(--color-midnight-ink)" }}>Sisipkan setelah Halaman ke-</span>
                          <input
                            type="number"
                            className="input"
                            min={1}
                            max={mainDocPages}
                            value={afterPage}
                            onChange={(e) => setAfterPage(Math.max(1, Math.min(mainDocPages, parseInt(e.target.value) || 1)))}
                            disabled={!!jobId}
                            style={{ width: "65px", height: "32px", textAlign: "center", padding: "4px" }}
                          />
                          <span style={{ fontSize: "12px", color: "var(--color-graphite)" }}>
                            (dari {mainDocPages} halaman)
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Output Name Input */}
                  <div>
                    <label style={{ fontSize: "12px", fontWeight: 500, display: "block", marginBottom: "4px", color: "var(--color-midnight-ink)" }}>
                      Nama Berkas Hasil:
                    </label>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <input
                        className="input"
                        value={customTitle}
                        onChange={(e) => setCustomTitle(e.target.value)}
                        disabled={!!jobId}
                        placeholder="cth: Laporan_Gabungan"
                        style={{ fontSize: "13px" }}
                      />
                      <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-graphite)" }}>.pdf</span>
                    </div>
                  </div>

                  {submitError && (
                    <div className="alert alert-error animate-fade-in">
                      <AlertCircle size={15} style={{ flexShrink: 0 }} />
                      <span>{submitError}</span>
                    </div>
                  )}

                  {!jobId && (
                    <button
                      className="btn btn-primary btn-lg"
                      onClick={handleProcess}
                      disabled={isSubmitting}
                      style={{ width: "100%", marginTop: "4px" }}
                    >
                      {isSubmitting ? (
                        <>
                          <span className="animate-spin">⟳</span> Memproses Penyisipan...
                        </>
                      ) : (
                        <>
                          <Combine size={16} /> Sisipkan & Gabungkan Dokumen
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}
            </>
          )}

          {/* ======================= MODE 2: FREE SEQUENCE ======================= */}
          {tabMode === "sequence" && (
            <>
              <div className="card" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3 style={{ fontSize: "15px", fontWeight: 500, color: "var(--color-midnight-ink)" }}>
                    Daftar Berkas yang Digabungkan
                  </h3>
                  {files.length > 0 && (
                    <span className="badge badge-done" style={{ fontSize: "11px" }}>
                      {files.length} Berkas
                    </span>
                  )}
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.docx,.xlsx,.pptx,.jpg,.jpeg,.png"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    handleAddFiles(e.target.files);
                    e.target.value = "";
                  }}
                  disabled={isSubmitting || !!jobId}
                />

                {files.length === 0 ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      handleAddFiles(e.dataTransfer.files);
                    }}
                    style={{
                      border: "2px dashed var(--color-ash)",
                      borderRadius: "var(--radius-cards)",
                      padding: "48px 24px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      textAlign: "center",
                      cursor: "pointer",
                      background: "var(--color-canvas-white)",
                    }}
                  >
                    <div
                      style={{
                        width: 52,
                        height: 52,
                        borderRadius: "50%",
                        background: "var(--color-canvas-white)",
                        border: "1px solid var(--color-ash)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "var(--color-electric-blue)",
                        marginBottom: "12px",
                      }}
                    >
                      <UploadCloud size={24} />
                    </div>
                    <p style={{ fontSize: "14px", fontWeight: 500, color: "var(--color-midnight-ink)", marginBottom: "4px" }}>
                      Pilih atau Tarik Beberapa Berkas ke Sini
                    </p>
                    <p style={{ fontSize: "12.5px", color: "var(--color-graphite)" }}>
                      Mendukung PDF, Word, Excel, PPTX, dan Gambar.
                    </p>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {files.map((file, idx) => (
                      <div
                        key={`${file.name}-${idx}`}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          padding: "10px 12px",
                          background: "var(--color-canvas-white)",
                          border: "1px solid var(--color-ash)",
                          borderRadius: "var(--radius-inputs)",
                        }}
                      >
                        <span
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: "50%",
                            background: "var(--color-midnight-ink)",
                            color: "var(--color-canvas-white)",
                            fontSize: "11px",
                            fontWeight: 500,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          {idx + 1}
                        </span>

                        <div style={{ flexShrink: 0 }}>{getFileIcon(file.name)}</div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-midnight-ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {file.name}
                          </p>
                          <span style={{ fontSize: "11px", color: "var(--color-graphite)" }}>{formatBytes(file.size)}</span>
                        </div>

                        {!jobId && (
                          <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
                            <button
                              type="button"
                              onClick={() => moveToStart(idx)}
                              disabled={idx === 0}
                              title="Pindahkan ke Paling Awal"
                              style={{ padding: "4px", color: idx === 0 ? "var(--color-smoke)" : "var(--color-midnight-ink)", cursor: idx === 0 ? "default" : "pointer" }}
                            >
                              <ArrowUpToLine size={15} />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveFileUp(idx)}
                              disabled={idx === 0}
                              title="Geser Naik 1 Langkah"
                              style={{ padding: "4px", color: idx === 0 ? "var(--color-smoke)" : "var(--color-midnight-ink)", cursor: idx === 0 ? "default" : "pointer" }}
                            >
                              <ChevronUp size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveFileDown(idx)}
                              disabled={idx === files.length - 1}
                              title="Geser Turun 1 Langkah"
                              style={{ padding: "4px", color: idx === files.length - 1 ? "var(--color-smoke)" : "var(--color-midnight-ink)", cursor: idx === files.length - 1 ? "default" : "pointer" }}
                            >
                              <ChevronDown size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveToEnd(idx)}
                              disabled={idx === files.length - 1}
                              title="Pindahkan ke Paling Akhir"
                              style={{ padding: "4px", color: idx === files.length - 1 ? "var(--color-smoke)" : "var(--color-midnight-ink)", cursor: idx === files.length - 1 ? "default" : "pointer" }}
                            >
                              <ArrowDownToLine size={15} />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeFile(idx)}
                              style={{ padding: "4px", color: "var(--clr-error)", cursor: "pointer", marginLeft: "4px" }}
                              title="Hapus Berkas"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}

                    {!jobId && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => fileInputRef.current?.click()}
                        style={{ alignSelf: "flex-start", marginTop: "4px" }}
                      >
                        <Plus size={14} /> Tambah Berkas Lain
                      </button>
                    )}
                  </div>
                )}
              </div>

              {files.length > 0 && (
                <div className="card animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <div>
                    <label style={{ fontSize: "12px", fontWeight: 500, display: "block", marginBottom: "4px", color: "var(--color-midnight-ink)" }}>
                      Nama Berkas Hasil:
                    </label>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <input
                        className="input"
                        value={customTitle}
                        onChange={(e) => setCustomTitle(e.target.value)}
                        disabled={!!jobId}
                        placeholder="cth: Dokumen_Gabungan"
                        style={{ fontSize: "13px" }}
                      />
                      <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-graphite)" }}>.pdf</span>
                    </div>
                  </div>

                  {submitError && (
                    <div className="alert alert-error animate-fade-in">
                      <AlertCircle size={15} style={{ flexShrink: 0 }} />
                      <span>{submitError}</span>
                    </div>
                  )}

                  {!jobId && (
                    <button
                      className="btn btn-primary btn-lg"
                      onClick={handleProcess}
                      disabled={isSubmitting || files.length < 2}
                      style={{ width: "100%", marginTop: "4px" }}
                    >
                      {isSubmitting ? (
                        <>
                          <span className="animate-spin">⟳</span> Menyiapkan Penggabungan...
                        </>
                      ) : (
                        <>
                          <Combine size={16} /> Gabungkan {files.length} Berkas Sekarang
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* =========================================================================
            RIGHT COLUMN: Live Visual Assembly Flow Diagram & Processing Card
            ========================================================================= */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {isDone && documentId ? (
            <div className="result-panel animate-fade-in">
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div className="stat-icon green" style={{ width: 44, height: 44, borderRadius: "50%" }}>
                  <CheckCircle2 size={22} style={{ color: "var(--clr-success)" }} />
                </div>
                <div>
                  <h3 style={{ fontSize: "16px", fontWeight: 500, color: "var(--color-midnight-ink)" }}>
                    Dokumen Berhasil Digabungkan!
                  </h3>
                  <p style={{ fontSize: "13px", color: "var(--color-graphite)" }}>
                    Hasil penggabungan sesuai posisi yang Anda pilih telah selesai dan siap diunduh.
                  </p>
                </div>
              </div>

              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "4px" }}>
                <DownloadLink href={getDownloadUrl(documentId)} download style={{ flex: "1 1 auto" }}>
                  <button className="btn btn-primary btn-lg" style={{ width: "100%" }}>
                    <Download size={16} /> Unduh PDF Hasil
                  </button>
                </DownloadLink>
                <button className="btn btn-secondary btn-lg" onClick={handleReset} style={{ flex: "1 1 auto" }}>
                  <RotateCcw size={15} /> Gabungkan Berkas Lain
                </button>
              </div>
            </div>
          ) : (
            /* Visual Flow Assembly Canvas */
            <div className="card" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Sparkles size={16} style={{ color: "var(--color-electric-blue)" }} />
                <h3 style={{ fontSize: "15px", fontWeight: 500, color: "var(--color-midnight-ink)" }}>
                  Visual Struktur Hasil Dokumen
                </h3>
              </div>

              {tabMode === "insert" ? (
                mainDoc && insertDoc ? (
                  /* Visual Flow Blocks for Insertion */
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <p style={{ fontSize: "12.5px", color: "var(--color-graphite)" }}>
                      Struktur urutan halaman hasil penggabungan:
                    </p>

                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                        background: "var(--color-canvas-white)",
                        padding: "16px",
                        borderRadius: "var(--radius-inputs)",
                        border: "1px solid var(--color-ash)",
                      }}
                    >
                      {insertPos === "start" && (
                        <>
                          <div style={{ padding: "10px", background: "var(--color-active-blue)", border: "1px solid var(--color-electric-blue)", borderRadius: "var(--radius-cardssmall)", fontSize: "12.5px", fontWeight: 500, color: "var(--color-electric-blue)" }}>
                            ⚡ [DI AWAL] {insertDoc.name}
                          </div>
                          <div style={{ textAlign: "center", color: "var(--color-graphite)" }}>↓ disambung dengan</div>
                          <div style={{ padding: "10px", background: "var(--color-canvas-white)", border: "1px solid var(--color-ash)", borderRadius: "var(--radius-cardssmall)", fontSize: "12.5px", color: "var(--color-midnight-ink)" }}>
                            📄 [DOKUMEN UTAMA] {mainDoc.name} (Hal 1 s/d {mainDocPages})
                          </div>
                        </>
                      )}

                      {insertPos === "end" && (
                        <>
                          <div style={{ padding: "10px", background: "var(--color-canvas-white)", border: "1px solid var(--color-ash)", borderRadius: "var(--radius-cardssmall)", fontSize: "12.5px", color: "var(--color-midnight-ink)" }}>
                            📄 [DOKUMEN UTAMA] {mainDoc.name} (Hal 1 s/d {mainDocPages})
                          </div>
                          <div style={{ textAlign: "center", color: "var(--color-graphite)" }}>↓ disambung dengan</div>
                          <div style={{ padding: "10px", background: "var(--color-active-blue)", border: "1px solid var(--color-electric-blue)", borderRadius: "var(--radius-cardssmall)", fontSize: "12.5px", fontWeight: 500, color: "var(--color-electric-blue)" }}>
                            ⚡ [DI AKHIR] {insertDoc.name}
                          </div>
                        </>
                      )}

                      {insertPos === "custom" && (
                        <>
                          <div style={{ padding: "8px 10px", background: "var(--color-canvas-white)", border: "1px solid var(--color-ash)", borderRadius: "var(--radius-cardssmall)", fontSize: "12px", color: "var(--color-midnight-ink)" }}>
                            📄 [DOKUMEN UTAMA] Halaman 1 s/d {afterPage}
                          </div>
                          <div style={{ textAlign: "center", color: "var(--color-electric-blue)", fontSize: "11px", fontWeight: 500 }}>
                            ⚡ DISISIPKAN DI SINI (Setelah Hal {afterPage}) ⚡
                          </div>
                          <div style={{ padding: "8px 10px", background: "var(--color-active-blue)", border: "1px solid var(--color-electric-blue)", borderRadius: "var(--radius-cardssmall)", fontSize: "12.5px", fontWeight: 500, color: "var(--color-electric-blue)" }}>
                            📄 {insertDoc.name}
                          </div>
                          {afterPage < mainDocPages && (
                            <>
                              <div style={{ textAlign: "center", color: "var(--color-graphite)", fontSize: "11px" }}>↓ dilanjutkan dengan</div>
                              <div style={{ padding: "8px 10px", background: "var(--color-canvas-white)", border: "1px solid var(--color-ash)", borderRadius: "var(--radius-cardssmall)", fontSize: "12px", color: "var(--color-midnight-ink)" }}>
                                📄 [DOKUMEN UTAMA] Halaman {afterPage + 1} s/d {mainDocPages}
                              </div>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: "center", padding: "40px 16px", color: "var(--color-graphite)", fontSize: "13px" }}>
                    Pilih Dokumen Utama dan Dokumen Sisipan di sebelah kiri untuk melihat simulasi alur penyisipan.
                  </div>
                )
              ) : (
                /* Sequence Mode Tips */
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "13px", color: "var(--color-graphite)", lineHeight: 1.55 }}>
                  <p>
                    <strong>Pengaturan Posisi Instan:</strong> Gunakan ikon panah ke garis atas/bawah untuk langsung memindahkan dokumen ke urutan paling pertama (cover) atau paling terakhir (lampiran).
                  </p>
                  <p>
                    <strong>Lintas Format:</strong> Anda dapat mencampur dokumen PDF, Word, Excel, PPTX, dan Gambar JPG/PNG dalam antrean yang sama.
                  </p>
                </div>
              )}

              <div style={{ borderTop: "1px solid var(--color-ash)", paddingTop: "12px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12.5px" }}>
                <span style={{ color: "var(--color-graphite)" }}>Hasil tersimpan otomatis</span>
                <Link href="/riwayat-dokumen" style={{ color: "var(--color-electric-blue)", fontWeight: 500 }}>
                  Buka Riwayat Dokumen →
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
      {/* Processing Modal Overlay */}
      <ProcessingModal
        isOpen={isSubmitting || isPolling || Boolean((pollError || submitError) && jobId && !isDone)}
        title="Sedang Menggabungkan Dokumen"
        subtitle="Mohon tunggu sebentar, sistem sedang menyatukan seluruh berkas dan halaman dokumen Anda."
        filename={tabMode === "insert" ? (mainDoc?.name || "Dokumen") : `${files.length} Dokumen Terpilih`}
        targetFormat="PDF"
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
        feature="merger"
      />
    </div>
  );
}
