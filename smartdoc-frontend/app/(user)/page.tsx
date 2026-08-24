import Link from "next/link";
import {
  FileOutput,
  Minimize2,
  Scissors,
  Combine,
  ShieldCheck,
  ScanLine,
  ArrowRight,
} from "lucide-react";

const features = [
  {
    href: "/converter",
    icon: <FileOutput size={18} strokeWidth={1.75} />,
    iconBg: "cyan",
    title: "Document Converter",
    description: "Konversi dokumen antar format: PDF, Word, Excel, PPTX, dan Gambar.",
    formats: ["PDF", "DOCX", "XLSX", "PPTX", "JPG", "PNG"],
  },
  {
    href: "/compressor",
    icon: <Minimize2 size={18} strokeWidth={1.75} />,
    iconBg: "green",
    title: "File Compressor",
    description: "Kompres ukuran dokumen tanpa mengurangi kualitas esensial berkas.",
    formats: ["PDF", "DOCX", "XLSX", "PPTX", "JPG", "PNG"],
  },
  {
    href: "/splitter",
    icon: <Scissors size={18} strokeWidth={1.75} />,
    iconBg: "blue",
    title: "Document Splitter",
    description: "Pisahkan dokumen per rentang halaman, ekstrak bagian, atau pecah per interval.",
    formats: ["PDF", "DOCX", "ZIP"],
  },
  {
    href: "/merger",
    icon: <Combine size={18} strokeWidth={1.75} />,
    iconBg: "indigo",
    title: "Document Merger",
    description: "Satukan banyak berkas PDF, Word, Excel, PPTX, dan Gambar menjadi 1 PDF utuh.",
    formats: ["PDF", "DOCX", "XLSX", "PPTX", "JPG", "PNG"],
  },
  {
    href: "/watermark",
    icon: <ShieldCheck size={18} strokeWidth={1.75} />,
    iconBg: "cyan",
    title: "Watermark & Security",
    description: "Beri cap air visual kustom dan amankan berkas dengan proteksi kata sandi.",
    formats: ["PDF", "DOCX"],
  },
  {
    href: "/scan",
    icon: <ScanLine size={18} strokeWidth={1.75} />,
    iconBg: "amber",
    title: "OCR Template-Based",
    description: "Digitalisasi dokumen fisik dan petakan data ke template digital.",
    formats: ["JPG", "PNG", "PDF Scan"],
  },
];

export default function HomePage() {
  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
      {/* Hero Section */}
      <div style={{ maxWidth: "780px", paddingTop: "4px" }}>
        {/* Fluid Display Headline */}
        <h1 className="display-title" style={{ marginBottom: "12px" }}>
          Kelola & transformasikan dokumen dengan <span className="highlight-span">cepat & presisi</span>
        </h1>

        {/* Subtitle */}
        <p className="body-lg" style={{ maxWidth: "640px" }}>
          Solusi cerdas untuk mengonversi format, mengompres ukuran file, memisahkan halaman, dan mendigitalisasi dokumen berstandar profesional dalam satu alur kerja yang tenang.
        </p>
      </div>

      {/* Feature Cards Grid (3 cards per row) */}
      <div>
        <div style={{ marginBottom: "14px", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <h2 className="heading-sm" style={{ fontSize: "clamp(17px, 2.5vw, 20px)" }}>Alat Dokumen Terpadu</h2>
            <p className="body-text" style={{ marginTop: "2px", fontSize: "13px" }}>
              Pilih utilitas yang Anda butuhkan untuk memproses berkas Anda.
            </p>
          </div>
        </div>

        <div className="grid-3">
          {features.map((f) => (
            <Link
              key={f.href}
              href={f.href}
              className="feature-card"
              style={{ padding: "18px 18px", gap: "12px" }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div className={`stat-icon ${f.iconBg}`} style={{ width: 34, height: 34 }}>
                  {f.icon}
                </div>
                <span style={{ color: "var(--color-ash-gray)", display: "flex", alignItems: "center", gap: "4px", fontSize: "12px" }}>
                  Buka <ArrowRight size={13} />
                </span>
              </div>

              <div>
                <h3 style={{ fontSize: "15px", fontWeight: 600, color: "var(--color-ink-black)", marginBottom: "4px" }}>
                  {f.title}
                </h3>
                <p style={{ fontSize: "12.5px", color: "var(--color-warm-gray)", lineHeight: 1.5 }}>
                  {f.description}
                </p>
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", marginTop: "auto", paddingTop: "4px" }}>
                {f.formats.map((fmt) => (
                  <span
                    key={fmt}
                    style={{
                      fontSize: "10.5px",
                      fontWeight: 500,
                      background: "var(--color-stone-canvas)",
                      border: "1px solid var(--color-stone-border)",
                      borderRadius: "var(--radius-tags)",
                      padding: "1px 7px",
                      color: "var(--color-warm-gray)",
                    }}
                  >
                    {fmt}
                  </span>
                ))}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
