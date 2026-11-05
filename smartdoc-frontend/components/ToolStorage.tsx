"use client";
import { useEffect, useRef, useState } from "react";
import { getDocument, saveDocument } from "@/lib/api/documents";
import type { DocumentItem } from "@/lib/api/types";
import { isCompletedResponse, mutationFailure } from "@/lib/success-feedback";
import { showToast } from "@/components/Toast";

export default function ToolStorage({ value, onChange, disabled, documentId, done, onSaved }: {
  value: boolean; onChange: (value: boolean) => void; disabled: boolean; documentId: string | null; done: boolean; onSaved?: () => void;
}) {
  const [document, setDocument] = useState<DocumentItem | null>(null);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  useEffect(() => {
    let active = true;
    async function load() {
      if (!done || !documentId) { if (active) setDocument(null); return; }
      const response = await getDocument(documentId);
      if (!active) return;
      if (response.success && response.data) { setDocument(response.data); setError(""); }
      else setError(response.message);
    }
    void load(); return () => { active = false; };
  }, [done, documentId]);
  return <section className="tool-storage workspace-form--panel">
    {!done ? <><label className="check-label"><input type="checkbox" checked={value} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />Simpan hasil ke workspace</label><p className="field-hint">Opsional. Hanya hasil yang disimpan memakai kuota. Berkas asli tidak disimpan otomatis. Riwayat aktivitas tetap tersedia.</p></> : document && <>
      <strong>{document.is_saved ? "Hasil tersimpan di workspace" : document.download_available ? "Hasil sementara · tidak memakai kuota" : "Berkas sudah tidak tersedia"}</strong>
      {document.storage_notice === "quota_exceeded" && <p role="status">Kuota tidak mencukupi untuk menyimpan hasil. Anda tetap bisa mengunduhnya sementara.</p>}
      {!document.is_saved && document.expires_at && document.download_available && <p className="field-hint">Tersedia untuk diunduh hingga {new Date(document.expires_at).toLocaleString("id-ID")}. Setelah itu berkas dibersihkan; riwayat tetap ada.</p>}
      {!document.is_saved && document.download_available && <button type="button" className="ui-button" disabled={busy} onClick={async () => {
        if (!documentId || inFlight.current) return; inFlight.current = true; setBusy(true); setError("");
        try {
          const response = await saveDocument(documentId);
          if (isCompletedResponse(response) && response.data?.is_saved === true) { setDocument(response.data); onSaved?.(); showToast("success", "Hasil berhasil disimpan ke workspace."); }
          else if (response.success && response.httpStatus !== 202) setError(response.data?.storage_notice === "quota_exceeded" ? "Kuota tidak mencukupi. Hasil tetap tersedia sementara untuk diunduh." : "Penyimpanan hasil belum dapat dikonfirmasi. Periksa status dokumen.");
          else setError(mutationFailure(response));
        } finally { inFlight.current = false; setBusy(false); }
      }}>{busy ? "Menyimpan…" : "Simpan hasil ke workspace"}</button>}
    </>}{error && <p role="alert" className="guest-error">{error}</p>}
  </section>;
}
