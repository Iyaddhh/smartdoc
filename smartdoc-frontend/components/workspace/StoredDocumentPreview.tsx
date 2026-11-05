"use client";
/* eslint-disable @next/next/no-img-element -- Authenticated preview responses contain inline PNG data URLs. */
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api/client";

type Preview = { thumbnail: string; total_pages: number };

export default function StoredDocumentPreview({ id, available }: { id: string; available: boolean }) {
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{ page: number; data: Preview | null; error: string } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!available) return;
    const controller = new AbortController();
    const body = new FormData();
    body.set("source_document_id", id);
    body.set("page", String(page));
    apiFetch<Preview>("/api/documents/first-page-preview", { method: "POST", body, signal: controller.signal }).then((response) => {
      if (!controller.signal.aborted) setLoaded({ page, data: response.data, error: response.error || response.message });
    });
    return () => controller.abort();
  }, [id, page, attempt, available]);
  const current = loaded?.page === page ? loaded : null;
  const image = current?.data?.thumbnail;
  const controls = <div className="workspace-actions">
    <button type="button" disabled={page <= 1 || !current?.data} onClick={() => setPage((value) => value - 1)}>Sebelumnya</button>
    <span>Halaman {page}{current?.data ? ` dari ${current.data.total_pages}` : ""}</span>
    <button type="button" disabled={!current?.data || page >= current.data.total_pages} onClick={() => setPage((value) => value + 1)}>Berikutnya</button>
  </div>;
  return <section className="workspace-card document-preview" aria-label="Pratinjau dokumen">
    <h2>Pratinjau dokumen</h2>
    {!available ? <p>Pratinjau belum tersedia untuk berkas ini. Anda dapat mengunduhnya jika berkas masih tersedia.</p> : !current ? <p role="status">Menyiapkan halaman {page}…</p> : image ? <>
      <img className="document-preview-image" src={image} alt={`Pratinjau halaman ${page}`} />
      {controls}<button type="button" className="ui-button" onClick={() => dialog.current?.showModal()}>Layar penuh</button>
    </> : <div role="status"><p>{current.error || "Pratinjau tidak dapat dimuat."}</p><button type="button" onClick={() => { setLoaded(null); setAttempt((value) => value + 1); }}>Coba lagi pratinjau</button></div>}
    <dialog ref={dialog} className="document-preview-dialog" aria-label="Pratinjau dokumen layar penuh">
      <button type="button" className="ui-button" autoFocus onClick={() => dialog.current?.close()}>Tutup pratinjau</button>
      {image && <img className="document-preview-image" src={image} alt={`Halaman ${page}`} />}{controls}
    </dialog>
  </section>;
}
