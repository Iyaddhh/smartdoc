"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { getDownloadUrl, deleteDocument } from "@/lib/api";
import { listFolders, listWorkspaceDocuments, createWorkspaceFolder, renameWorkspaceFolder, deleteWorkspaceFolder, uploadWorkspaceDocument, moveWorkspaceDocument } from "@/lib/api/workspace";
import type { Folder, WorkspaceDocument } from "@/lib/api/workspace-types";
import DownloadLink from "@/components/DownloadLink";
import PageHeading from "@/components/ui/PageHeading";
import FilePicker from "@/components/ui/FilePicker";
import { showToast } from "@/components/Toast";
import { isCompletedResponse, mutationFailure } from "@/lib/success-feedback";
import type { ApiResponse } from "@/lib/api/types";

export default function Documents() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [documents, setDocuments] = useState<WorkspaceDocument[]>([]);
  const [folder, setFolder] = useState("");
  const [search, setSearch] = useState("");
  const [revision, setRevision] = useState(0);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const reload = () => setRevision((value) => value + 1);
  useEffect(() => {
    let active = true;
    const load = async () => {
      const [a,b] = await Promise.all([listFolders(), listWorkspaceDocuments({ page, search, folder_id: folder || undefined })]);
      if (!active) return;
      if (a.success && b.success && a.data && b.data) { setFolders(a.data); setDocuments(b.data.items); setTotal(b.data.total); setError(""); }
      else setError(a.error || b.error || "Gagal memuat dokumen.");
    };
    void load(); return () => { active = false; };
  }, [folder, search, page, revision]);

  async function mutate(operation: () => Promise<ApiResponse<unknown>>, message: string, onSuccess?: () => void) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError("");
    try {
      const response = await operation();
      if (!isCompletedResponse(response)) { setError(mutationFailure(response)); return; }
      onSuccess?.(); reload(); showToast("success", message);
    } finally { inFlight.current = false; setBusy(false); }
  }
  async function createFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = String(new FormData(form).get("name"));
    await mutate(() => createWorkspaceFolder(name), "Folder berhasil dibuat.", () => form.reset());
  }
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    if (folder) form.set("folder_id", folder);
    await mutate(() => uploadWorkspaceDocument(form), "Dokumen berhasil disimpan ke workspace.", () => element.reset());
  }
  async function move(id: string, folder_id: string) {
    await mutate(() => moveWorkspaceDocument(id, folder_id || null), "Folder dokumen berhasil diperbarui.");
  }
  async function renameFolder() {
    const name = window.prompt("Nama folder baru", folders.find((item) => item.id === folder)?.name);
    if (!name) return;
    await mutate(() => renameWorkspaceFolder(folder, name), "Nama folder berhasil diperbarui.");
  }
  async function removeFolder() {
    if (!window.confirm("Hapus folder ini? Dokumen di dalamnya tetap disimpan tanpa folder.")) return;
    await mutate(() => deleteWorkspaceFolder(folder), "Folder berhasil dihapus. Dokumen tetap tersimpan.", () => setFolder(""));
  }
  return <section className="workspace-page">
    <PageHeading title="Dokumen" accent="saya" description="Unggah langsung atau kelola hasil tools dalam folder pribadi." />
    <div className="workspace-toolbar"><label>Folder<select value={folder} onChange={(event) => { setFolder(event.target.value); setPage(1); }}><option value="">Semua dokumen</option>{folders.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Cari dokumen<input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label>
      {folder && <><button disabled={busy} onClick={renameFolder}>Ubah nama folder</button><button disabled={busy} onClick={removeFolder}>Hapus folder</button></>}
    </div>
    <form onSubmit={createFolder} className="workspace-toolbar" aria-busy={busy}><label>Folder baru<input name="name" maxLength={100} required disabled={busy} /></label><button type="submit" disabled={busy}>Buat folder</button></form>
    <form onSubmit={upload} className="workspace-toolbar workspace-form--panel" aria-busy={busy}><label>Upload dokumen<FilePicker name="file" accept=".pdf,.docx,.xlsx,.pptx,.jpg,.jpeg,.png" required disabled={busy} /></label><button className="ui-button ui-button--primary" disabled={busy}>{busy ? "Memproses…" : "Simpan dokumen"}</button></form>
    {error && <p role="alert" className="guest-error">{error}</p>}
    <div className="workspace-table-wrap"><table className="workspace-table"><thead><tr><th>Dokumen</th><th>Ukuran</th><th>Folder</th><th>Aksi</th></tr></thead><tbody>
      {documents.map((document) => <tr key={document.id}><td><Link href={`/dokumen/${document.id}`}>{document.name}</Link><small>{document.status}</small></td><td>{(document.size/1024).toFixed(1)} KB</td><td><select disabled={busy} aria-label={`Folder ${document.name}`} value={document.folder_id || ""} onChange={(event) => void move(document.id, event.target.value)}><option value="">Tanpa folder</option>{folders.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></td><td>
        <Link className="ui-button" href={`/dokumen/${document.id}`}>Detail & pratinjau</Link>
        {document.status === "done" && <Link className="ui-button" href={`/dokumen/${document.id}#proses-dokumen`}>Proses</Link>}
        {document.status === "done" && <DownloadLink className="ui-button" href={getDownloadUrl(document.id)}>Unduh</DownloadLink>}
        <button disabled={busy} onClick={async () => { if (!window.confirm("Hapus permanen dokumen ini?")) return; await mutate(() => deleteDocument(document.id), "Dokumen berhasil dihapus."); }}>Hapus</button>
      </td></tr>)}
      {!documents.length && <tr><td colSpan={4}>Belum ada dokumen di tampilan ini.</td></tr>}
    </tbody></table></div>
    <div className="workspace-toolbar"><button disabled={page === 1} onClick={() => setPage(page-1)}>Sebelumnya</button><span>Halaman {page} · {total} dokumen</span><button disabled={page*50 >= total} onClick={() => setPage(page+1)}>Berikutnya</button></div>
  </section>;
}
