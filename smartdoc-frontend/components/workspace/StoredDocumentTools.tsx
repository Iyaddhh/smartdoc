"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api/client";
import { getDownloadUrl } from "@/lib/api/documents";
import { listWorkspaceDocuments } from "@/lib/api/workspace";
import type { WorkspaceDocument, WorkspaceDocumentDetail } from "@/lib/api/workspace-types";
import { availableDocumentTools, documentToolLabels, type DocumentTool } from "@/lib/document-tools";
import { conversionFormatLabels, getConversionFormats } from "@/lib/conversion-formats";
import { validatePageSelection } from "@/lib/page-selection";
import { formatBytes } from "@/lib/format";
import { useJobPolling } from "@/hooks/useJobPolling";
import DownloadLink from "@/components/DownloadLink";
import ToolStorage from "@/components/ToolStorage";
import TextField from "@/components/ui/TextField";
import { isDownloadReady } from "@/lib/success-feedback";

export default function StoredDocumentTools({ document, initialTool }: { document: WorkspaceDocumentDetail; initialTool?: string }) {
  const tools = availableDocumentTools(document.format);
  const [tool, setTool] = useState<DocumentTool>(tools.includes(initialTool as DocumentTool) ? initialTool as DocumentTool : tools[0] || "converter");
  const [save, setSave] = useState(true);
  const [starting, setStarting] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [resultId, setResultId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [range, setRange] = useState("1");
  const [splitMode, setSplitMode] = useState("extract_range");
  const [mergeMode, setMergeMode] = useState("sequence");
  const [position, setPosition] = useState("end");
  const [watermark, setWatermark] = useState("CONFIDENTIAL");
  const [passwordEnabled, setPasswordEnabled] = useState(false);
  const [selected, setSelected] = useState<WorkspaceDocument[]>([]);
  const [choices, setChoices] = useState<WorkspaceDocument[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [choicesLoading, setChoicesLoading] = useState(false);
  const mutation = useRef(false);
  const { job, error: pollingError } = useJobPolling(jobId);
  const pending = starting || Boolean(jobId && !pollingError && job?.status !== "done" && job?.status !== "failed");
  const done = isDownloadReady(job);
  const formats = getConversionFormats([{ name: `source.${document.format}` }]);
  const rangeError = tool === "splitter" && splitMode === "extract_range" ? validatePageSelection(range).error : "";

  useEffect(() => {
    if (tool !== "merger") return;
    let active = true;
    listWorkspaceDocuments({ page, search }).then((response) => {
      if (!active) return;
      if (response.data) { setChoices(response.data.items); setTotal(response.data.total); }
      else setError(response.error || response.message);
      setChoicesLoading(false);
    });
    return () => { active = false; };
  }, [tool, search, page]);

  function changeTool(next: DocumentTool) {
    setTool(next); setError(""); setJobId(null); setResultId(null); setChoicesLoading(next === "merger");
  }
  function toggleChoice(choice: WorkspaceDocument) {
    setSelected((current) => current.some((item) => item.id === choice.id) ? current.filter((item) => item.id !== choice.id) : [...current, choice]);
  }
  function move(index: number, direction: number) {
    const next = [...selected];
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    setSelected(next);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.current || pending || rangeError) return;
    mutation.current = true; setStarting(true); setError(""); setJobId(null); setResultId(null);
    const body = new FormData(event.currentTarget);
    body.set("source_document_id", document.id);
    body.set("save_to_workspace", String(save));
    if (tool === "merger") selected.forEach((item) => body.append("source_document_ids", item.id));
    try {
      const response = await apiFetch<{ job_id: string; document_id: string }>(`/api/${tool}/process`, { method: "POST", body });
      if (!response.success || !response.data?.job_id || !response.data.document_id) { setError(response.error || response.message); return; }
      setResultId(response.data.document_id); setJobId(response.data.job_id);
    } finally { setStarting(false); mutation.current = false; }
  }
  const inputSize = document.size + selected.reduce((sum, item) => sum + item.size, 0);
  const mergeError = tool === "merger" && (!selected.length ? "Pilih dokumen tambahan untuk digabungkan." : mergeMode === "insert" && selected.length !== 1 ? "Mode sisipkan membutuhkan satu dokumen tambahan." : inputSize > 35 * 1024 * 1024 ? "Ukuran total berkas melebihi 35 MB." : selected.length >= 50 ? "Maksimal 50 berkas termasuk dokumen utama." : "");
  if (!document.is_saved || !document.download_available || !tools.length) return <section className="workspace-card" id="proses-dokumen"><h2>Proses dokumen</h2><p>{!document.is_saved ? "Simpan dokumen ke workspace terlebih dahulu untuk memprosesnya kembali." : !document.download_available ? "Berkas sudah tidak tersedia untuk diproses." : "Format ini belum didukung oleh tools. Anda tetap dapat mengunduh berkasnya."}</p></section>;
  return <section className="workspace-card document-tools" id="proses-dokumen">
    <div className="section-heading"><h2>Proses dokumen</h2><p>Gunakan berkas tersimpan langsung. Hasil dibuat sebagai dokumen baru.</p></div>
    <div className="workspace-actions" role="group" aria-label="Pilih tool">{tools.map((item) => <button key={item} type="button" disabled={pending} aria-pressed={item === tool} className={`ui-button ${item === tool ? "ui-button--primary" : ""}`} onClick={() => changeTool(item)}>{documentToolLabels[item]}</button>)}</div>
    {done && resultId ? <div className="document-tool-result" role="status"><h3>Dokumen selesai diproses</h3>
      <p>Ukuran hasil: {formatBytes(job?.output_size || 0)}</p>
      <ToolStorage value={save} onChange={setSave} disabled={false} documentId={resultId} done />
      <div className="workspace-actions"><Link className="ui-button ui-button--primary" href={`/dokumen/${resultId}`}>Lihat hasil & detail</Link><DownloadLink className="ui-button" href={getDownloadUrl(resultId)}>Unduh hasil</DownloadLink><button type="button" onClick={() => { setJobId(null); setResultId(null); }}>Proses sumber lagi</button></div>
    </div> : <form className="workspace-form" onSubmit={submit}>
      <fieldset disabled={pending} className="document-tool-fields">
        <p>Sumber: <strong>{document.name}</strong> · {formatBytes(document.size)}</p>
        {tool === "converter" && <label>Format hasil<select name="output_format">{formats.map((format) => <option key={format} value={format}>{conversionFormatLabels[format]}</option>)}</select></label>}
        {tool === "compressor" && <p className="field-hint">{document.format === "pptx" ? "PPTX menggunakan kompresi Seimbang. Semua slide, teks, catatan, dan objek dipertahankan; warna atau detail gambar dapat sedikit berubah. Dokumen sumber tetap tersimpan." : "Kompresi otomatis menyesuaikan format. Dokumen sumber tetap tersimpan."}</p>}
        {tool === "splitter" && <>
          <label>Mode pemisahan<select name="split_mode" value={splitMode} onChange={(event) => setSplitMode(event.target.value)}><option value="extract_range">Ambil rentang halaman</option><option value="fixed_interval">Per kelompok halaman (ZIP)</option><option value="all_single">Satu halaman per berkas (ZIP)</option></select></label>
          {splitMode === "extract_range" ? <><label>Rentang halaman<input name="range_expression" value={range} onChange={(event) => setRange(event.target.value)} placeholder="Contoh: 1-3,5" required aria-invalid={Boolean(rangeError)} /></label><label>Format hasil<select name="output_format"><option value="pdf">PDF</option><option value="docx">Word (DOCX)</option></select></label>{rangeError && <p role="alert" className="guest-error">{rangeError}</p>}</> : splitMode === "fixed_interval" && <label>Halaman per kelompok<input name="chunk_size" type="number" min="1" max="50" defaultValue="2" required /></label>}
        </>}
        {tool === "merger" && <>
          <label>Mode penggabungan<select name="merge_mode" value={mergeMode} onChange={(event) => setMergeMode(event.target.value)}><option value="sequence">Gabung berurutan</option><option value="insert">Sisipkan dokumen</option></select></label>
          <label>Cari dokumen tambahan<input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); setChoicesLoading(true); }} /></label>
          <div className="document-source-choices" aria-busy={choicesLoading}>{choices.filter((item) => item.id !== document.id && item.status === "done" && item.download_available !== false && availableDocumentTools(item.format || item.name.split(".").pop() || "").includes("merger")).map((item) => <label className="check-label" key={item.id}><input type="checkbox" checked={selected.some((chosen) => chosen.id === item.id)} onChange={() => toggleChoice(item)} />{item.name} <small>{formatBytes(item.size)}</small></label>)}{!choicesLoading && !choices.some((item) => item.id !== document.id) && <p>Belum ada dokumen tambahan. Unggah dokumen lewat Dokumen saya.</p>}</div>
          <div className="workspace-actions"><button type="button" disabled={page === 1 || choicesLoading} onClick={() => { setPage(page - 1); setChoicesLoading(true); }}>Sebelumnya</button><span>Halaman {page}</span><button type="button" disabled={page * 50 >= total || choicesLoading} onClick={() => { setPage(page + 1); setChoicesLoading(true); }}>Berikutnya</button></div>
          <ol className="document-source-order"><li>{document.name} <small>(dokumen utama)</small></li>{selected.map((item, index) => <li key={item.id}><span>{item.name}</span><div className="workspace-actions"><button type="button" disabled={index === 0} aria-label={`Naikkan ${item.name}`} onClick={() => move(index, -1)}>↑</button><button type="button" disabled={index === selected.length - 1} aria-label={`Turunkan ${item.name}`} onClick={() => move(index, 1)}>↓</button><button type="button" onClick={() => toggleChoice(item)}>Hapus</button></div></li>)}</ol>
          {mergeMode === "insert" && <><label>Posisi sisipan<select name="insert_position" value={position} onChange={(event) => setPosition(event.target.value)}><option value="start">Awal dokumen</option><option value="end">Akhir dokumen</option><option value="custom">Setelah halaman tertentu</option></select></label>{position === "custom" && <label>Setelah halaman<input name="after_page" type="number" min="1" defaultValue="1" required /></label>}</>}
          {mergeError && <p className="field-hint">{mergeError}</p>}
        </>}
        {tool === "watermark" && <>
          <label>Teks watermark<input name="watermark_text" maxLength={200} value={watermark} onChange={(event) => setWatermark(event.target.value)} placeholder="Kosongkan jika hanya memakai sandi" /></label>
          <label>Transparansi<input name="opacity" type="range" min="0.1" max="0.8" step="0.05" defaultValue="0.25" /></label>
          <label>Rotasi<select name="angle"><option value="45">45°</option><option value="0">0°</option><option value="-45">-45°</option></select></label>
          <label>Warna watermark<input name="color_hex" type="color" defaultValue="#64748b" /></label>
          <label className="check-label"><input type="checkbox" checked={passwordEnabled} onChange={(event) => setPasswordEnabled(event.target.checked)} />Lindungi dengan sandi</label>
          {passwordEnabled && <label>Kata sandi<TextField name="password" type="password" maxLength={128} autoComplete="new-password" required /></label>}
        </>}
        <label className="check-label"><input type="checkbox" checked={save} onChange={(event) => setSave(event.target.checked)} />Simpan hasil ke workspace</label>
        <button type="submit" className="ui-button ui-button--primary" disabled={Boolean(rangeError || mergeError) || (tool === "watermark" && !watermark.trim() && !passwordEnabled)}>{pending ? "Memproses…" : `Proses ${documentToolLabels[tool].toLowerCase()}`}</button>
      </fieldset>
    </form>}
    {pending && <p role="status">{job ? `Sedang memproses · ${job.progress}%` : "Menyiapkan proses…"} Hasil baru akan muncul di riwayat.</p>}
    {(error || pollingError) && <p role="alert" className="guest-error">{error || pollingError}</p>}
    {pollingError && resultId && <Link href="/riwayat-dokumen">Lihat status di riwayat dokumen</Link>}
  </section>;
}
