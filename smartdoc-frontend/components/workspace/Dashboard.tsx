"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getWorkspaceSummary } from "@/lib/api/workspace";
import { useAuth } from "@/lib/AuthContext";
import type { Summary } from "@/lib/api/workspace-types";
import PageHeading from "@/components/ui/PageHeading";
import { Bell, Combine, FileOutput, Minimize2, Scissors, ShieldCheck } from "lucide-react";

const tools = [
  { href: "/converter", label: "Konversi", icon: FileOutput },
  { href: "/compressor", label: "Kompresi", icon: Minimize2 },
  { href: "/splitter", label: "Pisah halaman", icon: Scissors },
  { href: "/merger", label: "Gabung berkas", icon: Combine },
  { href: "/watermark", label: "Watermark", icon: ShieldCheck },
];

export default function Dashboard() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const load = async () => {
      const response = await getWorkspaceSummary();
      if (!active) return;
      if (response.success && response.data) { setSummary(response.data); setError(""); }
      else setError(response.message);
    };
    void load(); const timer = setInterval(load,60000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  return <section className="workspace-page"><PageHeading title="Dashboard" description={`Selamat datang${user?.display_name ? ", " + user.display_name : ""}. Kelola dokumen, tugas, dan agenda Anda.`} />
    {error && <p role="alert" className="guest-error">{error}</p>}
    <div className="workspace-stats"><article className="workspace-card"><h2>{summary?.document_count ?? "—"}</h2><p>Dokumen</p></article><article className="workspace-card"><h2>{summary?.open_tasks ?? "—"}</h2><p>Tugas aktif</p></article><article className="workspace-card"><h2>{summary ? (summary.storage_bytes/1024/1024).toFixed(1) : "—"} MB</h2><p>Dari kuota {summary?.quota_mb || user?.storage_quota_mb} MB</p></article></div>
    <div className="workspace-toolbar"><Link className="ui-button ui-button--primary" href="/dokumen">Dokumen saya</Link><Link className="ui-button" href="/kalender">Buka kalender</Link></div>
    <section className="workspace-card dashboard-panel" aria-labelledby="reminder-title">
      <div className="section-heading"><h2 id="reminder-title">Pengingat</h2><p>Agenda mendatang dan tugas yang perlu diselesaikan.</p></div>
      <div className="planner-list">{summary?.reminders.map((item) => <article className="reminder-row" key={item.id}><div><h3>{item.title}</h3><p>{item.kind === "task" ? "Deadline tugas" : "Kegiatan"}: {new Date((item.kind === "task" ? item.due_at : item.starts_at) || "").toLocaleString("id-ID",{ timeZone: user?.timezone || "Asia/Jakarta" })}</p></div><Link className="ui-button" href="/kalender">Buka</Link></article>)}{summary && !summary.reminders.length && <div className="inline-empty"><Bell size={20} aria-hidden="true" /><p>Belum ada pengingat. Tugas dan kegiatan mendatang akan muncul di sini.</p></div>}</div>
    </section>
    <section className="workspace-card dashboard-panel" aria-labelledby="workspace-tools-title">
      <div className="section-heading"><h2 id="workspace-tools-title">Tools dokumen</h2><p>Pilih pekerjaan yang ingin dilakukan pada dokumen Anda.</p></div>
      <div className="workspace-tool-links">{tools.map(({ href, label, icon: Icon }) => <Link key={href} href={href}><Icon size={20} strokeWidth={1.75} aria-hidden="true" /><span>{label}</span></Link>)}</div>
    </section>
  </section>;
}
