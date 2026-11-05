"use client";

import PageHeading from "@/components/ui/PageHeading";
import ToolStorage from "@/components/ToolStorage";

import { formatBytes } from "@/lib/format";
import { isImageFile, validateImageFile, MAX_DOC_MB, MAX_MULTI_IMAGES } from "@/lib/file-validation";
import { getConversionFormats, type ConversionFormat as OutputFormat } from "@/lib/conversion-formats";

import { useFilePreview } from "@/hooks/useFilePreview";
import DownloadLink from "@/components/DownloadLink";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import FileUpload from "@/components/FileUpload";
import ProcessingModal from "@/components/ProcessingModal";
import FeatureGuideModal, { GuideButton } from "@/components/FeatureGuideModal";
import { useJobPolling } from "@/hooks/useJobPolling";
import { convertFile, getDownloadUrl, getPreviewUrl, getDocument, JobStatus, DocumentItem } from "@/lib/api";
import { showToast } from "@/components/Toast";
import {
  FileOutput,
  Download,
  ArrowRight,
  AlertCircle,
  RefreshCw,
  Eye,
  Maximize2,
  ExternalLink,
  FileText,
  FileSpreadsheet,
  Presentation,
  FileImage,
  Archive,
  X,
  Sparkles,
  Plus,
  ChevronUp,
  ChevronDown,
} from "lucide-react";

const FORMAT_LABELS: Record<string, string> = {
  pdf: "Dokumen PDF (.pdf)",
  docx: "Microsoft Word (.docx)",
  jpg: "Gambar JPEG (.jpg)",
  png: "Gambar PNG (.png)",
};

function ImageItemPreview({ file }: { file: File }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    // Blob URLs are external resources, created and revoked together in this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSrc(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]);

  return (
    <div
      style={{
        width: "38px",
        height: "38px",
        borderRadius: "var(--radius-cardssmall)",
        overflow: "hidden",
        background: "var(--color-canvas-white)",
        border: "1px solid var(--color-ash)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {src ? (
        <img
          src={src}
          alt={file.name}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      ) : (
        <FileImage size={18} style={{ color: "var(--color-electric-blue)" }} />
      )}
    </div>
  );
}

function getFormatIcon(ext: string) {
  const cleanExt = ext.replace(".", "").toLowerCase();
  if (cleanExt === "pdf") return <FileText size={20} style={{ color: "var(--clr-error)" }} />;
  if (["doc", "docx"].includes(cleanExt)) return <FileText size={20} style={{ color: "var(--color-electric-blue)" }} />;
  if (["xls", "xlsx"].includes(cleanExt)) return <FileSpreadsheet size={20} style={{ color: "var(--clr-success)" }} />;
  if (["ppt", "pptx"].includes(cleanExt)) return <Presentation size={20} style={{ color: "var(--clr-warning)" }} />;
  if (["jpg", "jpeg", "png"].includes(cleanExt)) return <FileImage size={20} style={{ color: "var(--color-electric-blue)" }} />;
  if (cleanExt === "zip") return <Archive size={20} style={{ color: "var(--color-electric-blue)" }} />;
  return <FileText size={20} style={{ color: "var(--color-midnight-ink)" }} />;
}

