"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { getWorkspaceDocument, listFolders, moveWorkspaceDocument } from "@/lib/api/workspace";
import { getDownloadUrl, renameDocument } from "@/lib/api/documents";
import type { Folder, WorkspaceDocumentDetail } from "@/lib/api/workspace-types";
import { availableDocumentTools } from "@/lib/document-tools";
import { formatBytes } from "@/lib/format";
import { useAuth } from "@/lib/AuthContext";
import PageHeading from "@/components/ui/PageHeading";
import DownloadLink from "@/components/DownloadLink";
import ToolStorage from "@/components/ToolStorage";
import StoredDocumentPreview from "./StoredDocumentPreview";
import StoredDocumentTools from "./StoredDocumentTools";
import DocumentActivity from "./DocumentActivity";
import { isCompletedResponse, mutationFailure } from "@/lib/success-feedback";
import SuccessNotice from "@/components/ui/SuccessNotice";

const statusLabels: Record<string, string> = { done: "Selesai", pending: "Menunggu", processing: "Diproses", failed: "Gagal" };
const itemStatusLabels: Record<string, string> = { todo: "Belum mulai", doing: "Dikerjakan", done: "Selesai" };
const featureLabels: Record<string, string> = { upload: "Unggah langsung", converter: "Konversi", compressor: "Kompresi", splitter: "Pisah halaman", merger: "Gabung berkas", watermark: "Watermark & sandi" };

export default function DocumentDetails({ id, initialTool }: { id: string; initialTool?: string }) {
  const { user } = useAuth();
  const [document, setDocument] = useState<WorkspaceDocumentDetail | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [name, setName] = useState("");
  const [folderId, setFolderId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const reload = () => setRevision((value) => value + 1);
  useEffect(() => {
    let active = true;
    Promise.all([getWorkspaceDocument(id), listFolders()]).then(([detail, folderList]) => {
      if (!active) return;
      if (detail.data && folderList.data) {
        setDocument(detail.data); setFolders(folderList.data); setName(detail.data.name); setFolderId(detail.data.folder_id || ""); setError("");
      } else setError(detail.error || folderList.error || "Dokumen tidak dapat dimuat.");
      setLoading(false);
    });
    return () => { active = false; };
  }, [id, revision]);

  async function saveMetadata(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !document || !name.trim()) return;
    setBusy(true); setError(""); setNotice("");
    try {
      if (name.trim() !== document.name) {
        const renamed = await renameDocument(id, name.trim());
        if (!isCompletedResponse(renamed)) { setError(mutationFailure(renamed)); return; }
        setDocument((current) => current ? { ...current, name: name.trim() } : current);
      }
      if (folderId !== (document.folder_id || "")) {
        const moved = await moveWorkspaceDocument(id, folderId || null);
        if (!isCompletedResponse(moved)) { setError(mutationFailure(moved)); return; }
      }
      setNotice("Informasi dokumen disimpan."); reload();
    } finally { setBusy(false); }
  }
  const date = (value: string) => new Date(value).toLocaleString("id-ID", { timeZone: user?.timezone || "Asia/Jakarta" });
  if (loading) return <section className="workspace-page"><p role="status">Memuat detail dokumen…</p></section>;
  if (!document) return <section className="workspace-page"><Link href="/dokumen">← Dokumen saya</Link><p className="guest-error" role="alert">{error || "Dokumen tidak ditemukan."}</p><button type="button" onClick={reload}>Coba lagi</button></section>;
  const previewAvailable = document.is_saved && document.download_available && availableDocumentTools(document.format).length > 0;
  return <section className="workspace-page document-details">
    <Link className="document-back" href="/dokumen">← Dokumen saya</Link>
    <PageHeading title={document.name} description="Lihat isi dokumen, kelola informasi, dan proses berkas tanpa unggah ulang." />
    <div className="workspace-actions">{document.download_available && <DownloadLink className="ui-button ui-button--primary" href={getDownloadUrl(id)}>Unduh dokumen</DownloadLink>}{document.is_saved && document.download_available && <a className="ui-button" href="#proses-dokumen">Proses dokumen</a>}</div>
    {error && <p role="alert" className="guest-error">{error}</p>}{notice && <SuccessNotice title={notice} />}
    {!document.is_saved && document.download_available && <ToolStorage value={false} onChange={() => {}} disabled={false} documentId={id} done onSaved={reload} />}
    <div className="document-details-grid">
      <StoredDocumentPreview key={id} id={id} available={previewAvailable} />
      <section className="workspace-card document-metadata" aria-label="Informasi dokumen">
        <h2>Informasi dokumen</h2>
        <dl><div><dt>Format</dt><dd>{document.format.toUpperCase() || "—"}</dd></div><div><dt>Ukuran</dt><dd>{formatBytes(document.size)}</dd></div><div><dt>Status</dt><dd>{statusLabels[document.status] || document.status}</dd></div><div><dt>Asal</dt><dd>{featureLabels[document.feature] || document.feature}</dd></div><div><dt>Disimpan</dt><dd>{date(document.created_at)}</dd></div><div><dt>Folder</dt><dd>{document.folder_name || "Tanpa folder"}</dd></div><div><dt>Penyimpanan</dt><dd>{document.is_saved ? "Tersimpan di workspace" : document.download_available ? "Hasil sementara" : "Berkas tidak tersedia"}</dd></div></dl>
        <form onSubmit={saveMetadata} className="workspace-form">
          <label>Nama dokumen<input value={name} onChange={(event) => setName(event.target.value)} maxLength={255} required disabled={busy} /></label>
          <label>Folder<select value={folderId} onChange={(event) => setFolderId(event.target.value)} disabled={busy || !document.is_saved}><option value="">Tanpa folder</option>{folders.map((folder) => <option value={folder.id} key={folder.id}>{folder.name}</option>)}</select></label>
          <button type="submit" className="ui-button" disabled={busy || !name.trim()}>{busy ? "Menyimpan…" : "Simpan perubahan"}</button>
        </form>
      </section>
    </div>
    <StoredDocumentTools key={id} document={document} initialTool={initialTool} />
    <DocumentActivity id={id} revision={revision} timezone={user?.timezone || "Asia/Jakarta"} />
    <section className="workspace-card" aria-labelledby="document-related-title"><h2 id="document-related-title">Tugas & agenda terkait</h2>
      {document.related_items.length ? <div className="planner-list">{document.related_items.map((item) => <article key={item.id} className="document-related-item"><div><h3>{item.title}</h3><p>{item.kind === "task" ? "Tugas" : "Kegiatan"} · {itemStatusLabels[item.status] || item.status}{(item.due_at || item.starts_at) && ` · ${date((item.due_at || item.starts_at)!)}`}</p></div><Link className="ui-button" href={`/kalender#agenda-${item.id}`}>Buka agenda</Link></article>)}</div> : <p>Belum ada tugas atau agenda yang terhubung. Pilih dokumen ini saat membuat agenda di kalender.</p>}
      <Link href="/kalender">Buka kalender</Link>
    </section>
  </section>;
}
