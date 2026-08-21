"use client";

import { useState, useRef, useEffect, DragEvent } from "react";
import { createPortal } from "react-dom";
import {
  Upload,
  X,
  FileText,
  AlertCircle,
  Maximize2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Layers,
  FileSearch,
} from "lucide-react";
import { fetchFirstPagePreview } from "@/lib/api";

interface FileUploadProps {
  accept?: string;
  label?: string;
  description?: string;
  maxSizeMB?: number;
  onFileSelected: (file: File) => void;
  disabled?: boolean;
}

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function FileUpload({
  accept,
  label = "Unggah Dokumen",
  description = "Seret & lepas berkas ke sini atau klik untuk memilih",
  maxSizeMB = 50,
  onFileSelected,
  disabled = false,
}: FileUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [allThumbnails, setAllThumbnails] = useState<string[]>([]);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [loadingThumbnail, setLoadingThumbnail] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // Zoom Modal State
  const [isZoomed, setIsZoomed] = useState(false);
  const [zoomScale, setZoomScale] = useState<number>(1);
  const [viewMode, setViewMode] = useState<"pages" | "native">("pages");

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Handle ESC key & lock body scroll when modal is open
  useEffect(() => {
    if (isZoomed) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isZoomed) {
        setIsZoomed(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isZoomed]);

  const validateFile = (file: File): boolean => {
    const maxBytes = maxSizeMB * 1024 * 1024;
    if (file.size > maxBytes) {
      setValidationError(`Ukuran file melebihi batas maksimum ${maxSizeMB} MB (${formatBytes(file.size)}).`);
      return false;
    }

    if (accept) {
      const allowedExts = accept.split(",").map((ext) => ext.trim().toLowerCase());
      const fileExt = "." + file.name.split(".").pop()?.toLowerCase();
      if (!allowedExts.includes(fileExt)) {
        setValidationError(`Format file "${fileExt}" tidak didukung. Format yang diterima: ${accept}`);
        return false;
      }
    }

    setValidationError(null);
    return true;
  };

  const loadThumbnail = async (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase() || "";

    // 1. If PDF, create direct Blob URL for native vector view
    if (ext === "pdf") {
      const blobUrl = URL.createObjectURL(file);
      setPdfBlobUrl(blobUrl);
    } else {
      setPdfBlobUrl(null);
    }

    // 2. Direct object URL for local image formats
    if (["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) {
      const objUrl = URL.createObjectURL(file);
      setThumbnailUrl(objUrl);
      setAllThumbnails([objUrl]);
      setTotalPages(1);
      return;
    }

    // 3. Fetch multi-page thumbnails from backend (Lossless PNG 160 DPI)
    setLoadingThumbnail(true);
    setThumbnailUrl(null);
    setAllThumbnails([]);
    try {
      const res = await fetchFirstPagePreview(file);
      if (res.success && res.data) {
        if (res.data.thumbnail) setThumbnailUrl(res.data.thumbnail);
        if (res.data.thumbnails && res.data.thumbnails.length > 0) {
          setAllThumbnails(res.data.thumbnails);
          setTotalPages(res.data.total_pages || res.data.thumbnails.length);
        } else if (res.data.thumbnail) {
          setAllThumbnails([res.data.thumbnail]);
          setTotalPages(1);
        }
      }
    } catch {
      // Fallback silently
    } finally {
      setLoadingThumbnail(false);
    }
  };

  const handleFile = (file: File) => {
    if (validateFile(file)) {
      setSelectedFile(file);
      onFileSelected(file);
      loadThumbnail(file);
    } else {
      setSelectedFile(null);
      setThumbnailUrl(null);
      setAllThumbnails([]);
      setPdfBlobUrl(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const clearFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedFile(null);
    setThumbnailUrl(null);
    setAllThumbnails([]);
    setPdfBlobUrl(null);
    setValidationError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleOpenModal = () => {
    if (allThumbnails.length > 0 || thumbnailUrl || pdfBlobUrl) {
      setZoomScale(1);
      setIsZoomed(true);
    }
  };

  const handleZoomIn = (e: React.MouseEvent) => {
    e.stopPropagation();
    setZoomScale((prev) => Math.min(2.5, +(prev + 0.25).toFixed(2)));
  };

  const handleZoomOut = (e: React.MouseEvent) => {
    e.stopPropagation();
    setZoomScale((prev) => Math.max(0.5, +(prev - 0.25).toFixed(2)));
  };

  const handleResetZoom = (e: React.MouseEvent) => {
    e.stopPropagation();
    setZoomScale(1);
  };

  const displayPages = allThumbnails.length > 0 ? allThumbnails : thumbnailUrl ? [thumbnailUrl] : [];
  const isPdf = selectedFile?.name.toLowerCase().endsWith(".pdf");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {selectedFile ? (
        <div
          className="card animate-fade-in"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            padding: "14px 16px",
            cursor: "default",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Page 1 Visual Thumbnail Box */}
          <div
            style={{
              width: 58,
              height: 72,
              borderRadius: "6px",
              background: "#f4f4f5",
              border: "1px solid var(--color-stone-border)",
              boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
              flexShrink: 0,
              overflow: "hidden",
              cursor: (thumbnailUrl || pdfBlobUrl) ? "pointer" : "default",
            }}
            onClick={handleOpenModal}
            title={(thumbnailUrl || pdfBlobUrl) ? "Klik untuk melihat pratinjau dokumen" : undefined}
          >
            {thumbnailUrl ? (
              <>
                <img
                  src={thumbnailUrl}
                  alt={`Halaman 1 - ${selectedFile.name}`}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
                {/* Hal 1 Badge */}
                <span
                  style={{
                    position: "absolute",
                    top: 2,
                    left: 2,
                    background: "rgba(12, 10, 9, 0.8)",
                    color: "#fff",
                    fontSize: "9px",
                    fontWeight: 600,
                    padding: "1px 4px",
                    borderRadius: "3px",
                    lineHeight: 1,
                  }}
                >
                  Hal 1
                </span>
                <div
                  style={{
                    position: "absolute",
                    bottom: 2,
                    right: 2,
                    background: "rgba(12, 10, 9, 0.65)",
                    color: "#fff",
                    borderRadius: "3px",
                    padding: "2px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Maximize2 size={9} />
                </div>
              </>
            ) : loadingThumbnail ? (
              <div
                className="skeleton"
                style={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "9px",
                  color: "var(--color-ash-gray)",
                  textAlign: "center",
                  padding: "4px",
                }}
              >
                <span className="animate-spin" style={{ fontSize: "12px" }}>⟳</span>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
                <FileText size={20} strokeWidth={1.5} style={{ color: "var(--color-cyan-edge)" }} />
                <span style={{ fontSize: "9px", color: "var(--color-ash-gray)", fontWeight: 500 }}>Hal 1</span>
              </div>
            )}
          </div>

          {/* File Name & Status */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p
              style={{
                fontWeight: 600,
                fontSize: "13.5px",
                color: "var(--color-ink-black)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {selectedFile.name}
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "3px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "12px", color: "var(--color-warm-gray)" }}>
                {formatBytes(selectedFile.size)}
              </span>
              <span style={{ color: "var(--color-stone-muted)" }}>•</span>
              <span style={{ fontSize: "11.5px", color: "var(--clr-success)", fontWeight: 500, display: "flex", alignItems: "center", gap: "4px" }}>
                {totalPages > 1 ? `${totalPages} Halaman tersedia` : (thumbnailUrl || pdfBlobUrl) ? "Pratinjau siap" : "Berkas siap"}
              </span>
              {(thumbnailUrl || pdfBlobUrl) && (
                <button
                  type="button"
                  onClick={handleOpenModal}
                  style={{
                    fontSize: "11.5px",
                    fontWeight: 600,
                    color: "var(--color-cyan-edge)",
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    textDecoration: "underline",
                  }}
                >
                  Buka Pratinjau Dokumen →
                </button>
              )}
            </div>
          </div>

          {/* Remove / Change File Button */}
          {!disabled && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={clearFile}
              style={{ padding: "6px", borderRadius: "9999px", flexShrink: 0 }}
              title="Ganti berkas"
            >
              <X size={15} />
            </button>
          )}
        </div>
      ) : (
        <div
          className={`dropzone ${isDragging ? "dragging" : ""}`}
          onClick={() => !disabled && inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          style={{
            opacity: disabled ? 0.6 : 1,
            cursor: disabled ? "not-allowed" : "pointer",
            borderColor: validationError ? "var(--clr-error-border)" : undefined,
          }}
        >
          <div className="dropzone-icon">
            <Upload size={38} strokeWidth={1.5} />
          </div>
          <p style={{ fontWeight: 500, fontSize: "14px", color: "var(--color-ink-black)", marginBottom: "4px" }}>
            {label}
          </p>
          <p style={{ fontSize: "13px", color: "var(--color-warm-gray)" }}>
            {description}
          </p>
          {accept && (
            <p style={{ fontSize: "11px", color: "var(--color-ash-gray)", marginTop: "8px" }}>
              Maksimum {maxSizeMB} MB · Format: {accept.replace(/\./g, "").toUpperCase()}
            </p>
          )}
        </div>
      )}

      {validationError && (
        <div className="alert alert-error animate-fade-in" style={{ padding: "10px 14px" }}>
          <AlertCircle size={15} style={{ flexShrink: 0 }} />
          <span>{validationError}</span>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleChange}
        style={{ display: "none" }}
        disabled={disabled}
      />

      {/* =========================================================================
          FULL-SCREEN PORTAL MODAL (Crisp Vector / Ultra-HD Lossless Preview)
          ========================================================================= */}
      {mounted && isZoomed && (displayPages.length > 0 || pdfBlobUrl) && createPortal(
        <div
          onClick={() => setIsZoomed(false)}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            margin: 0,
            padding: 0,
            background: "rgba(10, 9, 8, 0.82)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            zIndex: 999999,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            overflow: "hidden",
            boxSizing: "border-box",
          }}
        >
          {/* Floating Sticky Header Controls */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              top: "16px",
              left: "50%",
              transform: "translateX(-50%)",
              width: "min(960px, 94vw)",
              background: "rgba(255, 255, 255, 0.96)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              borderRadius: "14px",
              padding: "10px 20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              boxShadow: "0 10px 36px rgba(0,0,0,0.35)",
              border: "1px solid rgba(255,255,255,0.6)",
              zIndex: 100,
            }}
          >
            {/* File Info */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: "8px",
                  background: "var(--color-stone-canvas)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--color-cyan-edge)",
                  flexShrink: 0,
                }}
              >
                <Layers size={17} />
              </div>
              <div style={{ minWidth: 0 }}>
                <p
                  style={{
                    fontWeight: 600,
                    fontSize: "14px",
                    color: "var(--color-ink-black)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: "340px",
                  }}
                >
                  {selectedFile?.name}
                </p>
                <p style={{ fontSize: "12px", color: "var(--color-warm-gray)", marginTop: "1px" }}>
                  {isPdf && pdfBlobUrl && viewMode === "native"
                    ? "Mode Pembaca PDF Asli (Vektor Tajam 100%)"
                    : `${displayPages.length} Halaman · Gulir ke bawah untuk melihat halaman berikutnya`}
                </p>
              </div>
            </div>

            {/* Controls & View Mode Toggle */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              {/* PDF Native Mode Switch */}
              {isPdf && pdfBlobUrl && (
                <button
                  type="button"
                  onClick={() => setViewMode(viewMode === "native" ? "pages" : "native")}
                  className={`btn btn-sm ${viewMode === "native" ? "btn-primary" : "btn-secondary"}`}
                  style={{ fontSize: "11.5px", padding: "5px 10px", gap: "5px" }}
                  title="Ganti antara mode lembar halaman atau pembaca PDF bawaan browser"
                >
                  <FileSearch size={13} />
                  {viewMode === "native" ? "Lihat Lembar" : "Mode PDF Asli"}
                </button>
              )}

              {/* Zoom Buttons Group (Active in pages mode) */}
              {viewMode === "pages" && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    background: "var(--color-stone-canvas)",
                    borderRadius: "var(--radius-buttons)",
                    border: "1px solid var(--color-stone-border)",
                    padding: "2px",
                  }}
                >
                  <button
                    type="button"
                    onClick={handleZoomOut}
                    disabled={zoomScale <= 0.5}
                    title="Perkecil (Zoom Out)"
                    style={{
                      padding: "6px 9px",
                      color: zoomScale <= 0.5 ? "var(--color-stone-muted)" : "var(--color-ink-black)",
                      cursor: zoomScale <= 0.5 ? "default" : "pointer",
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    <ZoomOut size={15} />
                  </button>

                  <span
                    style={{
                      fontSize: "12px",
                      fontWeight: 600,
                      minWidth: "50px",
                      textAlign: "center",
                      color: "var(--color-ink-black)",
                      userSelect: "none",
                    }}
                  >
                    {Math.round(zoomScale * 100)}%
                  </span>

                  <button
                    type="button"
                    onClick={handleZoomIn}
                    disabled={zoomScale >= 2.5}
                    title="Perbesar (Zoom In)"
                    style={{
                      padding: "6px 9px",
                      color: zoomScale >= 2.5 ? "var(--color-stone-muted)" : "var(--color-ink-black)",
                      cursor: zoomScale >= 2.5 ? "default" : "pointer",
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    <ZoomIn size={15} />
                  </button>

                  <button
                    type="button"
                    onClick={handleResetZoom}
                    title="Reset Zoom (100%)"
                    style={{
                      padding: "6px 9px",
                      borderLeft: "1px solid var(--color-stone-border)",
                      color: "var(--color-warm-gray)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    <RotateCcw size={13} />
                  </button>
                </div>
              )}

              {/* Close Button */}
              <button
                type="button"
                onClick={() => setIsZoomed(false)}
                className="btn btn-secondary btn-sm"
                style={{
                  width: 34,
                  height: 34,
                  padding: 0,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                title="Tutup Pratinjau (Esc)"
              >
                <X size={17} />
              </button>
            </div>
          </div>

          {/* Viewport Content */}
          {viewMode === "native" && pdfBlobUrl ? (
            /* Native Vector PDF Viewport */
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "min(1100px, 96vw)",
                height: "calc(100vh - 120px)",
                marginTop: "84px",
                borderRadius: "12px",
                overflow: "hidden",
                boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
                background: "#ffffff",
              }}
            >
              <iframe
                src={`${pdfBlobUrl}#toolbar=1&navpanes=1`}
                style={{ width: "100%", height: "100%", border: "none" }}
                title="Pratinjau Dokumen PDF Asli"
              />
            </div>
          ) : (
            /* Multi-Page Ultra-HD Scrollable Canvas */
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "100vw",
                height: "100vh",
                overflowY: "auto",
                overflowX: "auto",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                paddingTop: "90px",
                paddingBottom: "60px",
                paddingLeft: "20px",
                paddingRight: "20px",
                gap: "36px",
                boxSizing: "border-box",
              }}
            >
              {displayPages.map((pageSrc, idx) => (
                <div
                  key={idx}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "10px",
                    transition: "transform 0.15s ease-out",
                    transform: `scale(${zoomScale})`,
                    transformOrigin: "top center",
                    width: "100%",
                    maxWidth: "900px",
                  }}
                >
                  {/* Page Number Badge */}
                  <div
                    style={{
                      background: "rgba(12, 10, 9, 0.88)",
                      color: "#fff",
                      fontSize: "11.5px",
                      fontWeight: 600,
                      padding: "4px 14px",
                      borderRadius: "9999px",
                      backdropFilter: "blur(6px)",
                      boxShadow: "0 2px 10px rgba(0,0,0,0.3)",
                      letterSpacing: "0.02em",
                    }}
                  >
                    Halaman {idx + 1} dari {displayPages.length}
                  </div>

                  {/* Page Container */}
                  <div
                    style={{
                      background: "#ffffff",
                      borderRadius: "8px",
                      boxShadow: "0 20px 50px rgba(0,0,0,0.45)",
                      border: "1px solid rgba(255,255,255,0.25)",
                      overflow: "hidden",
                      width: "100%",
                      display: "flex",
                      justifyContent: "center",
                    }}
                  >
                    <img
                      src={pageSrc}
                      alt={`Halaman ${idx + 1} - ${selectedFile?.name}`}
                      style={{
                        width: "100%",
                        height: "auto",
                        display: "block",
                        userSelect: "none",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Bottom Hint */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              bottom: "16px",
              left: "50%",
              transform: "translateX(-50%)",
              color: "rgba(255, 255, 255, 0.85)",
              fontSize: "12px",
              fontWeight: 500,
              padding: "4px 14px",
              borderRadius: "9999px",
              background: "rgba(0,0,0,0.5)",
              backdropFilter: "blur(8px)",
              pointerEvents: "none",
            }}
          >
            Tekan <kbd style={{ padding: "1px 6px", background: "rgba(255,255,255,0.25)", borderRadius: "4px" }}>Esc</kbd> atau klik di luar dokumen untuk menutup
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
