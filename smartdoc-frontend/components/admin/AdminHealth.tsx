"use client";
import { getServiceHealth } from "@/lib/api/admin";
import { AdminHeading, ErrorMessage, dateTime, sizeLabel, useAdminResource } from "./shared";

export default function AdminHealth() {
  const { data, error, loading, refresh } = useAdminResource(getServiceHealth);
  const checks = data ? [
    { title: "Backend", ready: data.backend, detail: "API admin berhasil merespons." },
    { title: "Database", ready: data.database, detail: "Koneksi dan query pemeriksaan berhasil." },
    { title: "Penyimpanan", ready: data.storage.available && data.storage.writable && !data.storage.low_space, detail: data.storage.free_bytes !== null ? `${sizeLabel(data.storage.free_bytes)} ruang kosong dari ${sizeLabel(data.storage.total_bytes || 0)}. ${data.storage.writable ? "Izin tulis tersedia." : "Izin tulis tidak tersedia."}` : "Penyimpanan tidak dapat diperiksa." },
    { title: "LibreOffice", ready: data.engines.libreoffice, detail: "Diperlukan untuk konversi Office ke PDF. Pemeriksaan mendeteksi executable." },
    { title: "Renderer PDF", ready: data.engines.pdf_renderer, detail: "PyMuPDF untuk konversi gambar dan pratinjau PDF." },
    { title: "Ghostscript", ready: data.engines.ghostscript, optional: true, detail: "Optimasi PDF tambahan. Jalur Python tetap tersedia jika engine ini tidak terdeteksi." },
    { title: "pngquant", ready: data.engines.pngquant, optional: true, detail: "Optimasi PNG tambahan. Pillow tetap tersedia sebagai jalur cadangan." },
  ] : [];
  return <section className="workspace-page"><AdminHeading title="Kondisi layanan" description="Pemeriksaan saat diminta untuk komponen layanan, tanpa membaca isi dokumen." refresh={refresh} loading={loading} /><ErrorMessage message={error} />
    <div className="admin-health-grid">{checks.map((check) => <article className="workspace-card" key={check.title}><div className="section-heading"><h2>{check.title}</h2><p>{check.detail}</p></div><span className={`badge ${check.ready ? "badge-done" : check.optional ? "badge-neutral" : "badge-failed"}`}>{check.ready ? "Tersedia" : check.optional ? "Menggunakan cadangan" : "Perlu perhatian"}</span></article>)}</div>
    {data && <p className="field-hint">Diperiksa {dateTime(data.checked_at)}. Status engine menunjukkan deteksi komponen, bukan pengujian setiap format dokumen. Jika API tidak dapat dihubungi, status tidak dapat diperbarui.</p>}
  </section>;
}
