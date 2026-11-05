"use client";
import { getServiceSettings } from "@/lib/api/admin";
import { AdminHeading, ErrorMessage, useAdminResource } from "./shared";

export default function AdminSettings() {
  const { data, error, loading, refresh } = useAdminResource(getServiceSettings);
  const limits = data?.limits;
  return <section className="workspace-page"><AdminHeading title="Pengaturan layanan" description="Lihat batas pemrosesan aktif dan kebijakan privasi layanan." refresh={refresh} loading={loading} /><ErrorMessage message={error} />
    <section className="workspace-card dashboard-panel"><div className="section-heading"><h2>Batas pemrosesan</h2><p>Konfigurasi ini hanya dapat dibaca. Perubahan dilakukan melalui konfigurasi backend dan diterapkan saat layanan dimulai ulang.</p></div>{limits && <dl className="admin-settings-list">{[["Ukuran PDF", `${limits.pdf_mb} MB`], ["Ukuran Word / Excel", `${limits.office_mb} MB`], ["Ukuran PowerPoint untuk kompresi", `${limits.pptx_mb} MB`], ["Ukuran gambar", `${limits.image_mb} MB`], ["Total unggahan standar", `${limits.batch_mb} MB`], ["Jumlah berkas", limits.max_files], ["Halaman PDF", limits.max_pages], ["Dimensi sisi gambar", `${limits.image_edge_px} px`], ["Batas waktu proses", `${limits.timeout_seconds} detik`], ["Pembatasan proses", limits.process_rate]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}</section>
    {data && <section className="workspace-card dashboard-panel"><div className="section-heading"><h2>Privasi dokumen</h2><p>Panel admin tidak menyediakan akses isi dokumen pengguna.</p></div><ul className="admin-privacy-list"><li>Tidak ada pratinjau, nama berkas, kata sandi PDF, atau unduhan dokumen pada API admin.</li><li>Agenda dan kategori pribadi tetap dibatasi berdasarkan pemilik.</li><li>Guest menggunakan penyimpanan sementara tanpa riwayat dokumen.</li><li>Pemantauan menggunakan kode error umum, bukan pesan error mentah yang mungkin memuat informasi pribadi.</li></ul></section>}
  </section>;
}
