"use client";
import { useCallback, useState } from "react";
import Link from "next/link";
import { Settings2 } from "lucide-react";
import { listAccounts } from "@/lib/api/admin";
import AccountUsage from "./AccountUsage";
import { AdminHeading, ErrorMessage, Pagination, useAdminResource } from "./shared";

export default function AdminUsers() {
  const [search, setSearch] = useState(""); const [draft, setDraft] = useState(""); const [page, setPage] = useState(1);
  const loader = useCallback(() => listAccounts(search, page), [search, page]);
  const { data, error, loading, refresh } = useAdminResource(loader);
  return <section className="workspace-page"><AdminHeading title="Pengguna" description="Pilih pengguna untuk melihat informasi akun dan mengelola aksesnya." refresh={refresh} loading={loading} /><ErrorMessage message={error} />
    <form className="workspace-toolbar" onSubmit={(event) => { event.preventDefault(); setPage(1); setSearch(draft.trim()); }}><label>Cari email<input type="search" name="search" maxLength={255} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Alamat email pengguna" /></label><button type="submit" disabled={loading}>Cari</button></form>
    <p className="field-hint">Gunakan ikon pengaturan pada kolom Aksi untuk mengelola akses akun. Geser tabel pada layar kecil.</p>
    <div className="workspace-table-wrap" aria-busy={loading}><table className="workspace-table admin-users-table"><caption className="sr-only">Daftar akun pengguna</caption><thead><tr><th scope="col">No.</th><th scope="col">Email</th><th scope="col">Role</th><th scope="col">Status akun</th><th scope="col">Verifikasi email</th><th scope="col">Penggunaan kuota</th><th scope="col">Aksi</th></tr></thead><tbody>{data?.items.map((account, index) => {
      const href = `/administration/users/${account.id}`;
      return <tr key={account.id}><td>{(data.page - 1) * data.page_size + index + 1}</td><td>{account.email}</td><td>{account.role === "admin" ? "Admin" : "Customer"}</td><td><span className={`badge ${account.is_active ? "badge-done" : "badge-neutral"}`}>{account.is_active ? "Aktif" : "Nonaktif"}</span></td><td>{account.email_verified ? "Terverifikasi" : "Belum verifikasi"}</td><td><AccountUsage usedBytes={account.storage_used_bytes} quotaMB={account.storage_quota_mb} /></td><td><div className="admin-table-actions"><Link className="admin-icon-action" href={href} title={`Pengaturan akses ${account.email}`} aria-label={`Pengaturan akses ${account.email}`}><Settings2 size={17} aria-hidden="true" /></Link></div></td></tr>;
    })}</tbody></table></div>{!loading && data && !data.items.length && <p>Pengguna tidak ditemukan.</p>}
    {data && data.total > data.page_size && <Pagination data={data} page={page} onChange={setPage} disabled={loading} />}
  </section>;
}
