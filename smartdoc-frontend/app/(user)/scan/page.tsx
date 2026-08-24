import { ScanLine, Sparkles } from "lucide-react";

export default function ScanPage() {
  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
      <div className="page-header">
        <h2>
          OCR & <span className="highlight-span">Digitalisasi</span> Dokumen
        </h2>
        <p>Pindai dokumen fisik dan ekstrak bidang data ke template digital yang siap diedit.</p>
      </div>

      <div className="card" style={{ textAlign: "center", padding: "64px 32px", maxWidth: "680px", margin: "0 auto", width: "100%" }}>
        <div className="stat-icon cyan" style={{ width: 56, height: 56, margin: "0 auto 20px", borderRadius: "12px" }}>
          <ScanLine size={28} strokeWidth={1.5} />
        </div>
        <h3 style={{ fontSize: "18px", fontWeight: 600, color: "var(--color-ink-black)", marginBottom: "8px" }}>
          Pipeline OCR Berbasis Template
        </h3>
        <p style={{ color: "var(--color-warm-gray)", fontSize: "14px", maxWidth: "480px", margin: "0 auto", lineHeight: 1.65 }}>
          Modul OCR sedang dalam tahap integrasi pipeline presisi. Anda akan dapat mengunggah hasil scan dan memetakan koordinat zona data secara otomatis ke format DOCX & PDF.
        </p>
        <div style={{ marginTop: "24px" }}>
          <span className="badge badge-processing" style={{ padding: "6px 14px", fontSize: "12px" }}>
            <Sparkles size={13} /> Sedang Dalam Pengembangan Aktif
          </span>
        </div>
      </div>
    </div>
  );
}
