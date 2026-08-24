"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  HelpCircle,
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  FileText,
  Layers,
  Scissors,
  Minimize2,
  ShieldAlert,
  Lock,
} from "lucide-react";

export type FeatureType = "converter" | "compressor" | "splitter" | "merger" | "watermark";

interface FeatureGuideContent {
  title: string;
  badge: string;
  tagline: string;
  icon: typeof FileText;
  steps: { title: string; desc: string }[];
  limits: { label: string; value: string; note?: string }[];
  tips: string[];
}

const GUIDES: Record<FeatureType, FeatureGuideContent> = {
  converter: {
    title: "Document Converter",
    badge: "Konversi Antar Format",
    tagline: "Ubah format dokumen secara instan tanpa merusak tata letak, font, dan elemen visual.",
    icon: FileText,
    steps: [
      {
        title: "Unggah Dokumen",
        desc: "Pilih atau seret berkas sumber (PDF, Word .docx, Excel .xlsx, PowerPoint .pptx, atau Gambar JPG/PNG).",
      },
      {
        title: "Pilih Format Tujuan",
        desc: "Tentukan format output yang diinginkan dari daftar opsi yang otomatis disesuaikan.",
      },
      {
        title: "Konversi & Unduh",
        desc: "Klik tombol 'Konversi Sekarang'. Berkas hasil siap diunduh (atau dikemas dalam arsip ZIP jika PDF banyak halaman diubah ke gambar).",
      },
    ],
    limits: [
      { label: "Dokumen Office (.docx, .xlsx, .pptx)", value: "Maksimal 35 MB" },
      { label: "Dokumen PDF (.pdf)", value: "Maksimal 35 MB & Maks 50 Halaman" },
      { label: "Berkas Gambar (.jpg, .jpeg, .png)", value: "Maksimal 12 MB & Maks 6000px" },
      { label: "Kualitas Render Gambar", value: "Lossless PNG / JPG High Resolution (160 DPI)" },
    ],
    tips: [
      "Konversi dari PDF ke Word (.docx) bekerja paling optimal pada PDF dokumen digital berbasis teks.",
      "Jika PDF Anda merupakan hasil scan kamera/fisik, gunakan fitur OCR untuk hasil ekstraksi teks yang akurat.",
    ],
  },
  compressor: {
    title: "Document Compressor",
    badge: "Optimasi Ukuran",
    tagline: "Kecilkan ukuran file secara cerdas dengan menjaga ketajaman teks dan gambar tetap prima.",
    icon: Minimize2,
    steps: [
      {
        title: "Pilih Berkas",
        desc: "Unggah berkas PDF, Gambar (JPG/PNG), atau Dokumen Office yang ukurannya terlalu besar.",
      },
      {
        title: "Proses Optimasi Otomatis",
        desc: "Sistem secara cerdas menjalankan kompresi Ghostscript, kuantisasi pngquant, atau Pillow optimize.",
      },
      {
        title: "Lihat Rasio & Unduh",
        desc: "Lihat perbandingan ukuran sebelum vs sesudah dan persentase hemat ukuran, lalu unduh berkas.",
      },
    ],
    limits: [
      { label: "Batas Ukuran Dokumen / PDF", value: "Maksimal 35 MB (Maks 50 Halaman)" },
      { label: "Batas Ukuran Gambar", value: "Maksimal 12 MB & Maks 6000px" },
      { label: "Smart Protection", value: "Jika file asli sudah optimal, sistem aman mengembalikan file asli tanpa merusak kualitas." },
    ],
    tips: [
      "Kompresi gambar PNG menggunakan kuantisasi palet warna untuk memangkas ukuran hingga 70% tanpa blur.",
      "Kompresi PDF menyeimbangkan kompresi font vektor dan resolusi gambar internal menjadi 150 DPI standar web/arsip.",
    ],
  },
  splitter: {
    title: "Document Splitter",
    badge: "Pemisah Halaman",
    tagline: "Ekstrak rentang halaman penting atau pecah dokumen menjadi beberapa bagian terpisah.",
    icon: Scissors,
    steps: [
      {
        title: "Unggah Dokumen",
        desc: "Unggah berkas PDF atau Word (.docx). Sistem akan menampilkan thumbnail seluruh halaman.",
      },
      {
        title: "Tentukan Mode Pemisahan",
        desc: "Pilih 'Ekstrak Rentang' (cth: 1-3, 5, 8-10), 'Interval Tetap' (cth: per 2 hal), atau 'Pecah Semua Halaman'.",
      },
      {
        title: "Pilih Format & Unduh",
        desc: "Pilih output PDF atau Word (.docx), lalu unduh berkas hasil ekstrak atau arsip ZIP berisi semua pecahan.",
      },
    ],
    limits: [
      { label: "Batas Ukuran Berkas", value: "Maksimal 35 MB" },
      { label: "Batas Halaman", value: "Maksimal 50 Halaman per dokumen" },
      { label: "Format Rentang", value: "Angka dipisah koma atau strip (cth: 1-4, 7, 9-12)" },
    ],
    tips: [
      "Gunakan pratinjau thumbnail visual di layar untuk memastikan nomor halaman yang ingin diekstrak sudah tepat.",
      "Mode 'Pecah Semua Halaman' akan mengemas setiap halaman menjadi file 1-halaman mandiri dalam 1 berkas ZIP.",
    ],
  },
  merger: {
    title: "Document Merger",
    badge: "Penggabung Dokumen",
    tagline: "Satukan berbagai dokumen dan gambar menjadi satu berkas PDF yang rapi dan terstruktur.",
    icon: Layers,
    steps: [
      {
        title: "Pilih Mode Penggabungan",
        desc: "Pilih mode 'Susun Antrean (Sequence)' untuk banyak file berurutan, atau mode 'Sisip Dokumen (Insert)'.",
      },
      {
        title: "Unggah & Atur Posisi",
        desc: "Unggah minimal 2 berkas. Atur urutan berkas menggunakan tombol panah naik/turun atau tentukan posisi halaman sisipan.",
      },
      {
        title: "Beri Judul & Gabungkan",
        desc: "Ketikkan judul kustom untuk berkas PDF Anda, klik 'Gabungkan Dokumen Sekarang', lalu unduh hasilnya.",
      },
    ],
    limits: [
      { label: "Format yang Didukung", value: "PDF, Word (.docx), Excel (.xlsx), PowerPoint (.pptx), JPG, PNG" },
      { label: "Jumlah Berkas", value: "Minimal 2 berkas sekaligus" },
      { label: "Batas Ukuran per Berkas", value: "Dokumen maks 35 MB, Gambar maks 12 MB" },
    ],
    tips: [
      "Anda dapat mencampur format berbeda sekaligus (misal: 1 DOCX + 2 Gambar JPG + 1 PDF) menjadi 1 PDF utuh.",
      "Gunakan mode 'Sisip Dokumen' jika Anda hanya ingin menyisipkan 1 surat/lampiran tepat setelah Halaman X di dokumen utama.",
    ],
  },
  watermark: {
    title: "Watermark & Security",
    badge: "Cap Air & Enkripsi",
    tagline: "Lindungi hak cipta dengan cap air teks dan kunci akses berkas dengan kata sandi enkripsi tingkat tinggi.",
    icon: ShieldAlert,
    steps: [
      {
        title: "Unggah Dokumen",
        desc: "Unggah berkas PDF atau Word (.docx) yang ingin diberi cap air atau diproteksi kata sandi.",
      },
      {
        title: "Atur Cap Air Visual",
        desc: "Ketikkan teks watermark (cth: 'DRAF', 'RAHASIA'), atur transparansi, sudut rotasi, ukuran font, dan warna.",
      },
      {
        title: "Atur Kata Sandi (Opsional)",
        desc: "Masukkan kata sandi rahasia untuk mengunci dokumen PDF dengan enkripsi AES-128 bit.",
      },
      {
        title: "Terapkan & Unduh",
        desc: "Klik 'Terapkan Proteksi & Unduh'. Dokumen hasil siap didistribusikan dengan aman.",
      },
    ],
    limits: [
      { label: "Format yang Didukung", value: "PDF (.pdf) dan Word (.docx)" },
      { label: "Batas Ukuran Berkas", value: "Maksimal 35 MB & Maks 50 Halaman" },
      { label: "Standar Enkripsi", value: "AES-128 bit standard (kompatibel dengan semua pembaca PDF)" },
    ],
    tips: [
      "Watermark teks dirender secara semi-transparan di latar belakang sehingga teks isi dokumen tetap terbaca jelas.",
      "Harap catat dan simpan kata sandi Anda dengan baik; dokumen terenkripsi tidak dapat dipulihkan jika kata sandi hilang.",
    ],
  },
};

