"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";

type Activity = { id: string; actor_id: string | null; action: string; outcome: string; code: string | null; created_at: string };
type Result = { items: Activity[]; total: number; limit: number };
const labels: Record<string, string> = { uploaded: "Dokumen diunggah", renamed: "Nama diubah", moved: "Folder diubah", saved: "Simpan ke workspace", deleted: "Berkas dihapus", process_queued: "Proses masuk antrean", process_started: "Proses dimulai", process_finished: "Proses berakhir" };
const codes: Record<string, string> = { PROCESS_FAILED: "Pemrosesan gagal", PROCESS_INTERRUPTED: "Proses terputus saat backend dimulai ulang", QUOTA_EXCEEDED: "Kuota penyimpanan tidak mencukupi" };

export default function DocumentActivity({ id, revision, timezone }: { id: string; revision: number; timezone: string }) {
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; data: Result | null; error: string } | null>(null);
  const key = `${id}:${page}:${revision}:${attempt}`;
  useEffect(() => {
    const controller = new AbortController();
    apiFetch<Result>(`/api/documents/${id}/activity?page=${page}`, { signal: controller.signal }).then((response) => {
      if (!controller.signal.aborted) setLoaded({ key, data: response.data, error: response.error || response.message });
    });
    return () => controller.abort();
  }, [id, page, key]);
  const current = loaded?.key === key ? loaded : null;
  return <section className="workspace-card" aria-labelledby="document-activity-title">
    <h2 id="document-activity-title">Aktivitas dokumen</h2>
    <p>Aktivitas sebelum pencatatan diaktifkan tidak ditampilkan.</p>
    {!current ? <p role="status">Memuat aktivitas...</p> : !current.data ? <p role="alert">{current.error || "Aktivitas tidak dapat dimuat."}</p> : <>
      {!current.data.items.length ? <p>Belum ada aktivitas tercatat.</p> : <ul>{current.data.items.map((item) => <li key={item.id}>
        <strong>{labels[item.action] || "Aktivitas dokumen"}</strong> — {item.outcome === "failed" ? "Gagal" : "Berhasil"}
        <p>{item.actor_id ? "Akun Anda" : "Sistem"} · {new Date(item.created_at).toLocaleString("id-ID", { timeZone: timezone })}{item.code && ` · ${codes[item.code] || "Tindakan tidak berhasil"}`}</p>
      </li>)}</ul>}
      <div className="workspace-actions"><button disabled={page === 1} onClick={() => setPage(page - 1)}>Sebelumnya</button><span>Halaman {page}</span><button disabled={page * current.data.limit >= current.data.total} onClick={() => setPage(page + 1)}>Berikutnya</button></div>
    </>}
    <button type="button" disabled={!current} onClick={() => setAttempt((value) => value + 1)}>Muat ulang aktivitas</button>
  </section>;
}
