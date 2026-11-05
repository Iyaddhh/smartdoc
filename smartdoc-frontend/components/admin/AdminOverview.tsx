"use client";
import Link from "next/link";
import { getAdminOverview } from "@/lib/api/admin";
import { AdminHeading, ErrorMessage, dateTime, sizeLabel, toolLabels, useAdminResource } from "./shared";

export default function AdminOverview() {
  const { data, error, loading, refresh } = useAdminResource(getAdminOverview);
  return <section className="workspace-page"><AdminHeading title="Dashboard admin" description="Ringkasan operasional SmartDoc tanpa membuka dokumen atau agenda pengguna." refresh={refresh} loading={loading} /><ErrorMessage message={error} />
    <div className="workspace-stats">{[[data?.users, "Total akun"], [data?.new_users_24h, "Akun baru · 24 jam"], [data?.jobs_24h, "Proses workspace · 24 jam"], [data?.active_jobs, "Proses aktif"], [data?.failed_24h, "Proses gagal · 24 jam"], [data ? sizeLabel(data.storage_bytes) : undefined, "Penyimpanan tercatat"]].map(([value, label]) => <article className="workspace-card" key={label}><h2>{value ?? "—"}</h2><p>{label}</p></article>)}</div>
    {data && data.failed_24h > 0 && <section className="workspace-card admin-notice"><h2>Proses memerlukan perhatian</h2><p>Ada {data.failed_24h} proses gagal yang dibuat dalam 24 jam terakhir.</p><Link href="/administration/processes">Buka pemantauan proses</Link></section>}
    <section className="workspace-card dashboard-panel"><div className="section-heading"><h2>Aktivitas tools · 24 jam terakhir</h2><p>Hanya proses workspace yang tercatat. Penggunaan guest tidak membentuk riwayat dokumen.</p></div><div className="workspace-table-wrap"><table className="workspace-table"><thead><tr><th>Tool</th><th>Total</th><th>Selesai</th><th>Gagal</th></tr></thead><tbody>{data?.tools.map((tool) => <tr key={tool.feature}><td>{toolLabels[tool.feature]}</td><td>{tool.total}</td><td>{tool.done}</td><td>{tool.failed}</td></tr>)}</tbody></table></div></section>
    <div className="admin-quick-links"><Link className="workspace-card" href="/administration/users"><h2>Pengguna</h2><p>Kelola akun, kuota, dan sesi.</p></Link><Link className="workspace-card" href="/administration/health"><h2>Kondisi layanan</h2><p>Periksa database, penyimpanan, dan engine.</p></Link><Link className="workspace-card" href="/administration/audit"><h2>Audit admin</h2><p>Tinjau tindakan administratif.</p></Link></div>
    {data && <p className="field-hint">Diperiksa {dateTime(data.checked_at)}. Angka penyimpanan mengikuti ukuran berkas yang tercatat pada workspace.</p>}
  </section>;
}
