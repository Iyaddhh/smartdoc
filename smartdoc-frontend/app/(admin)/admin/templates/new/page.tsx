"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createTemplate } from "@/lib/api";
import { showToast } from "@/components/Toast";
import { Plus, Trash2, Upload, CheckCircle2, ArrowLeft, AlertCircle } from "lucide-react";

interface FieldDef {
  key: string;
  label: string;
  type: string;
  zone: { x_norm: number; y_norm: number; w_norm: number; h_norm: number };
}

export default function NewTemplatePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [docxFile, setDocxFile] = useState<File | null>(null);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [touchedSubmit, setTouchedSubmit] = useState(false);

  const docxInputRef = useRef<HTMLInputElement>(null);
  const thumbInputRef = useRef<HTMLInputElement>(null);

  const addField = () => {
    setFields((prev) => [
      ...prev,
      { key: "", label: "", type: "text", zone: { x_norm: 0, y_norm: 0, w_norm: 0.2, h_norm: 0.05 } },
    ]);
  };

  const updateField = (i: number, updates: Partial<FieldDef>) => {
    setFields((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...updates } : f)));
  };

  const removeField = (i: number) => {
    setFields((prev) => prev.filter((_, idx) => idx !== i));
  };

  const handleSubmit = async () => {
    setTouchedSubmit(true);

    if (!name.trim()) {
      setError("Nama template wajib diisi.");
      showToast("warning", "Nama template wajib diisi.", "Validasi Form");
      return;
    }
    if (!docxFile) {
      setError("File .docx template wajib diunggah.");
      showToast("warning", "File .docx template wajib diunggah.", "Validasi Form");
      return;
    }
    if (fields.length === 0) {
      setError("Tambahkan minimal satu bidang field OCR.");
      showToast("warning", "Tambahkan minimal satu bidang field OCR.", "Validasi Form");
      return;
    }

    const emptyKey = fields.find((f) => !f.key.trim() || !f.label.trim());
    if (emptyKey) {
      setError("Semua field harus memiliki key tag dan label tampilan.");
      showToast("warning", "Semua field harus memiliki key tag dan label tampilan.", "Validasi Form");
      return;
    }

    setLoading(true);
    setError(null);

    const form = new FormData();
    form.append("name", name.trim());
    form.append("description", description.trim());
    form.append("fields_json", JSON.stringify(fields));
    form.append("docx_file", docxFile);
    if (thumbnailFile) form.append("thumbnail_file", thumbnailFile);

    const res = await createTemplate(form);
    setLoading(false);

    if (!res.success) {
      const msg = res.error || "Gagal membuat template";
      setError(msg);
      showToast("error", msg, "Gagal Menyimpan");
      return;
    }

    showToast("success", `Template "${name}" berhasil dibuat!`, "Sukses");
    setSuccess(true);
    setTimeout(() => router.push("/admin/templates"), 1200);
  };

  if (success) {
    return (
      <div className="animate-fade-in card" style={{ textAlign: "center", padding: "64px 24px", maxWidth: "560px", margin: "40px auto" }}>
        <div className="stat-icon green" style={{ width: 56, height: 56, margin: "0 auto 16px", borderRadius: "50%" }}>
          <CheckCircle2 size={32} style={{ color: "var(--clr-success)" }} />
        </div>
        <h3 style={{ fontWeight: 600, fontSize: "20px", color: "var(--color-ink-black)", marginBottom: "4px" }}>
          Template Berhasil Dibuat!
        </h3>
        <p style={{ color: "var(--color-warm-gray)", fontSize: "14px" }}>
          Mengalihkan Anda ke halaman daftar template...
        </p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
      <div>
        <Link href="/admin/templates" style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "var(--color-warm-gray)", fontSize: "13px" }}>
          <ArrowLeft size={15} /> Kembali ke Daftar Template
        </Link>
      </div>

      <div className="page-header">
        <h2>
          Buat <span className="highlight-span">Template Baru</span>
        </h2>
        <p>Definisikan nama, berkas .docx template, dan pemetaan koordinat OCR.</p>
      </div>

      <div className="grid-2" style={{ alignItems: "start" }}>
        {/* Left: General Info & Files */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div className="card">
            <h3 style={{ fontSize: "15px", fontWeight: 600, marginBottom: "16px", color: "var(--color-ink-black)" }}>
              Informasi Umum
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label style={{ fontSize: "13px", fontWeight: 500, display: "block", marginBottom: "6px", color: "var(--color-ink-black)" }}>
                  Nama Template *
                </label>
                <input
                  className="input"
                  style={{ borderColor: touchedSubmit && !name.trim() ? "var(--clr-error)" : undefined }}
                  placeholder="cth: Form Absensi Bulanan"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div>
                <label style={{ fontSize: "13px", fontWeight: 500, display: "block", marginBottom: "6px", color: "var(--color-ink-black)" }}>
                  Deskripsi
                </label>
                <input
                  className="input"
                  placeholder="Keterangan singkat fungsi template (opsional)"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>
          </div>

          <div className="card">
            <h3 style={{ fontSize: "15px", fontWeight: 600, marginBottom: "8px", color: "var(--color-ink-black)" }}>
              Berkas Template (.docx) *
            </h3>
            <p style={{ fontSize: "13px", color: "var(--color-warm-gray)", marginBottom: "14px", lineHeight: 1.5 }}>
              Upload file .docx yang memuat placeholder tag <code style={{ background: "var(--color-stone-canvas)", border: "1px solid var(--color-stone-border)", padding: "1px 6px", borderRadius: "4px", fontSize: "12px", color: "var(--color-cyan-edge)" }}>{"{{nama_field}}"}</code> sesuai key.
            </p>
            <button
              className="btn btn-secondary"
              onClick={() => docxInputRef.current?.click()}
              disabled={loading}
              style={{
                borderColor: touchedSubmit && !docxFile ? "var(--clr-error)" : undefined,
              }}
            >
              <Upload size={15} />
              {docxFile ? docxFile.name : "Pilih File .docx"}
            </button>
            <input ref={docxInputRef} type="file" accept=".docx" style={{ display: "none" }} onChange={(e) => setDocxFile(e.target.files?.[0] || null)} />
          </div>

          <div className="card">
            <h3 style={{ fontSize: "15px", fontWeight: 600, marginBottom: "8px", color: "var(--color-ink-black)" }}>
              Thumbnail Preview (Opsional)
            </h3>
            <p style={{ fontSize: "13px", color: "var(--color-warm-gray)", marginBottom: "14px" }}>
              Gambar contoh format dokumen untuk mempermudah identifikasi.
            </p>
            <button className="btn btn-secondary" onClick={() => thumbInputRef.current?.click()} disabled={loading}>
              <Upload size={15} />
              {thumbnailFile ? thumbnailFile.name : "Pilih Gambar Preview"}
            </button>
            <input ref={thumbInputRef} type="file" accept=".jpg,.jpeg,.png" style={{ display: "none" }} onChange={(e) => setThumbnailFile(e.target.files?.[0] || null)} />
          </div>
        </div>

        {/* Right: Field definitions */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ fontSize: "15px", fontWeight: 600, color: "var(--color-ink-black)" }}>
                Definisi Field ({fields.length})
              </h3>
              <button className="btn btn-primary btn-sm" onClick={addField} disabled={loading}>
                <Plus size={14} /> Tambah Field
              </button>
            </div>

            {fields.length === 0 ? (
              <div style={{ textAlign: "center", padding: "32px", color: "var(--color-warm-gray)" }}>
                <p style={{ fontSize: "13.5px" }}>Belum ada field. Klik tombol di atas untuk menambahkan bidang.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {fields.map((field, i) => {
                  const hasKeyError = touchedSubmit && !field.key.trim();
                  const hasLabelError = touchedSubmit && !field.label.trim();
                  return (
                    <div
                      key={i}
                      style={{
                        padding: "14px",
                        background: "var(--color-stone-canvas)",
                        border: "1px solid var(--color-stone-border)",
                        borderRadius: "var(--radius-inputs)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                        <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--color-warm-gray)" }}>
                          Field #{i + 1}
                        </span>
                        <button className="btn btn-danger btn-sm" onClick={() => removeField(i)} style={{ padding: "3px 8px" }} disabled={loading}>
                          <Trash2 size={12} />
                        </button>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "10px" }}>
                        <div>
                          <label style={{ fontSize: "11px", fontWeight: 500, display: "block", marginBottom: "4px", color: "var(--color-ink-black)" }}>Key Tag *</label>
                          <input
                            className="input"
                            style={{
                              padding: "6px 8px",
                              fontSize: "13px",
                              borderColor: hasKeyError ? "var(--clr-error)" : undefined,
                            }}
                            placeholder="cth: nama_lengkap"
                            value={field.key}
                            onChange={(e) => updateField(i, { key: e.target.value.replace(/\s/g, "_").toLowerCase() })}
                            disabled={loading}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: "11px", fontWeight: 500, display: "block", marginBottom: "4px", color: "var(--color-ink-black)" }}>Label Tampilan *</label>
                          <input
                            className="input"
                            style={{
                              padding: "6px 8px",
                              fontSize: "13px",
                              borderColor: hasLabelError ? "var(--clr-error)" : undefined,
                            }}
                            placeholder="cth: Nama Lengkap"
                            value={field.label}
                            onChange={(e) => updateField(i, { label: e.target.value })}
                            disabled={loading}
                          />
                        </div>
                      </div>

                      <div style={{ fontSize: "11px", color: "var(--color-warm-gray)", marginBottom: "6px" }}>
                        Koordinat Zona (Ternormalisasi 0.0 – 1.0):
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "6px" }}>
                        {(["x_norm", "y_norm", "w_norm", "h_norm"] as const).map((k) => (
                          <div key={k}>
                            <label style={{ fontSize: "10px", color: "var(--color-ash-gray)", display: "block", marginBottom: "2px" }}>{k}</label>
                            <input
                              type="number"
                              className="input"
                              style={{ padding: "4px 6px", fontSize: "12px" }}
                              min={0} max={1} step={0.01}
                              value={field.zone[k]}
                              onChange={(e) => updateField(i, { zone: { ...field.zone, [k]: parseFloat(e.target.value) || 0 } })}
                              disabled={loading}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {error && (
            <div className="alert alert-error animate-fade-in">
              <AlertCircle size={15} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          <button
            className="btn btn-primary btn-lg"
            onClick={handleSubmit}
            disabled={loading}
            style={{ width: "100%" }}
          >
            {loading ? (
              <>
                <span className="animate-spin">⟳</span> Menyimpan Template...
              </>
            ) : (
              "Simpan & Buat Template"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
