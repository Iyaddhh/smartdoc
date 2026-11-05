"use client";
import { useCallback, useState } from "react";
import { listAdminAudit } from "@/lib/api/admin";
import { AdminHeading, ErrorMessage, Pagination, dateTime, useAdminResource } from "./shared";

export default function AdminAudit() {
  const [page, setPage] = useState(1);
  const loader = useCallback(() => listAdminAudit(page), [page]);
  const { data, error, loading, refresh } = useAdminResource(loader);
  return <section className="workspace-page"><AdminHeading title="Audit admin" description="Riwayat perubahan akses akun, kuota, dan sesi. Tidak merekam isi dokumen." refresh={refresh} loading={loading} /><ErrorMessage message={error} />
    <div className="planner-list">{data?.items.map((entry) => <article className="workspace-card admin-audit-entry" key={entry.id}><h2>{entry.action === "account.updated" ? "Pengaturan akun diperbarui" : entry.action === "sessions.revoked" ? "Seluruh sesi dicabut" : "Tindakan administratif"}</h2><p>{dateTime(entry.created_at)}</p><dl><div><dt>Admin pelaksana</dt><dd><code>{entry.actor_id}</code></dd></div><div><dt>Akun tujuan</dt><dd><code>{entry.target_id}</code></dd></div></dl>{entry.action === "account.updated" && <p>Akun {entry.is_active ? "aktif" : "nonaktif"} · Kuota upload langsung {entry.storage_quota_mb} MB</p>}</article>)}</div>
    {!loading && data && !data.items.length && <p>Belum ada tindakan administratif yang tercatat.</p>}<Pagination data={data} page={page} onChange={setPage} disabled={loading} />
  </section>;
}
