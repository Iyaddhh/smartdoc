"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { ChevronDown, Combine, FileOutput, Minimize2, Scissors, ShieldCheck } from "lucide-react";

const tools = [
  { id: "converter", name: "Konversi", icon: FileOutput },
  { id: "compressor", name: "Kompresi", icon: Minimize2 },
  { id: "splitter", name: "Pisah halaman", icon: Scissors },
  { id: "merger", name: "Gabung berkas", icon: Combine },
  { id: "watermark", name: "Watermark & sandi", icon: ShieldCheck },
] as const;
type Tool = typeof tools[number]["id"];

export default function GuestTools() {
  const [tool, setTool] = useState<Tool | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ url: string; name: string } | null>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url); }, [result]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !tool) return;
    const form = new FormData(event.currentTarget);
    form.delete("files");
    files.forEach((file) => form.append("files", file));
    setResult(null);
    setError("");
    setBusy(true);
    const abort = new AbortController();
    controller.current = abort;
    try {
      // This endpoint deliberately receives no account token and creates no history.
      const response = await fetch(`/api/guest/${tool}`, { method: "POST", body: form, signal: abort.signal, credentials: "omit" });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message || (typeof body?.detail === "string" ? body.detail : "Berkas gagal diproses. Coba lagi."));
      }
      const blob = await response.blob();
      if (abort.signal.aborted) return;
      const disposition = response.headers.get("Content-Disposition") || "";
      const name = disposition.match(/filename="([^"]+)"/)?.[1] || "hasil";
      setResult({ url: URL.createObjectURL(blob), name });
    } catch (cause) {
      if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : "Koneksi gagal. Coba lagi.");
    } finally {
      if (!abort.signal.aborted) setBusy(false);
    }
  }

  const multiple = tool === "converter" || tool === "merger";
  const accept = tool === "watermark" || tool === "splitter" ? ".pdf,.docx" : ".pdf,.docx,.xlsx,.pptx,.jpg,.jpeg,.png";

  return (
    <section className="guest-tools" id="tools" aria-label="Tools dokumen">
      <div className="guest-tool-picker" aria-label="Pilihan tools">
        {tools.map(({ id, name, icon: Icon }) => <button key={id} id={`guest-tool-${id}`} type="button" disabled={busy} aria-expanded={tool === id} aria-controls="guest-tool-input"
          onClick={() => { setTool(tool === id ? null : id); setFiles([]); setResult(null); setError(""); }}>
          <Icon size={20} aria-hidden="true" />{name}
          <ChevronDown size={16} aria-hidden="true" style={{ transform: tool === id ? "rotate(180deg)" : undefined }} />
        </button>)}
      </div>
      {tool && <form key={tool} id="guest-tool-input" onSubmit={submit} className="guest-tool-form" aria-busy={busy} aria-labelledby={`guest-tool-${tool}`}>
        <label className="guest-upload">{multiple ? "Pilih berkas" : "Pilih satu berkas"}
          <input type="file" name="files" required accept={accept} multiple={multiple} disabled={busy}
            onChange={(event) => { setFiles(Array.from(event.target.files || [])); setResult(null); setError(""); }} />
        </label>
        <p className="guest-help">{tool === "merger" ? "Berkas digabung sesuai urutan pilihan. Minimal dua berkas." : tool === "converter" ? "PDF ke Word/gambar; Office atau gambar ke PDF. Banyak berkas hanya untuk gambar ke PDF." : `Format: ${accept.replaceAll(",", ", ")}.`} Maksimal total 35 MB per proses.</p>
        {files.length > 0 && <ul className="guest-file-list">{files.map((file, index) => <li key={`${index}-${file.name}`}>{file.name}</li>)}</ul>}
        {tool === "converter" && <label>Format hasil<select name="output_format" disabled={busy} defaultValue="pdf">
          <option value="pdf">PDF</option><option value="docx">Word (DOCX)</option><option value="jpg">Gambar JPG (ZIP)</option><option value="png">Gambar PNG (ZIP)</option>
        </select></label>}
        {tool === "splitter" && <>
          <label>Mode pemisahan<select name="split_mode" disabled={busy} defaultValue="range">
            <option value="range">Ambil rentang halaman</option><option value="all">Satu halaman per berkas (ZIP)</option><option value="chunks">Per kelompok halaman (ZIP)</option>
          </select></label>
          <label>Rentang halaman<input name="page_range" placeholder="Contoh: 1-3,5" defaultValue="1" disabled={busy} /></label>
          <label>Halaman per kelompok<input name="chunk_size" type="number" min="1" max="50" defaultValue="1" disabled={busy} /></label>
        </>}
        {tool === "watermark" && <>
          <label>Teks watermark<input name="watermark_text" maxLength={200} placeholder="Contoh: DRAFT" disabled={busy} /></label>
          <label>Kata sandi PDF (opsional)<input name="password" type="password" maxLength={128} autoComplete="new-password" disabled={busy} /></label>
          <p className="guest-help">Isi teks watermark, kata sandi, atau keduanya.</p>
        </>}
        <button className="landing-primary" type="submit" disabled={busy || files.length === 0 || (tool === "merger" && files.length < 2)}>{busy ? "Memproses berkas…" : "Proses tanpa login"}</button>
        <p role="status" aria-live="polite">{busy ? "Tunggu hingga selesai. Halaman ini harus tetap terbuka." : result ? "Selesai. Unduh hasil sebelum meninggalkan halaman ini." : ""}</p>
        {error && <p role="alert" className="guest-error">{error}</p>}
        {result && <a className="landing-primary" href={result.url} download={result.name}>Unduh hasil</a>}
        <p className="guest-help">Berkas tidak masuk riwayat atau workspace. Salinan sementara di server dihapus setelah hasil dikirim ke browser. Hasil di halaman ini hilang saat Anda memuat ulang atau meninggalkan halaman.</p>
      </form>}
    </section>
  );
}
