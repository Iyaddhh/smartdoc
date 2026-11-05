"use client";
import { useCallback, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { getAccount, updateAccount, revokeAccountSessions } from "@/lib/api/admin";
import { useAuth } from "@/lib/AuthContext";
import AccountUsage from "./AccountUsage";
import { AdminHeading, ErrorMessage, dateTime, useAdminResource } from "./shared";
import { isCompletedResponse, mutationFailure } from "@/lib/success-feedback";
import SuccessNotice from "@/components/ui/SuccessNotice";

export default function AdminUserDetail({ id }: { id: string }) {
  const loader = useCallback(() => getAccount(id), [id]);
  const { data: account, error, loading, refresh } = useAdminResource(loader);
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const inFlight = useRef(false);
  function begin() { if (inFlight.current || loading) return false; inFlight.current = true; setBusy(true); setMessage(""); setActionError(""); return true; }
  function finish() { inFlight.current = false; setBusy(false); }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!account) return;
    const form = new FormData(event.currentTarget);
    const active = account.role === "admin" ? account.is_active : form.has("active");
    if (!active && account.is_active && !window.confirm(`Nonaktifkan akun ${account.email} dan cabut seluruh sesinya?`)) return;
    if (!begin()) return;
    try {
      const response = await updateAccount(account.id, { is_active: active, storage_quota_mb: Number(form.get("quota")) });
      if (!isCompletedResponse(response)) setActionError(mutationFailure(response));
      else { setMessage("Pengaturan akun disimpan."); refresh(); }
    } finally { finish(); }
  }
  async function revoke() {
    if (!account || !window.confirm(`Cabut seluruh sesi akun ${account.email}?${account.id === user?.id ? " Anda akan keluar dari sesi ini." : ""}`) || !begin()) return;
    try {
      const response = await revokeAccountSessions(account.id);
      if (!isCompletedResponse(response)) setActionError(mutationFailure(response));
      else setMessage("Seluruh sesi akun dicabut.");
    } finally { finish(); }
  }
  return <section className="workspace-page"><Link className="admin-back-link" href="/administration/users">← Kembali ke pengguna</Link><AdminHeading title="Detail pengguna" description="Informasi dan pengelolaan akun. Dokumen serta agenda pribadi tidak tersedia di halaman ini." refresh={refresh} loading={loading || busy} /><ErrorMessage message={error || actionError} />{message && <SuccessNotice title={message} />}
    {account && <div className="admin-user-detail-layout"><section className="workspace-card dashboard-panel"><div className="section-heading"><h2>Informasi akun</h2><p>{account.email}</p></div><dl className="admin-settings-list">
      <div><dt>Nama tampilan</dt><dd>{account.display_name || "Belum diisi"}</dd></div><div><dt>Email</dt><dd>{account.email}</dd></div><div><dt>Role</dt><dd>{account.role === "admin" ? "Admin" : "Customer"}</dd></div><div><dt>Status akun</dt><dd>{account.is_active ? "Aktif" : "Nonaktif"}</dd></div><div><dt>Verifikasi email</dt><dd>{account.email_verified ? "Terverifikasi" : "Belum verifikasi"}</dd></div><div><dt>Profil awal</dt><dd>{account.onboarding_complete ? "Sudah dilengkapi" : "Belum dilengkapi"}</dd></div><div><dt>Terdaftar</dt><dd>{dateTime(account.created_at)}</dd></div><div><dt>ID akun</dt><dd><code>{account.id}</code></dd></div>
    </dl></section>
    <div className="planner-list"><section className="workspace-card dashboard-panel"><div className="section-heading"><h2>Penggunaan kuota</h2><p>Ukuran dokumen tercatat, mencakup berkas asli dan hasil pemrosesan. Isi dokumen tidak ditampilkan.</p></div><AccountUsage usedBytes={account.storage_used_bytes} quotaMB={account.storage_quota_mb} /></section><form key={`${account.id}-${account.is_active}-${account.storage_quota_mb}`} className="workspace-card dashboard-panel admin-account-access" onSubmit={save}><div className="section-heading"><h2>Pengaturan akses</h2><p>Perubahan status dan kuota dicatat pada audit admin.</p></div><fieldset className="planner-fields" disabled={busy || loading}><label className="check-label"><input name="active" type="checkbox" disabled={account.role === "admin"} defaultChecked={account.is_active} />Akun aktif</label>{account.role === "admin" && <p className="field-hint">Akun admin tidak dapat dinonaktifkan melalui panel ini.</p>}<label>Kuota upload langsung (MB)<input name="quota" type="number" min={10} max={100000} defaultValue={account.storage_quota_mb} required /></label><button className="ui-button ui-button--primary" type="submit">{busy ? "Memproses…" : "Simpan perubahan"}</button></fieldset></form>
      <section className="workspace-card dashboard-panel"><div className="section-heading"><h2>Sesi login</h2><p>Mencabut sesi akan mengeluarkan akun dari seluruh perangkat.</p></div><button className="admin-revoke-button" disabled={busy || loading} type="button" onClick={() => void revoke()}>Cabut seluruh sesi</button></section>
    </div></div>}
  </section>;
}
