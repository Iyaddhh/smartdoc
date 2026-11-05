"use client";
import { useCallback, useEffect, useState } from "react";
import { listAdminProcesses } from "@/lib/api/admin";
import EmptyState from "@/components/EmptyState";
import { Activity } from "lucide-react";
import { AdminHeading, ErrorMessage, Pagination, dateTime, statusLabels, toolLabels, useAdminResource } from "./shared";

export default function AdminProcesses() {
  const [feature, setFeature] = useState(""); const [status, setStatus] = useState("active"); const [page, setPage] = useState(1);
  const [period, setPeriod] = useState<"24h" | "7d" | "all">("24h");
  const activeOnly = ["active", "pending", "processing"].includes(status);
  const loader = useCallback(() => listAdminProcesses(feature, status, page, period), [feature, status, page, period]);
  const { data, error, loading, refresh } = useAdminResource(loader);
  useEffect(() => { const timer = setInterval(() => { if (document.visibilityState === "visible") refresh(); }, 15000); return () => clearInterval(timer); }, [refresh]);
  return <section className="workspace-page"><AdminHeading title="Pemantauan proses" description="Metadata proses workspace. Nama berkas, isi dokumen, dan error mentah tidak ditampilkan." refresh={refresh} loading={loading} /><ErrorMessage message={error} />
    <div className="workspace-toolbar"><label>Tool<select aria-label="Filter tool" value={feature} onChange={(event) => { setFeature(event.target.value); setPage(1); }}><option value="">Semua tools</option>{Object.entries(toolLabels).filter(([key]) => key !== "other").map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Status<select aria-label="Filter status proses" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="active">Aktif: menunggu & diproses</option><option value="">Semua status</option>{Object.entries(statusLabels).filter(([key]) => key !== "unknown").map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Periode riwayat<select aria-label="Periode riwayat" disabled={activeOnly} value={period} onChange={(event) => { setPeriod(event.target.value as typeof period); setPage(1); }}><option value="24h">24 jam terakhir</option><option value="7d">7 hari terakhir</option><option value="all">Seluruh riwayat</option></select></label></div>
    <p className="field-hint">{activeOnly ? "Proses aktif dari semua tanggal ditampilkan agar proses lama yang belum selesai tetap terlihat." : "Riwayat mengikuti waktu pembuatan dan periode yang dipilih; proses selesai/gagal tidak sedang berjalan."} Diperbarui setiap 15 detik saat halaman terlihat.</p>
    {data && data.items.length > 0 && <><p className="field-hint">{data.total} proses sesuai filter. Geser tabel pada layar kecil untuk melihat kolom lainnya.</p><div className="workspace-table-wrap"><table className="workspace-table admin-process-table"><thead><tr><th>Tool</th><th>Status</th><th>Progres</th><th>Dibuat</th><th>Durasi</th><th>Kode error</th><th>ID proses</th></tr></thead><tbody>{data.items.map((item) => <tr key={item.id}><td>{toolLabels[item.feature]}</td><td><span className={`badge ${item.status === "done" ? "badge-done" : item.status === "failed" ? "badge-failed" : "badge-neutral"}`}>{statusLabels[item.status]}</span></td><td>{item.progress}%</td><td>{dateTime(item.created_at)}</td><td>{item.duration_seconds !== null ? `${item.duration_seconds.toFixed(1)} dtk` : "—"}</td><td>{item.error_code || "—"}</td><td><code>{item.id}</code></td></tr>)}</tbody></table></div></>}
    {!loading && data && !data.items.length && <EmptyState icon={<Activity size={24} />} title={activeOnly ? "Tidak ada proses aktif yang sesuai filter" : "Tidak ada riwayat pada pilihan ini"} description={activeOnly ? "Proses selesai dan gagal ada di riwayat. Pilih status tersebut untuk melihatnya." : "Coba periode lain atau ubah filter tool dan status."} />}
    <Pagination data={data} page={page} onChange={setPage} disabled={loading} />
  </section>;
}
