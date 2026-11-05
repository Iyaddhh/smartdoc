"use client";

import PageHeading from "@/components/ui/PageHeading";

import { formatBytes } from "@/lib/format";

import DownloadLink from "@/components/DownloadLink";

import { useState, useEffect, useCallback } from "react";
import {
  listDocuments,
  deleteDocument,
  renameDocument,
  batchDeleteDocuments,
  batchDownloadDocuments,
  getDownloadUrl,
  DocumentItem,
} from "@/lib/api";
import { showToast } from "@/components/Toast";
import { isCompletedResponse, mutationFailure } from "@/lib/success-feedback";
import EmptyState from "@/components/EmptyState";
import {
  History,
  Download,
  Trash2,
  Pencil,
  Check,
  X,
  RefreshCw,
  FileOutput,
  Minimize2,
  Scissors,
  Combine,
  ShieldCheck,
  Search,
  AlertCircle,
  Layers,
  TrendingDown,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

type ActiveTab = "" | "converter" | "compressor" | "splitter" | "merger" | "watermark";


function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("id-ID", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

const TAB_CONFIG: { id: ActiveTab; label: string; icon: React.ReactNode }[] = [
  { id: "", label: "Semua Dokumen", icon: <Layers size={14} /> },
  { id: "converter", label: "Converter", icon: <FileOutput size={14} /> },
  { id: "compressor", label: "Compressor", icon: <Minimize2 size={14} /> },
  { id: "splitter", label: "Splitter", icon: <Scissors size={14} /> },
  { id: "merger", label: "Merger", icon: <Combine size={14} /> },
  { id: "watermark", label: "Watermark", icon: <ShieldCheck size={14} /> },
];

export default function RiwayatDokumenPage() {
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [allDocsCount, setAllDocsCount] = useState<Record<string, number>>({
    total: 0,
    converter: 0,
    compressor: 0,
    splitter: 0,
    merger: 0,
    watermark: 0,
  });
  const [activeTab, setActiveTab] = useState<ActiveTab>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10); // Minimum & default 10
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);
  const [isBatchDownloading, setIsBatchDownloading] = useState(false);

  // Debounce search query to prevent excessive backend queries
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    setFetchError(null);

    const [res, allRes] = await Promise.all([
      listDocuments({
        page,
        limit: pageSize,
        feature: activeTab || undefined,
        search: debouncedSearchQuery.trim() || undefined,
      }),
      listDocuments({ page: 1, limit: 1000 }),
    ]);

    if (res.success && res.data) {
      setDocs(res.data.items);
      const total = res.data.total_items ?? res.data.items.length;
      setTotalItems(total);
      setTotalPages(res.data.total_pages ?? Math.max(1, Math.ceil(total / pageSize)));
    } else {
      const err = res.error || "Gagal memuat riwayat dokumen";
      setFetchError(err);
      showToast("error", err, "Koneksi Bermasalah");
    }

    if (allRes.success && allRes.data) {
      const allItems = allRes.data.items;
      setAllDocsCount({
        total: allRes.data.total_items ?? allItems.length,
        converter: allItems.filter((d) => d.feature === "converter").length,
        compressor: allItems.filter((d) => d.feature === "compressor").length,
        splitter: allItems.filter((d) => d.feature === "splitter").length,
        merger: allItems.filter((d) => d.feature === "merger").length,
        watermark: allItems.filter((d) => d.feature === "watermark").length,
      });
    }

    setLoading(false);
  }, [page, pageSize, activeTab, debouncedSearchQuery]);

  useEffect(() => {
    // Synchronize paginated remote data when the query changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchDocs();
  }, [fetchDocs]);

  const filteredDocs = docs;

  const handleTabChange = (tab: ActiveTab) => {
    setActiveTab(tab);
    setPage(1);
    setSearchQuery("");
    setSelectedIds(new Set());
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages && newPage !== page) {
      setPage(newPage);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setPage(1);
  };

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push("...");
      const start = Math.max(2, page - 1);
      const end = Math.min(totalPages - 1, page + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (page < totalPages - 2) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  };

  const startItem = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, totalItems);

  const handleRenameStart = (doc: DocumentItem) => {
    setRenaming(doc.id);
    setRenameValue(doc.custom_name || doc.original_file || "");
  };

  const handleRenameSubmit = async (docId: string) => {
    if (!renameValue.trim()) {
      showToast("warning", "Nama dokumen tidak boleh kosong.", "Validasi");
      return;
    }
    const res = await renameDocument(docId, renameValue.trim());
    if (isCompletedResponse(res)) {
      setDocs((prev) =>
        prev.map((d) => (d.id === docId ? { ...d, custom_name: renameValue.trim() } : d))
      );
      setRenaming(null);
      showToast("success", "Nama dokumen berhasil diperbarui.", "Berhasil Disimpan");
    } else {
      showToast("error", mutationFailure(res), "Gagal Mengubah");
    }
  };

  const handleDelete = async (docId: string, name: string) => {
    if (!confirm(`Hapus "${name}" dari riwayat dan penyimpanan?`)) return;
    setDeletingId(docId);
    const res = await deleteDocument(docId);
    setDeletingId(null);
    if (isCompletedResponse(res)) {
      setDocs((prev) => prev.filter((d) => d.id !== docId));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(docId);
        return next;
      });
      fetchDocs();
      showToast("success", `Dokumen "${name}" berhasil dihapus.`, "Dokumen Dihapus");
    } else {
      showToast("error", mutationFailure(res), "Gagal Menghapus");
    }
  };

  // Multi-Select Handlers
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const isAllSelected =
    filteredDocs.length > 0 && filteredDocs.every((d) => selectedIds.has(d.id));
  const isSomeSelected =
    filteredDocs.some((d) => selectedIds.has(d.id)) && !isAllSelected;

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      const allIds = new Set(filteredDocs.map((d) => d.id));
      setSelectedIds(allIds);
    }
  };

  const handleBatchDelete = async () => {
    const count = selectedIds.size;
    if (count === 0) return;
    if (!confirm(`Hapus ${count} dokumen terpilih dari riwayat dan penyimpanan secara permanen?`)) {
      return;
    }

    setIsBatchDeleting(true);
    const idArray = Array.from(selectedIds);
    const res = await batchDeleteDocuments(idArray);
    setIsBatchDeleting(false);

    if (isCompletedResponse(res)) {
      setDocs((prev) => prev.filter((d) => !selectedIds.has(d.id)));
      setSelectedIds(new Set());
      fetchDocs();
      showToast(
        "success",
        `${res.data?.deleted_count ?? 0} dokumen terpilih berhasil dihapus.`,
        "Penghapusan Massal Sukses"
      );
    } else {
      showToast("error", mutationFailure(res), "Gagal Menghapus");
    }
  };

  const handleBatchDownload = async () => {
    const count = selectedIds.size;
    if (count === 0) return;

    setIsBatchDownloading(true);
    try {
      const idArray = Array.from(selectedIds);
      const blob = await batchDownloadDocuments(idArray);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `smartdoc_batch_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      showToast("info", "Paket dokumen siap. Unduhan dimulai; periksa daftar unduhan browser Anda.");
    } catch (err: unknown) {
      showToast("error", err instanceof Error ? err.message : "Gagal mengunduh kumpulan dokumen.", "Kendala Unduhan");
    } finally {
      setIsBatchDownloading(false);
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Header */}
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "16px" }}>
          <PageHeading title="Riwayat dokumen" description="Temukan hasil pemrosesan, unduh, atau kelola dokumen Anda." />
          <button className="btn btn-secondary btn-sm" onClick={fetchDocs} disabled={loading}><RefreshCw size={13} className={loading ? "animate-spin" : ""} />Perbarui data</button>
        </div>

      {/* Floating Sticky Batch Action Toolbar (When 1+ items selected) */}
      {selectedIds.size > 0 && (
        <div
          className="animate-fade-in"
          style={{
            position: "sticky",
            top: "16px",
            zIndex: 30,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "12px",
            padding: "12px 18px",
            borderRadius: "var(--radius-cards)",
            background: "var(--color-midnight-ink)",
            color: "var(--color-canvas-white)",
            boxShadow: "none",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "24px",
                height: "24px",
                borderRadius: "50%",
                background: "var(--color-electric-blue)",
                color: "var(--color-canvas-white)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "12px",
                fontWeight: 500,
              }}
            >
              {selectedIds.size}
            </div>
            <span style={{ fontSize: "13.5px", fontWeight: 500 }}>
              <strong>{selectedIds.size}</strong> berkas dokumen dipilih
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={toggleSelectAll}
              style={{
                background: "rgba(255, 255, 255, 0.12)",
                color: "var(--color-canvas-white)",
                borderColor: "rgba(255, 255, 255, 0.2)",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              {isAllSelected ? (
                <>
                  <X size={13} /> Batal Pilih Semua
                </>
              ) : (
                <>
                  <CheckSquare size={13} /> Pilih Semua ({filteredDocs.length})
                </>
              )}
            </button>

            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleBatchDownload}
              disabled={isBatchDownloading}
              style={{
                background: "var(--color-electric-blue)",
                borderColor: "var(--color-electric-blue)",
                color: "var(--color-canvas-white)",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              {isBatchDownloading ? (
                <>
                  <span className="animate-spin">⟳</span> Mengemas ZIP...
                </>
              ) : (
                <>
                  <Download size={14} /> Unduh Terpilih ({selectedIds.size})
                </>
              )}
            </button>

            <button
              type="button"
              className="btn btn-sm"
              onClick={handleBatchDelete}
              disabled={isBatchDeleting}
              style={{
                background: "var(--clr-error)",
                borderColor: "var(--clr-error)",
                color: "var(--color-canvas-white)",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              {isBatchDeleting ? (
                <>
                  <span className="animate-spin">⟳</span> Menghapus...
                </>
              ) : (
                <>
                  <Trash2 size={14} /> Hapus Terpilih ({selectedIds.size})
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Filter Tabs & Search Controls */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px",
          borderBottom: "1px solid var(--color-ash)",
          paddingBottom: "12px",
        }}
      >
        {/* Category Pill Group */}
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {TAB_CONFIG.map((tab) => {
            const isActive = activeTab === tab.id;
            const count =
              tab.id === ""
                ? allDocsCount.total
                : tab.id === "converter"
                ? allDocsCount.converter
                : tab.id === "compressor"
                ? allDocsCount.compressor
                : tab.id === "splitter"
                ? allDocsCount.splitter
                : tab.id === "merger"
                ? allDocsCount.merger
                : tab.id === "watermark"
                ? allDocsCount.watermark
                : 0;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabChange(tab.id)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "6px 12px",
                  borderRadius: "var(--radius-buttons)",
                  fontSize: "13px",
                  fontWeight: 500,
                  background: isActive ? "var(--color-midnight-ink)" : "var(--color-canvas-white)",
                  color: isActive ? "var(--color-canvas-white)" : "var(--color-graphite)",
                  border: `1px solid ${isActive ? "var(--color-midnight-ink)" : "var(--color-ash)"}`,
                  cursor: "pointer",
                  transition: "var(--transition-fast)",
                }}
              >
                {tab.icon}
                <span>{tab.label}</span>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 500,
                    padding: "1px 6px",
                    borderRadius: "var(--radius-tags)",
                    background: isActive ? "rgba(255,255,255,0.2)" : "var(--color-ash)",
                    color: isActive ? "var(--color-canvas-white)" : "var(--color-midnight-ink)",
                  }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search Input */}
        <div style={{ position: "relative", minWidth: "220px", flex: "1 1 auto", maxWidth: "320px" }}>
          <Search
            size={15}
            style={{
              position: "absolute",
              left: "10px",
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--color-graphite)",
              pointerEvents: "none",
            }}
          />
          <input
            className="input"
            style={{ paddingLeft: "32px", fontSize: "13px", height: "36px" }}
            placeholder="Cari nama dokumen..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Summary Metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "10px" }}>
        <div
          className="card"
          onClick={() => handleTabChange("")}
          style={{
            cursor: "pointer",
            border: "1px solid var(--color-ash)",
            padding: "var(--card-padding)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
            <div className="stat-icon" style={{ width: 28, height: 28 }}>
              <Layers size={13} />
            </div>
            <span style={{ fontSize: "11px", color: "var(--color-graphite)" }}>Total Arsip</span>
          </div>
          <p style={{ fontSize: "17px", fontWeight: 500, color: "var(--color-midnight-ink)" }}>
            {allDocsCount.total} <span style={{ fontSize: "11.5px", fontWeight: 400, color: "var(--color-graphite)" }}>file</span>
          </p>
        </div>

        <div
          className="card"
          onClick={() => handleTabChange("converter")}
          style={{
            cursor: "pointer",
            border: "1px solid var(--color-ash)",
            padding: "var(--card-padding)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
            <div className="stat-icon cyan" style={{ width: 28, height: 28 }}>
              <FileOutput size={13} />
            </div>
            <span style={{ fontSize: "11px", color: "var(--color-graphite)" }}>Converter</span>
          </div>
          <p style={{ fontSize: "17px", fontWeight: 500, color: "var(--color-midnight-ink)" }}>
            {allDocsCount.converter} <span style={{ fontSize: "11.5px", fontWeight: 400, color: "var(--color-graphite)" }}>file</span>
          </p>
        </div>

        <div
          className="card"
          onClick={() => handleTabChange("compressor")}
          style={{
            cursor: "pointer",
            border: "1px solid var(--color-ash)",
            padding: "var(--card-padding)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
            <div className="stat-icon green" style={{ width: 28, height: 28 }}>
              <Minimize2 size={13} />
            </div>
            <span style={{ fontSize: "11px", color: "var(--color-graphite)" }}>Compressor</span>
          </div>
          <p style={{ fontSize: "17px", fontWeight: 500, color: "var(--color-midnight-ink)" }}>
            {allDocsCount.compressor} <span style={{ fontSize: "11.5px", fontWeight: 400, color: "var(--color-graphite)" }}>file</span>
          </p>
        </div>

        <div
          className="card"
          onClick={() => handleTabChange("splitter")}
          style={{
            cursor: "pointer",
            border: "1px solid var(--color-ash)",
            padding: "var(--card-padding)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
            <div className="stat-icon blue" style={{ width: 28, height: 28 }}>
              <Scissors size={13} />
            </div>
            <span style={{ fontSize: "11px", color: "var(--color-graphite)" }}>Splitter</span>
          </div>
          <p style={{ fontSize: "17px", fontWeight: 500, color: "var(--color-midnight-ink)" }}>
            {allDocsCount.splitter} <span style={{ fontSize: "11.5px", fontWeight: 400, color: "var(--color-graphite)" }}>file</span>
          </p>
        </div>

        <div
          className="card"
          onClick={() => handleTabChange("merger")}
          style={{
            cursor: "pointer",
            border: "1px solid var(--color-ash)",
            padding: "var(--card-padding)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
            <div className="stat-icon cyan" style={{ width: 28, height: 28 }}>
              <Combine size={13} />
            </div>
            <span style={{ fontSize: "11px", color: "var(--color-graphite)" }}>Merger</span>
          </div>
          <p style={{ fontSize: "17px", fontWeight: 500, color: "var(--color-midnight-ink)" }}>
            {allDocsCount.merger} <span style={{ fontSize: "11.5px", fontWeight: 400, color: "var(--color-graphite)" }}>file</span>
          </p>
        </div>

        <div
          className="card"
          onClick={() => handleTabChange("watermark")}
          style={{
            cursor: "pointer",
            border: "1px solid var(--color-ash)",
            padding: "var(--card-padding)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
            <div className="stat-icon green" style={{ width: 28, height: 28 }}>
              <ShieldCheck size={13} />
            </div>
            <span style={{ fontSize: "11px", color: "var(--color-graphite)" }}>Watermark</span>
          </div>
          <p style={{ fontSize: "17px", fontWeight: 500, color: "var(--color-midnight-ink)" }}>
            {allDocsCount.watermark} <span style={{ fontSize: "11.5px", fontWeight: 400, color: "var(--color-graphite)" }}>file</span>
          </p>
        </div>

      </div>

      {/* Error state banner */}
      {fetchError && (
        <div className="alert alert-error animate-fade-in" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{fetchError}</span>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={fetchDocs} style={{ background: "var(--color-canvas-white)" }}>
            <RefreshCw size={13} /> Coba Lagi
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {[...Array(5)].map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 56, borderRadius: "var(--radius-cards)" }} />
          ))}
        </div>
      ) : filteredDocs.length === 0 ? (
        /* Empty State */
        <EmptyState
          icon={
            activeTab === "converter" ? (
              <FileOutput size={36} style={{ color: "var(--color-electric-blue)" }} />
            ) : activeTab === "compressor" ? (
              <Minimize2 size={36} style={{ color: "var(--clr-success)" }} />
            ) : activeTab === "splitter" ? (
              <Scissors size={36} style={{ color: "var(--color-electric-blue)" }} />
            ) : activeTab === "merger" ? (
              <Combine size={36} style={{ color: "var(--color-electric-blue)" }} />
            ) : activeTab === "watermark" ? (
              <ShieldCheck size={36} style={{ color: "var(--clr-success)" }} />
            ) : (
              <History size={36} style={{ color: "var(--color-graphite)" }} />
            )
          }
          title={
            searchQuery
              ? `Tidak ada dokumen yang cocok dengan "${searchQuery}"`
              : activeTab === "converter"
              ? "Belum ada riwayat konversi dokumen"
              : activeTab === "compressor"
              ? "Belum ada riwayat kompresi dokumen"
              : activeTab === "splitter"
              ? "Belum ada riwayat pemisahan dokumen"
              : activeTab === "merger"
              ? "Belum ada riwayat penggabungan dokumen"
              : activeTab === "watermark"
              ? "Belum ada riwayat watermark/keamanan dokumen"
              : "Belum ada riwayat pemrosesan dokumen"
          }
          description={
            searchQuery
              ? "Coba gunakan kata kunci pencarian lain atau bersihkan kotak pencarian."
              : "Unggah dan proses dokumen Anda melalui modul alat yang tersedia."
          }
          actionText={
            searchQuery
              ? "Hapus Pencarian"
              : activeTab === "converter"
              ? "Buka Converter"
              : activeTab === "compressor"
              ? "Buka Compressor"
              : activeTab === "splitter"
              ? "Buka Splitter"
              : activeTab === "merger"
              ? "Buka Merger"
              : activeTab === "watermark"
              ? "Buka Watermark"
              : "Mulai Konversi"
          }
          actionHref={
            searchQuery
              ? undefined
              : activeTab === "converter"
              ? "/converter"
              : activeTab === "compressor"
              ? "/compressor"
              : activeTab === "splitter"
              ? "/splitter"
              : activeTab === "merger"
              ? "/merger"
              : activeTab === "watermark"
              ? "/watermark"
              : "/converter"
          }
          onActionClick={searchQuery ? () => setSearchQuery("") : undefined}
        />
      ) : (
        /* Data Table */
        <div className="table-wrapper animate-fade-in">
          <table>
            <thead>
              <tr>
                <th style={{ width: "42px", textAlign: "center" }}>
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    ref={(input) => {
                      if (input) {
                        input.indeterminate = isSomeSelected;
                      }
                    }}
                    onChange={toggleSelectAll}
                    style={{ cursor: "pointer", width: "16px", height: "16px", accentColor: "var(--color-electric-blue)" }}
                    title={isAllSelected ? "Batal pilih semua" : "Pilih semua dokumen pada halaman ini"}
                  />
                </th>
                <th>Nama Dokumen</th>
                {activeTab === "" && <th>Kategori</th>}
                {activeTab === "converter" && <th>Format Output</th>}
                {activeTab === "splitter" && <th>Tipe Hasil</th>}
                <th>Ukuran Semula</th>
                <th>Ukuran Hasil</th>
                {activeTab === "compressor" && <th>Efisiensi</th>}
                <th>Status</th>
                <th>Waktu Proses</th>
                <th style={{ textAlign: "right" }}>Tindakan</th>
              </tr>
            </thead>
            <tbody>
              {filteredDocs.map((doc) => {
                const isSelected = selectedIds.has(doc.id);
                const displayName = doc.custom_name || doc.original_file || "—";
                const isCompressor = doc.feature === "compressor";
                const isConverter = doc.feature === "converter";
                const isSplitter = doc.feature === "splitter";
                const isMerger = doc.feature === "merger";
                const isWatermark = doc.feature === "watermark";

                const savings =
                  doc.original_size && doc.output_size
                    ? Math.round(((doc.original_size - doc.output_size) / doc.original_size) * 100)
                    : null;

                return (
                  <tr
                    key={doc.id}
                    style={{
                      background: isSelected ? "rgba(6, 182, 212, 0.07)" : undefined,
                      transition: "background 0.15s ease",
                    }}
                  >
                    {/* Checkbox Column */}
                    <td style={{ textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(doc.id)}
                        style={{ cursor: "pointer", width: "16px", height: "16px", accentColor: "var(--color-electric-blue)" }}
                      />
                    </td>

                    {/* File Name */}
                    <td style={{ maxWidth: "260px" }}>
                      {renaming === doc.id ? (
                        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                          <input
                            className="input"
                            style={{ padding: "4px 8px", fontSize: "13px" }}
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleRenameSubmit(doc.id)}
                            autoFocus
                          />
                          <button className="btn btn-primary btn-sm" onClick={() => handleRenameSubmit(doc.id)} title="Simpan">
                            <Check size={13} />
                          </button>
                          <button className="btn btn-secondary btn-sm" onClick={() => setRenaming(null)} title="Batal">
                            <X size={13} />
                          </button>
                        </div>
                      ) : (
                        <div>
                          <span style={{ fontWeight: 500, color: "var(--color-midnight-ink)", overflow: "hidden", textOverflow: "ellipsis", display: "block", whiteSpace: "nowrap" }}>
                            {displayName}
                          </span>
                          {doc.custom_name && doc.original_file && (
                            <span style={{ fontSize: "11px", color: "var(--color-graphite)" }}>
                              Asli: {doc.original_file}
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Category Column */}
                    {activeTab === "" && (
                      <td>
                        <span
                          className={`badge ${
                            isConverter
                              ? "badge-processing"
                              : isCompressor
                              ? "badge-done"
                              : isSplitter
                              ? "badge-info"
                              : isMerger
                              ? "badge-processing"
                              : isWatermark
                              ? "badge-done"
                              : "badge-neutral"
                          }`}
                          style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
                        >
                          {isConverter && <FileOutput size={12} />}
                          {isCompressor && <Minimize2 size={12} />}
                          {isSplitter && <Scissors size={12} />}
                          {isMerger && <Combine size={12} />}
                          {isWatermark && <ShieldCheck size={12} />}
                          {isConverter
                            ? "Converter"
                            : isCompressor
                            ? "Compressor"
                            : isSplitter
                            ? "Splitter"
                            : isMerger
                            ? "Merger"
                            : isWatermark
                            ? "Watermark"
                            : "Dokumen"}
                        </span>
                      </td>
                    )}

                    {/* Converter Format Column */}
                    {activeTab === "converter" && (
                      <td>
                        <span className="badge badge-neutral" style={{ fontSize: "11px" }}>
                          {doc.output_file?.split(".").pop()?.toUpperCase() || "PDF"}
                        </span>
                      </td>
                    )}

                    {/* Splitter Output Type Column */}
                    {activeTab === "splitter" && (
                      <td>
                        <span className="badge badge-info" style={{ fontSize: "11px" }}>
                          {doc.output_file?.endsWith(".zip") ? "Arsip ZIP" : "Ekstrak Halaman"}
                        </span>
                      </td>
                    )}


                    {/* Original Size */}
                    <td style={{ color: "var(--color-graphite)", whiteSpace: "nowrap" }}>
                      {formatBytes(doc.original_size, "—")}
                    </td>

                    {/* Output Size */}
                    <td style={{ whiteSpace: "nowrap" }}>
                      {doc.output_size ? (
                        <span style={{ fontWeight: 500, color: isCompressor ? "var(--clr-success)" : "var(--color-midnight-ink)" }}>
                          {formatBytes(doc.output_size, "—")}
                        </span>
                      ) : (
                        <span style={{ color: "var(--color-graphite)" }}>—</span>
                      )}
                    </td>

                    {/* Compressor Savings */}
                    {activeTab === "compressor" && (
                      <td>
                        {savings !== null && savings > 0 ? (
                          <span className="badge badge-done" style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}>
                            <TrendingDown size={11} /> -{savings}%
                          </span>
                        ) : (
                          <span style={{ color: "var(--color-graphite)", fontSize: "12px" }}>—</span>
                        )}
                      </td>
                    )}

                    {/* Status */}
                    <td>
                      <span
                        className={`badge ${
                          doc.status === "done"
                            ? "badge-done"
                            : doc.status === "processing"
                            ? "badge-processing"
                            : "badge-failed"
                        }`}
                      >
                        {doc.status === "done" ? "Selesai" : doc.status === "processing" ? "Memproses" : "Gagal"}
                      </span>
                    </td>

                    {/* Created Date */}
                    <td style={{ color: "var(--color-graphite)", fontSize: "12.5px", whiteSpace: "nowrap" }}>
                      {formatDate(doc.created_at)}
                    </td>

                    {/* Actions */}
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <div style={{ display: "inline-flex", gap: "6px", alignItems: "center" }}>
                        {doc.status === "done" && (
                          <DownloadLink
                            href={getDownloadUrl(doc.id)}
                            download
                            title="Unduh Berkas Hasil"
                            className="btn btn-secondary btn-sm"
                            style={{ padding: "5px 9px", color: "var(--color-electric-blue)" }}
                          >
                            <Download size={13} />
                          </DownloadLink>
                        )}

                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ padding: "5px 9px" }}
                          onClick={() => handleRenameStart(doc)}
                          title="Ganti Nama"
                        >
                          <Pencil size={13} />
                        </button>

                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ padding: "5px 9px", color: "var(--clr-error)" }}
                          onClick={() => handleDelete(doc.id, displayName)}
                          disabled={deletingId === doc.id}
                          title="Hapus Dokumen"
                        >
                          {deletingId === doc.id ? (
                            <span className="animate-spin" style={{ display: "inline-block" }}>⟳</span>
                          ) : (
                            <Trash2 size={13} />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Pagination Controls */}
          <div className="pagination-bar">
            <div className="pagination-info">
              <span>
                Menampilkan <strong>{startItem}</strong>–<strong>{endItem}</strong> dari{" "}
                <strong>{totalItems}</strong> dokumen
              </span>

              <div className="pagination-page-size">
                <span>Tampilkan:</span>
                <select
                  className="pagination-select"
                  value={pageSize}
                  onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                  aria-label="Pilih jumlah dokumen per halaman"
                >
                  <option value={10}>10 per halaman</option>
                  <option value={20}>20 per halaman</option>
                  <option value={50}>50 per halaman</option>
                  <option value={100}>100 per halaman</option>
                </select>
              </div>
            </div>

            <div className="pagination-controls">
              <button
                type="button"
                className="pagination-btn"
                onClick={() => handlePageChange(1)}
                disabled={page <= 1 || loading}
                title="Halaman Pertama"
                aria-label="Halaman Pertama"
              >
                <ChevronsLeft size={14} />
              </button>
              <button
                type="button"
                className="pagination-btn"
                onClick={() => handlePageChange(page - 1)}
                disabled={page <= 1 || loading}
                title="Halaman Sebelumnya"
                aria-label="Halaman Sebelumnya"
              >
                <ChevronLeft size={14} />
              </button>

              {getPageNumbers().map((pNum, idx) =>
                pNum === "..." ? (
                  <span key={`ellipsis-${idx}`} className="pagination-ellipsis">
                    …
                  </span>
                ) : (
                  <button
                    key={`page-${pNum}`}
                    type="button"
                    className={`pagination-btn ${page === pNum ? "active" : ""}`}
                    onClick={() => handlePageChange(Number(pNum))}
                    disabled={loading}
                  >
                    {pNum}
                  </button>
                )
              )}

              <button
                type="button"
                className="pagination-btn"
                onClick={() => handlePageChange(page + 1)}
                disabled={page >= totalPages || loading}
                title="Halaman Berikutnya"
                aria-label="Halaman Berikutnya"
              >
                <ChevronRight size={14} />
              </button>
              <button
                type="button"
                className="pagination-btn"
                onClick={() => handlePageChange(totalPages)}
                disabled={page >= totalPages || loading}
                title="Halaman Terakhir"
                aria-label="Halaman Terakhir"
              >
                <ChevronsRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