export default function ConverterPage() {
  const [saveToWorkspace, setSaveToWorkspace] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [outputFormat, setOutputFormat] = useState<OutputFormat | "">("");
  const [customTitle, setCustomTitle] = useState<string>("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [docId, setDocId] = useState<string | null>(null);
  const [doneJob, setDoneJob] = useState<JobStatus | null>(null);
  const [docDetails, setDocDetails] = useState<DocumentItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [isFileLoading, setIsFileLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const addImageInputRef = useRef<HTMLInputElement>(null);

  const { job, isPolling, error: pollError, elapsedSeconds } = useJobPolling(jobId, {
    onDone: async (j) => {
      setDoneJob(j);
      setLoading(false);
      if (j.document_id) {
        const res = await getDocument(j.document_id);
        if (res.success && res.data) {
          setDocDetails(res.data);
        }
      }
      showToast("success", "Dokumen berhasil dikonversi!", "Konversi Berhasil");
    },
    onFailed: (j) => {
      setLoading(false);
      showToast("error", j.error || "Proses konversi gagal.", "Konversi Gagal");
    },
  });

  const isMultiImage = files.length > 1 && files.every((f) => isImageFile(f.name));
  const isImageMode = files.length > 0 && files.every((f) => isImageFile(f.name));
  const primaryFile = files[0] || null;

  const availableFormats = getConversionFormats(files);

  const isDone = doneJob?.status === "done";

  // Handle files selected from FileUpload dropzone
  const handleFilesSelected = async (selectedFiles: File[]) => {
    if (!selectedFiles || selectedFiles.length === 0) return;

    if (selectedFiles.length > 1) {
      if (selectedFiles.length > MAX_MULTI_IMAGES) {
        showToast(
          "error",
          `Maksimal ${MAX_MULTI_IMAGES} gambar yang dapat dipilih sekaligus. Anda memilih ${selectedFiles.length} berkas.`,
          "Batas Jumlah Berkas"
        );
        return;
      }

      setIsFileLoading(true);
      const validImages: File[] = [];
      const invalidErrors: string[] = [];

      for (const f of selectedFiles) {
        const res = await validateImageFile(f);
        if (res.valid) {
          validImages.push(f);
        } else if (res.error) {
          invalidErrors.push(res.error);
        }
      }
      setIsFileLoading(false);

      if (invalidErrors.length > 0) {
        showToast("warning", invalidErrors[0], "Validasi Gambar");
      }

      if (validImages.length === 0) {
        showToast("error", "Tidak ada gambar yang memenuhi aturan validasi backend.", "Gagal Memilih");
        return;
      }

      setFiles(validImages);
      setOutputFormat("pdf");
    } else {
      const f = selectedFiles[0];
      if (isImageFile(f.name)) {
        setIsFileLoading(true);
        const res = await validateImageFile(f);
        setIsFileLoading(false);
        if (!res.valid) {
          showToast("error", res.error || "Berkas gambar tidak memenuhi aturan validasi.", "Validasi Gambar");
          return;
        }
        setFiles([f]);
        setOutputFormat("pdf");
      } else {
        setFiles([f]);
        const exts = getConversionFormats([f]);
        setOutputFormat(exts.length === 1 ? exts[0] : "");
      }
    }

    setJobId(null);
    setDoneJob(null);
    setDocDetails(null);
    setErrorMsg(null);
    setIsFullscreen(false);
  };

  const handleAppendImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = e.target.files ? Array.from(e.target.files) : [];
    if (newFiles.length === 0) return;

    if (files.length + newFiles.length > MAX_MULTI_IMAGES) {
      showToast(
        "error",
        `Total gambar tidak boleh melebihi ${MAX_MULTI_IMAGES}. Saat ini sudah ada ${files.length} gambar.`,
        "Batas Jumlah Gambar"
      );
      if (addImageInputRef.current) addImageInputRef.current.value = "";
      return;
    }

    setIsFileLoading(true);
    const validImages: File[] = [];
    const invalidErrors: string[] = [];

    for (const f of newFiles) {
      const res = await validateImageFile(f);
      if (res.valid) {
        validImages.push(f);
      } else if (res.error) {
        invalidErrors.push(res.error);
      }
    }
    setIsFileLoading(false);

    if (invalidErrors.length > 0) {
      showToast("warning", invalidErrors[0], "Validasi Gambar");
    }

    if (validImages.length > 0) {
      setFiles((prev) => [...prev, ...validImages]);
      setOutputFormat("pdf");
      showToast("info", `${validImages.length} gambar baru berhasil ditambahkan (total: ${files.length + validImages.length}).`, "Gambar Ditambahkan");
    }

    if (addImageInputRef.current) addImageInputRef.current.value = "";
  };

  const handleRemoveImage = (index: number) => {
    setFiles((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0) {
        resetAll();
      }
      return next;
    });
  };

  const handleMoveImage = (index: number, direction: "up" | "down") => {
    setFiles((prev) => {
      const next = [...prev];
      const targetIdx = direction === "up" ? index - 1 : index + 1;
      if (targetIdx < 0 || targetIdx >= next.length) return prev;
      const temp = next[index];
      next[index] = next[targetIdx];
      next[targetIdx] = temp;
      return next;
    });
  };

  const handleProcess = async () => {
    if (files.length === 0 || !outputFormat) return;
    setLoading(true);
    setErrorMsg(null);
    setDoneJob(null);
    setDocDetails(null);

    const payload = files.length === 1 ? files[0] : files;
    const res = await convertFile(payload, outputFormat, customTitle || undefined, saveToWorkspace);

    if (!res.success || !res.data) {
      setLoading(false);
      const msg = res.error || "Gagal memulai proses konversi";
      setErrorMsg(msg);
      showToast("error", msg, "Kendala Konversi");
      return;
    }


    setJobId(res.data.job_id);
    setDocId(res.data.document_id);
  };

  const resetAll = () => {
    setFiles([]);
    setJobId(null);
    setDoneJob(null);
    setDocDetails(null);
    setDocId(null);
    setOutputFormat("");
    setCustomTitle("");
    setErrorMsg(null);
    setIsFullscreen(false);
  };

  const totalInputSize = files.reduce((acc, f) => acc + f.size, 0);

  // Detected format output info
  const defaultStem = files.length > 1
    ? `${files[0]?.name.split(".")[0] || "dokumen"}_gabungan`
    : (files[0]?.name.split(".")[0] || "dokumen");
  const outputFileName = docDetails?.custom_name || `${defaultStem}_converted.${outputFormat}`;
  const outputExt = outputFileName.split(".").pop()?.toLowerCase() || outputFormat.toLowerCase() || "";
  const isPdfOutput = outputExt === "pdf";
  const isImageOutput = ["jpg", "jpeg", "png"].includes(outputExt);
  const isZipOutput = outputExt === "zip" || outputFileName.toLowerCase().endsWith(".zip");
  const isDocxOutput = ["docx", "doc"].includes(outputExt);

  const previewUrl = useFilePreview(isDone && docId && (isPdfOutput || isImageOutput) ? getPreviewUrl(docId) : null);

  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
      {/* Header */}
      <div className="page-header" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
          <PageHeading title="Konversi dokumen" description="Ubah format dokumen atau gabungkan gambar menjadi PDF." />
          <GuideButton onClick={() => setShowGuide(true)} />
        </div>
      <ToolStorage value={saveToWorkspace} onChange={setSaveToWorkspace} disabled={Boolean(jobId)} documentId={docId} done={isDone} />


      {isDone && docId ? (
        /* =========================================================================
           RICH RESULT VIEW (Interactive Document Preview & Metadata Panel)
           ========================================================================= */
        <div
          className="animate-fade-in"
          style={{
            maxWidth: "840px",
            margin: "0 auto",
            width: "100%",
            display: "flex",
            flexDirection: "column",
            gap: "24px",
          }}
        >
          {/* Interactive Document Preview Container */}
          <div
            className="card"
            style={{
              padding: "var(--card-padding)",
              display: "flex",
              flexDirection: "column",
              gap: "16px",
              overflow: "hidden",
            }}
          >
            {/* Preview Toolbar Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "10px",
                paddingBottom: "12px",
                borderBottom: "1px solid var(--color-ash)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Eye size={17} style={{ color: "var(--color-electric-blue)" }} />
                <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--color-midnight-ink)" }}>
                  Pratinjau Hasil Dokumen
                </span>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 500,
                    padding: "2px 8px",
                    borderRadius: "var(--radius-cardssmall)",
                    background: "var(--color-canvas-white)",
                    color: "var(--color-graphite)",
                    border: "1px solid var(--color-ash)",
                  }}
                >
                  .{outputExt.toUpperCase()}
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {(isPdfOutput || isImageOutput) && (
                  <>
                    <a
                      href={previewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "5px" }}
                      title="Buka pratinjau di tab browser baru"
                    >
                      <ExternalLink size={13} /> Buka di Tab Baru
                    </a>
                    <button
                      type="button"
                      onClick={() => setIsFullscreen(true)}
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "5px" }}
                      title="Tampilkan pratinjau layar penuh"
                    >
                      <Maximize2 size={13} /> Layar Penuh
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Preview Frame Viewports */}
            {isPdfOutput ? (
              <div
                style={{
                  width: "100%",
                  height: "520px",
                  borderRadius: "var(--radius-cardssmall)",
                  overflow: "hidden",
                  border: "1px solid var(--color-ash)",
                  background: "var(--color-graphite)",
                  boxShadow: "none",
                }}
              >
                <iframe
                  src={previewUrl ? `${previewUrl}#toolbar=1&navpanes=0` : undefined}
                  title="Pratinjau Dokumen PDF"
                  style={{ width: "100%", height: "100%", border: "none" }}
                />
              </div>
            ) : isImageOutput ? (
              <div
                style={{
                  width: "100%",
                  minHeight: "300px",
                  maxHeight: "480px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "var(--color-canvas-white)",
                  borderRadius: "var(--radius-cardssmall)",
                  padding: "16px",
                  border: "1px solid var(--color-ash)",
                  overflow: "hidden",
                }}
              >
                <img
                  src={previewUrl}
                  alt="Pratinjau Gambar Hasil Konversi"
                  style={{
                    maxWidth: "100%",
                    maxHeight: "440px",
                    objectFit: "contain",
                    borderRadius: "var(--radius-cardssmall)",
                    boxShadow: "none",
                  }}
                />
              </div>
            ) : isZipOutput ? (
              <div
                style={{
                  padding: "36px 20px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  gap: "14px",
                  background: "var(--color-canvas-white)",
                  borderRadius: "var(--radius-cardssmall)",
                  border: "1px dashed var(--color-ash)",
                }}
              >
                <div
                  style={{
                    width: "56px",
                    height: "56px",
                    borderRadius: "16px",
                    background: "var(--color-active-blue)",
                    color: "var(--color-electric-blue)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Archive size={28} />
                </div>
                <div>
                  <h4 style={{ fontSize: "15px", fontWeight: 500, color: "var(--color-midnight-ink)", margin: 0 }}>
                    Arsip Gambar Multi-Halaman (.ZIP)
                  </h4>
                  <p style={{ fontSize: "13px", color: "var(--color-graphite)", marginTop: "4px", margin: 0, maxWidth: "460px" }}>
                    Semua halaman PDF telah berhasil dirender menjadi berkas gambar beresolusi tinggi dan dikemas ke dalam arsip ZIP siap diekstrak.
                  </p>
                </div>
              </div>
            ) : isDocxOutput ? (
              <div
                style={{
                  padding: "36px 20px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  gap: "14px",
                  background: "var(--color-canvas-white)",
                  borderRadius: "var(--radius-cardssmall)",
                  border: "1px dashed var(--color-ash)",
                }}
              >
                <div
                  style={{
                    width: "56px",
                    height: "56px",
                    borderRadius: "16px",
                    background: "var(--color-canvas-white)",
                    color: "var(--color-electric-blue)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <FileText size={28} />
                </div>
                <div>
                  <h4 style={{ fontSize: "15px", fontWeight: 500, color: "var(--color-midnight-ink)", margin: 0 }}>
                    Dokumen Microsoft Word (.DOCX)
                  </h4>
                  <p style={{ fontSize: "13px", color: "var(--color-graphite)", marginTop: "4px", margin: 0, maxWidth: "460px" }}>
                    Berkas Word hasil konversi siap dibuka dan diedit secara penuh menggunakan Microsoft Word, Google Docs, atau LibreOffice Writer.
                  </p>
                </div>
              </div>
            ) : null}

            {/* Comparison Details Grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: "12px",
                marginTop: "4px",
              }}
            >
              {/* Box 1: File Asal */}
              <div
                style={{
                  padding: "14px",
                  borderRadius: "var(--radius-cardssmall)",
                  background: "var(--color-canvas-white)",
                  border: "1px solid var(--color-ash)",
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                }}
              >
                <div style={{ flexShrink: 0 }}>
                  {files.length > 1 ? <FileImage size={20} style={{ color: "var(--color-electric-blue)" }} /> : primaryFile ? getFormatIcon(primaryFile.name) : <FileText size={20} />}
                </div>
                <div style={{ minWidth: 0 }}>
                  <span style={{ fontSize: "11px", color: "var(--color-graphite)", fontWeight: 500, display: "block" }}>
                    Berkas Sumber (Asal)
                  </span>
                  <p style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-midnight-ink)", margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {files.length > 1 ? `${files.length} Berkas Gambar` : primaryFile?.name || "Dokumen Sumber"}
                  </p>
                  <span style={{ fontSize: "11.5px", color: "var(--color-graphite)" }}>
                    {formatBytes(totalInputSize)}
                  </span>
                </div>
              </div>

              {/* Box 2: File Hasil */}
              <div
                style={{
                  padding: "14px",
                  borderRadius: "var(--radius-cardssmall)",
                  background: "var(--color-canvas-white)",
                  border: "1px solid var(--color-ash)",
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                }}
              >
                <div style={{ flexShrink: 0 }}>{getFormatIcon(outputFileName)}</div>
                <div style={{ minWidth: 0 }}>
                  <span style={{ fontSize: "11px", color: "var(--color-graphite)", fontWeight: 500, display: "block" }}>
                    Berkas Hasil Konversi
                  </span>
                  <p style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-midnight-ink)", margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {outputFileName}
                  </p>
                  <span style={{ fontSize: "11.5px", color: "var(--color-graphite)" }}>
                    {docDetails?.output_size ? formatBytes(docDetails.output_size) : "Optimal"}
                  </span>
                </div>
              </div>
            </div>

            {/* Bottom Actions Toolbar */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "12px",
                paddingTop: "12px",
                borderTop: "1px solid var(--color-ash)",
              }}
            >
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <DownloadLink
                  href={getDownloadUrl(docId)}
                  download
                  className="btn btn-primary btn-lg"
                  style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}
                >
                  <Download size={18} /> Unduh Berkas Hasil
                </DownloadLink>
                <button
                  type="button"
                  className="btn btn-secondary btn-lg"
                  onClick={resetAll}
                  style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}
                >
                  <RefreshCw size={16} /> Konversi Dokumen Lain
                </button>
              </div>

              <Link
                href="/riwayat-dokumen"
                style={{
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "var(--color-electric-blue)",
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                Buka di Riwayat Dokumen <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </div>
      ) : (
        /* =========================================================================
           FORM & SETUP GRID (Before conversion is finished)
           ========================================================================= */
        <div className="grid-2" style={{ alignItems: "start" }}>
          {/* Upload & Setup Column */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

            {/* Case A: No file selected yet */}
            {files.length === 0 && (
              <div className="card">
                <h3 style={{ fontSize: "15px", fontWeight: 500, marginBottom: "14px", color: "var(--color-midnight-ink)" }}>
                  Pilih Dokumen atau Gambar
                </h3>
                <FileUpload
                  accept=".pdf,.docx,.xlsx,.pptx,.jpg,.jpeg,.png"
                  label="Pilih atau Letakkan Berkas"
                  description="Mendukung PDF, Word, Excel, PPT, atau pilih banyak Gambar (JPG/PNG)"
                  onFilesSelected={handleFilesSelected}
                  onFileSelected={(f) => handleFilesSelected([f])}
                  onFileClear={resetAll}
                  onLoadingChange={setIsFileLoading}
                  disabled={isPolling || loading}
                  multiple={true}
                />
              </div>
            )}

            {/* Case B: Single Non-Image Document (PDF / DOCX / XLSX / PPTX) */}
            {files.length === 1 && !isImageMode && (
              <div className="card">
                <h3 style={{ fontSize: "15px", fontWeight: 500, marginBottom: "14px", color: "var(--color-midnight-ink)" }}>
                  Dokumen Sumber Terpilih
                </h3>
                <FileUpload
                  accept=".pdf,.docx,.xlsx,.pptx,.jpg,.jpeg,.png"
                  label="Pilih atau Letakkan File"
                  description="Mendukung PDF, Word, Excel, PPT, dan Gambar"
                  onFilesSelected={handleFilesSelected}
                  onFileSelected={(f) => handleFilesSelected([f])}
                  onFileClear={resetAll}
                  onLoadingChange={setIsFileLoading}
                  disabled={isPolling || loading}
                  multiple={true}
                />
              </div>
            )}

            {/* Case C: Image Mode (1 or more JPG/PNG files) */}
            {isImageMode && (
              <div className="card animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                {/* List Header Toolbar */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px", borderBottom: "1px solid var(--color-ash)", paddingBottom: "10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div
                      style={{
                        width: "26px",
                        height: "26px",
                        borderRadius: "var(--radius-cardssmall)",
                        background: "var(--color-active-blue)",
                        color: "var(--color-electric-blue)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 500,
                        fontSize: "12px",
                      }}
                    >
                      {files.length}
                    </div>
                    <div>
                      <h4 style={{ fontSize: "14px", fontWeight: 500, color: "var(--color-midnight-ink)", margin: 0 }}>
                        {files.length} Berkas Gambar Dipilih
                      </h4>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "2px", flexWrap: "wrap" }}>
                        <span
                          style={{
                            fontSize: "11.5px",
                            color: totalInputSize > MAX_DOC_MB * 1024 * 1024 ? "#dc2626" : "var(--color-graphite)",
                            fontWeight: 500,
                          }}
                        >
                          Total ukuran: <strong>{formatBytes(totalInputSize)}</strong> / 35 MB
                        </span>
                        {totalInputSize > MAX_DOC_MB * 1024 * 1024 && (
                          <span
                            style={{
                              fontSize: "10px",
                              fontWeight: 500,
                              padding: "1px 6px",
                              borderRadius: "var(--radius-cardssmall)",
                              background: "var(--clr-error-bg)",
                              color: "var(--clr-error)",
                              border: "1px solid var(--clr-error-border)",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "3px",
                            }}
                          >
                            <AlertCircle size={11} /> Melebihi Batas
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    {/* Add More Images Button */}
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => addImageInputRef.current?.click()}
                      disabled={isPolling || loading}
                      style={{ fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "4px" }}
                    >
                      <Plus size={13} /> Tambah Gambar
                    </button>
                    {/* Clear All */}
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={resetAll}
                      disabled={isPolling || loading}
                      style={{ fontSize: "12px", color: "var(--color-graphite)" }}
                      title="Hapus semua gambar"
                    >
                      Batal Semua
                    </button>
                    <input
                      ref={addImageInputRef}
                      type="file"
                      accept=".jpg,.jpeg,.png"
                      multiple
                      onChange={handleAppendImages}
                      style={{ display: "none" }}
                    />
                  </div>
                </div>

                {/* Reorderable Image Item List */}
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "320px", overflowY: "auto", paddingRight: "2px" }}>
                  {files.map((imgFile, idx) => (
                    <div
                      key={`${imgFile.name}-${idx}`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "8px 12px",
                        borderRadius: "var(--radius-cardssmall)",
                        background: "var(--color-canvas-white)",
                        border: "1px solid var(--color-ash)",
                        gap: "10px",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: 500,
                            color: "var(--color-graphite)",
                            minWidth: "22px",
                            textAlign: "center",
                          }}
                        >
                          #{idx + 1}
                        </span>
                        <ImageItemPreview file={imgFile} />
                        <div style={{ minWidth: 0 }}>
                          <p
                            style={{
                              fontSize: "13px",
                              fontWeight: 500,
                              color: "var(--color-midnight-ink)",
                              margin: 0,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              maxWidth: "240px",
                            }}
                          >
                            {imgFile.name}
                          </p>
                          <span style={{ fontSize: "11px", color: "var(--color-graphite)" }}>
                            {formatBytes(imgFile.size)}
                          </span>
                        </div>
                      </div>

                      {/* Item Actions */}
                      <div style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
                        <button
                          type="button"
                          onClick={() => handleMoveImage(idx, "up")}
                          disabled={idx === 0 || isPolling || loading}
                          className="btn btn-secondary btn-sm"
                          style={{ padding: "4px 6px", height: "26px" }}
                          title="Pindah ke atas"
                        >
                          <ChevronUp size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveImage(idx, "down")}
                          disabled={idx === files.length - 1 || isPolling || loading}
                          className="btn btn-secondary btn-sm"
                          style={{ padding: "4px 6px", height: "26px" }}
                          title="Pindah ke bawah"
                        >
                          <ChevronDown size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveImage(idx)}
                          disabled={isPolling || loading}
                          className="btn btn-secondary btn-sm"
                          style={{ padding: "4px 6px", height: "26px", color: "var(--clr-error)" }}
                          title="Hapus gambar ini"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {totalInputSize > MAX_DOC_MB * 1024 * 1024 ? (
                  <div
                    className="alert alert-error animate-fade-in"
                    style={{ padding: "8px 12px", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px" }}
                  >
                    <AlertCircle size={14} style={{ flexShrink: 0 }} />
                    <span>
                      Total ukuran seluruh gambar (<strong>{formatBytes(totalInputSize)}</strong>) melebihi batas maksimal <strong>35 MB</strong>. Harap kurangi sebagian gambar.
                    </span>
                  </div>
                ) : (
                  <div
                    style={{
                      padding: "8px 12px",
                      borderRadius: "var(--radius-cardssmall)",
                      background: "rgba(37, 99, 235, 0.06)",
                      border: "1px dashed rgba(37, 99, 235, 0.3)",
                      fontSize: "12px",
                      color: "var(--color-electric-blue)",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <Sparkles size={14} />
                    <span>Semua {files.length} gambar akan digabung menjadi 1 file PDF berurutan (Batas total: 35 MB).</span>
                  </div>
                )}
              </div>
            )}

            {/* Format selection */}
            {files.length > 0 && availableFormats.length > 0 && (
              <div className="card animate-fade-in" style={{ opacity: isFileLoading ? 0.6 : 1, transition: "opacity 0.2s ease" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                  <h3 style={{ fontSize: "15px", fontWeight: 500, color: "var(--color-midnight-ink)", margin: 0 }}>
                    Pilih Format Output
                  </h3>
                  {isFileLoading && (
                    <span style={{ fontSize: "11.5px", color: "var(--color-electric-blue)", display: "flex", alignItems: "center", gap: "4px" }}>
                      <span className="animate-spin">⟳</span> Menyiapkan...
                    </span>
                  )}
                </div>
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
                        cursor: (isPolling || loading || isFileLoading) ? "not-allowed" : "pointer",
                        border: `1px solid ${outputFormat === fmt ? "var(--color-electric-blue)" : "var(--color-ash)"}`,
                        background: outputFormat === fmt ? "var(--color-active-blue)" : "var(--color-canvas-white)",
                        transition: "var(--transition-fast)",
                      }}
                    >
                      <input
                        type="radio"
                        name="outputFormat"
                        value={fmt}
                        checked={outputFormat === fmt}
                        onChange={() => setOutputFormat(fmt)}
                        disabled={isPolling || loading || isFileLoading || isImageMode}
                        style={{ accentColor: "var(--color-electric-blue)" }}
                      />
                      <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--color-midnight-ink)" }}>
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
                  style={{ alignSelf: "flex-start", background: "var(--color-canvas-white)" }}
                >
                  <RefreshCw size={13} /> Coba Lagi
                </button>
              </div>
            )}

            {/* Main Action Button with Loading state */}
            <button
              className="btn btn-primary btn-lg"
              onClick={handleProcess}
              disabled={
                files.length === 0 ||
                !outputFormat ||
                loading ||
                isPolling ||
                isFileLoading ||
                totalInputSize > MAX_DOC_MB * 1024 * 1024
              }
              style={{ width: "100%" }}
            >
              {isFileLoading ? (
                <>
                  <span className="animate-spin">⟳</span> Menyiapkan Berkas...
                </>
              ) : loading ? (
                <>
                  <span className="animate-spin">⟳</span> Menyiapkan Konversi...
                </>
              ) : isPolling ? (
                <>
                  <span className="animate-spin">⟳</span> Sedang Mengonversi Dokumen...
                </>
              ) : (
                <>
                  {isMultiImage
                    ? `Konversi & Gabungkan ${files.length} Gambar ke PDF`
                    : "Konversi Sekarang"} <ArrowRight size={16} />
                </>
              )}
            </button>
          </div>

          {/* Info Column */}
          <div>
            <div className="card" style={{ background: "var(--color-canvas-white)", borderStyle: "dashed" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                <FileOutput size={18} style={{ color: "var(--color-graphite)" }} />
                <h4 style={{ fontSize: "14px", fontWeight: 500, color: "var(--color-midnight-ink)" }}>
                  Alur Pemrosesan
                </h4>
              </div>
              <p style={{ fontSize: "13px", color: "var(--color-graphite)", lineHeight: 1.6 }}>
                Unggah dokumen tunggal (PDF / Office) untuk dikonversi ke format lain, atau unggah beberapa gambar sekaligus (JPG / PNG) untuk digabungkan secara instan menjadi satu dokumen PDF siap pakai.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Lightbox Modal */}
      {isFullscreen && docId && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(10, 10, 10, 0.8)",
            backdropFilter: "blur(8px)",
            zIndex: 99999,
            display: "flex",
            flexDirection: "column",
            animation: "fadeIn 0.2s ease-out",
          }}
          onClick={() => setIsFullscreen(false)}
        >
          {/* Lightbox Topbar */}
          <div
            style={{
              padding: "14px 24px",
              background: "rgba(23, 23, 23, 0.95)",
              color: "var(--color-canvas-white)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderBottom: "1px solid rgba(255,255,255,0.1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <Eye size={18} color="var(--color-electric-blue)" />
              <span style={{ fontSize: "14px", fontWeight: 500 }}>{outputFileName}</span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <DownloadLink
                href={getDownloadUrl(docId)}
                download
                className="btn btn-primary btn-sm"
                style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
              >
                <Download size={14} /> Unduh
              </DownloadLink>
              <button
                onClick={() => setIsFullscreen(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--color-canvas-white)",
                  cursor: "pointer",
                  padding: "6px",
                  borderRadius: "var(--radius-cardssmall)",
                  display: "flex",
                }}
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Lightbox Content Area */}
          <div
            style={{
              flex: 1,
              padding: "20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {isPdfOutput ? (
              <iframe
                src={previewUrl}
                title="Pratinjau PDF Layar Penuh"
                style={{
                  width: "90%",
                  height: "90%",
                  borderRadius: "var(--radius-cardssmall)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  boxShadow: "none",
                }}
              />
            ) : isImageOutput ? (
              <img
                src={previewUrl}
                alt="Pratinjau Gambar Layar Penuh"
                style={{
                  maxWidth: "92%",
                  maxHeight: "92%",
                  objectFit: "contain",
                  borderRadius: "var(--radius-cardssmall)",
                  boxShadow: "none",
                }}
              />
            ) : null}
          </div>
        </div>
      )}

      {/* Processing Modal Overlay */}
      <ProcessingModal
        isOpen={loading || isPolling || Boolean(pollError && jobId)}
        title="Sedang Mengonversi Dokumen"
        subtitle="Mohon tunggu sebentar, sistem sedang memproses dan mengonversi berkas Anda."
        filename={files.length > 1 ? `${files.length} Berkas Gambar` : primaryFile?.name}
        targetFormat={outputFormat || undefined}
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
        feature="converter"
      />
    </div>
  );
}