interface FeatureGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  feature: FeatureType;
}

export default function FeatureGuideModal({ isOpen, onClose, feature }: FeatureGuideModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  if (!mounted || !isOpen) return null;

  const content = GUIDES[feature];
  const IconComponent = content.icon;

  const modalElement = (
    <div
      className="guide-modal-backdrop"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(12, 10, 9, 0.55)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "16px",
        animation: "fadeIn 0.2s ease-out",
      }}
    >
      <div
        className="guide-modal-card card"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--color-pure-white)",
          border: "1px solid var(--color-stone-border)",
          borderRadius: "16px",
          width: "100%",
          maxWidth: "640px",
          maxHeight: "88vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 40px -10px rgba(0,0,0,0.2)",
          overflow: "hidden",
          animation: "scaleUp 0.22s ease-out",
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid var(--color-stone-border)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            background: "var(--color-stone-canvas)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "42px",
                height: "42px",
                borderRadius: "10px",
                background: "var(--color-sky-wash)",
                color: "var(--color-cyan-edge)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <IconComponent size={22} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <h3 style={{ fontSize: "17px", fontWeight: 600, color: "var(--color-ink-black)", margin: 0 }}>
                  {content.title}
                </h3>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    padding: "2px 8px",
                    borderRadius: "9999px",
                    background: "var(--clr-info-bg)",
                    color: "var(--clr-info)",
                    border: "1px solid var(--clr-info-border)",
                  }}
                >
                  {content.badge}
                </span>
              </div>
              <p style={{ fontSize: "12.5px", color: "var(--color-warm-gray)", marginTop: "3px", margin: 0 }}>
                {content.tagline}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Tutup Panduan"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--color-ash-gray)",
              cursor: "pointer",
              padding: "6px",
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--color-ink-black)";
              e.currentTarget.style.background = "var(--color-stone-border)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--color-ash-gray)";
              e.currentTarget.style.background = "transparent";
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div
          style={{
            padding: "24px",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "24px",
          }}
        >
          {/* Section 1: Cara Pakai (Step by Step) */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
              <BookOpen size={16} color="var(--color-cyan-edge)" />
              <h4 style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-ink-black)", margin: 0 }}>
                Cara Penggunaan
              </h4>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {content.steps.map((step, idx) => (
                <div
                  key={idx}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "12px",
                    background: "var(--color-stone-canvas)",
                    padding: "12px 14px",
                    borderRadius: "10px",
                    border: "1px solid var(--color-stone-border)",
                  }}
                >
                  <div
                    style={{
                      width: "22px",
                      height: "22px",
                      borderRadius: "50%",
                      background: "var(--color-ink-black)",
                      color: "#fff",
                      fontSize: "11px",
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      marginTop: "1px",
                    }}
                  >
                    {idx + 1}
                  </div>
                  <div>
                    <h5 style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-ink-black)", margin: 0 }}>
                      {step.title}
                    </h5>
                    <p style={{ fontSize: "12px", color: "var(--color-warm-gray)", marginTop: "2px", margin: 0, lineHeight: 1.45 }}>
                      {step.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 2: Batasan & Aturan Sistem */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
              <AlertTriangle size={16} color="#d97706" />
              <h4 style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-ink-black)", margin: 0 }}>
                Batasan & Kapasitas Berkas
              </h4>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gap: "10px",
              }}
            >
              {content.limits.map((limit, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: "12px 14px",
                    borderRadius: "10px",
                    border: "1px solid var(--color-stone-border)",
                    background: "#fff",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                  }}
                >
                  <span style={{ fontSize: "11.5px", color: "var(--color-ash-gray)", fontWeight: 500, display: "block" }}>
                    {limit.label}
                  </span>
                  <span style={{ fontSize: "13px", color: "var(--color-ink-black)", fontWeight: 600, marginTop: "2px", display: "block" }}>
                    {limit.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Section 3: Tips Tambahan */}
          {content.tips && content.tips.length > 0 && (
            <div
              style={{
                background: "var(--clr-info-bg)",
                border: "1px solid var(--clr-info-border)",
                borderRadius: "10px",
                padding: "14px 16px",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Lightbulb size={16} color="var(--clr-info)" />
                <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-ink-black)" }}>
                  Tips & Rekomendasi
                </span>
              </div>
              <ul style={{ margin: 0, paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "4px" }}>
                {content.tips.map((tip, idx) => (
                  <li key={idx} style={{ fontSize: "12px", color: "var(--color-warm-gray)", lineHeight: 1.5 }}>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: "14px 24px",
            borderTop: "1px solid var(--color-stone-border)",
            background: "var(--color-stone-canvas)",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
          }}
        >
          <button
            onClick={onClose}
            className="btn btn-primary"
            style={{
              padding: "8px 20px",
              fontSize: "13px",
              fontWeight: 500,
              borderRadius: "8px",
            }}
          >
            Mengerti & Tutup
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalElement, document.body);
}

export function GuideButton({ onClick, label = "Panduan & Batasan" }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="btn-guide-trigger"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: "6px 14px",
        fontSize: "12.5px",
        fontWeight: 500,
        color: "var(--color-warm-gray)",
        background: "var(--color-stone-canvas)",
        border: "1px solid var(--color-stone-border)",
        borderRadius: "9999px",
        cursor: "pointer",
        transition: "all 0.15s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = "var(--color-cyan-edge)";
        e.currentTarget.style.borderColor = "var(--color-cyan-signal)";
        e.currentTarget.style.background = "var(--color-sky-wash)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = "var(--color-warm-gray)";
        e.currentTarget.style.borderColor = "var(--color-stone-border)";
        e.currentTarget.style.background = "var(--color-stone-canvas)";
      }}
    >
      <HelpCircle size={15} />
      <span>{label}</span>
    </button>
  );
}
