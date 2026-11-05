"use client";
import { useCallback, useEffect, useState } from "react";
import type { ApiResponse } from "@/lib/api/types";
import type { PageResult } from "@/lib/api/admin-types";
import PageHeading from "@/components/ui/PageHeading";

export const toolLabels: Record<string, string> = { converter: "Konversi", compressor: "Kompresi", splitter: "Pisah halaman", merger: "Gabung berkas", watermark: "Watermark & sandi", other: "Lainnya" };
export const statusLabels: Record<string, string> = { pending: "Menunggu", processing: "Diproses", done: "Selesai", failed: "Gagal", unknown: "Tidak diketahui" };
export const dateTime = (date: string) => new Date(date).toLocaleString("id-ID");
export const sizeLabel = (bytes: number) => bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;

export function useAdminResource<T>(loader: () => Promise<ApiResponse<T>>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((v) => v + 1), []);
  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      const response = await loader();
      if (!active) return;
      if (response.success && response.data) { setData(response.data); setError(""); }
      else { setData(null); setError(response.message || "Gagal memuat administrasi."); }
      setLoading(false);
    }
    void load(); return () => { active = false; };
  }, [loader, revision]);
  return { data, error, loading, refresh };
}

export function AdminHeading({ title, description, refresh, loading }: { title: string; description: string; refresh: () => void; loading: boolean }) {
  return <div className="admin-page-heading"><PageHeading title={title} description={description} /><button type="button" onClick={refresh} disabled={loading}>{loading ? "Memuat…" : "Perbarui data"}</button></div>;
}

export function Pagination({ data, page, onChange, disabled }: { data: PageResult<unknown> | null; page: number; onChange: (value: number) => void; disabled: boolean }) {
  return <div className="workspace-toolbar"><button disabled={disabled || page <= 1} onClick={() => onChange(page - 1)}>Sebelumnya</button><span>Halaman {page} · {data?.total ?? 0} data</span><button disabled={disabled || !data || page * data.page_size >= data.total} onClick={() => onChange(page + 1)}>Berikutnya</button></div>;
}

export function ErrorMessage({ message }: { message: string }) { return message ? <p role="alert" className="guest-error">{message}</p> : null; }
