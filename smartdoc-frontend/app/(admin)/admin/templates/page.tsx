"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { listTemplates, deleteTemplate, TemplateItem } from "@/lib/api";
import { showToast } from "@/components/Toast";
import EmptyState from "@/components/EmptyState";
import { LayoutTemplate, Plus, Pencil, Trash2, RefreshCw, CheckCircle2, XCircle, AlertCircle } from "lucide-react";

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    const res = await listTemplates();
    if (res.success && res.data) {
      setTemplates(Array.isArray(res.data) ? res.data : []);
    } else {
      const err = res.error || "Gagal memuat daftar template";
      setFetchError(err);
      showToast("error", err, "Koneksi Bermasalah");
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Hapus template "${name}"?`)) return;
    setDeletingId(id);
    const res = await deleteTemplate(id);
    setDeletingId(null);

    if (res.success) {
      showToast("success", `Template "${name}" berhasil dihapus.`, "Dihapus");
      fetchTemplates();
    } else {
      showToast("error", res.error || "Gagal menghapus template.", "Error");
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
      {/* Header */}
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <h2>
            Manajemen <span className="highlight-span">Template OCR</span>
          </h2>
          <p>Kelola konfigurasi template dokumen dan pemetaan zona ekstraksi data.</p>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <button className="btn btn-secondary btn-sm" onClick={fetchTemplates} disabled={loading}>
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
          <Link href="/admin/templates/new">
            <button className="btn btn-primary">
              <Plus size={15} /> Buat Template
            </button>
          </Link>
        </div>
      </div>

      {/* Error state */}
      {fetchError && (
        <div className="alert alert-error animate-fade-in" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <AlertCircle size={16} />
            <span>{fetchError}</span>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={fetchTemplates} style={{ background: "var(--color-pure-white)" }}>
            <RefreshCw size={13} /> Coba Lagi
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {[...Array(3)].map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 76, borderRadius: "var(--radius-cards)" }} />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <EmptyState
          icon={<LayoutTemplate size={36} style={{ color: "var(--color-ash-gray)" }} />}
          title="Belum ada template terdaftar"
          description="Buat template pertama Anda untuk mendefinisikan bidang data dan zona OCR dokumen berulang."
          actionText="Buat Template Pertama"
          actionHref="/admin/templates/new"
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {templates.map((tpl) => (
            <div
              key={tpl.id}
              className="card animate-fade-in"
              style={{ display: "flex", alignItems: "center", gap: "16px", padding: "16px 20px" }}
            >
              {/* Thumbnail */}
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "var(--radius-inputs)",
                  background: "var(--color-stone-canvas)",
                  border: "1px solid var(--color-stone-border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  overflow: "hidden",
                }}
              >
                {tpl.thumbnail ? (
                  <img src={tpl.thumbnail} alt={tpl.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <LayoutTemplate size={20} style={{ color: "var(--color-warm-gray)" }} />
                )}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <h3 style={{ fontWeight: 600, fontSize: "15px", color: "var(--color-ink-black)" }}>
                    {tpl.name}
                  </h3>
                  <span
                    style={{
                      fontSize: "11px",
                      color: "var(--color-warm-gray)",
                      background: "var(--color-stone-canvas)",
                      border: "1px solid var(--color-stone-border)",
                      borderRadius: "var(--radius-tags)",
                      padding: "1px 8px",
                      fontWeight: 500,
                    }}
                  >
                    v{tpl.version}
                  </span>
                  {tpl.is_active ? (
                    <span className="badge badge-done" style={{ fontSize: "11px" }}>
                      <CheckCircle2 size={11} /> Aktif
                    </span>
                  ) : (
                    <span className="badge badge-failed" style={{ fontSize: "11px" }}>
                      <XCircle size={11} /> Nonaktif
                    </span>
                  )}
                </div>
                <p style={{ fontSize: "13px", color: "var(--color-warm-gray)", marginTop: "3px" }}>
                  {tpl.description || "Tidak ada deskripsi"} · {tpl.fields?.length || 0} bidang field
                </p>
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: "8px" }}>
                <Link href={`/admin/templates/${tpl.id}/edit`}>
                  <button className="btn btn-secondary btn-sm">
                    <Pencil size={13} /> Edit
                  </button>
                </Link>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => handleDelete(tpl.id, tpl.name)}
                  disabled={deletingId === tpl.id}
                >
                  {deletingId === tpl.id ? (
                    <span className="animate-spin">⟳</span>
                  ) : (
                    <Trash2 size={13} />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
