"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import { sessionFetch } from "@/lib/session";
import type { UserRole } from "@/lib/auth-token";
import { getHomePath } from "@/lib/auth-token";
import PageHeading from "@/components/ui/PageHeading";
import TextField from "@/components/ui/TextField";
import { Sparkles } from "lucide-react";
import ErrorScreen from "@/components/errors/ErrorScreen";
import SuccessNotice from "@/components/ui/SuccessNotice";
import { showToast } from "@/components/Toast";

type Mode = "login" | "register" | "forgot-password" | "reset-password" | "verify-email" | "check-email" | "onboarding";
const headings: Record<Mode, { title: string; accent: string }> = { login: { title: "Masuk ke", accent: "SmartDoc" }, register: { title: "Buat", accent: "akun" }, "forgot-password": { title: "Lupa", accent: "password" }, "reset-password": { title: "Buat password", accent: "baru" }, "verify-email": { title: "Verifikasi", accent: "email" }, "check-email": { title: "Periksa", accent: "email Anda" }, onboarding: { title: "Lengkapi", accent: "profil" } };

export default function AuthScreen({ mode, role = "user" }: { mode: Mode; role?: UserRole }) {
  const { user, login, retryAuth, acceptProfile, isLoading, authErrorStatus } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  useEffect(() => {
    if (mode === "login" && !isLoading && user) router.replace(user.onboarding_complete ? getHomePath(user.role) : "/auth/onboarding");
    if (mode === "onboarding" && !isLoading && !user && !authErrorStatus) router.replace("/login");
  }, [mode, user, isLoading, authErrorStatus, router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    const form = new FormData(event.currentTarget);
    setBusy(true); setError(""); setMessage("");
    try {
      if (mode === "login") {
        const result = await login(String(form.get("email")), String(form.get("password")), role, form.has("remember_me"));
        if (!result.success) throw new Error(result.error);
        return; // AuthContext loads the profile and the effect routes to onboarding/workspace.
      }
      let path: string = mode === "check-email" ? "resend-verification" : mode;
      const payload: Record<string, unknown> = Object.fromEntries(form.entries());
      if (mode === "register") payload.accept_terms = form.has("accept_terms");
      if (mode === "verify-email" || mode === "reset-password") {
        payload.token = new URLSearchParams(window.location.search).get("token") || "";
      }
      if (mode === "onboarding") path = "profile";
      const response = await sessionFetch(`/api/auth/${path}`, { method: mode === "onboarding" ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }, mode === "onboarding");
      const body = await response.json();
      if (!response.ok || body?.success !== true) throw new Error(body?.error || body?.message || "Respons server tidak valid.");
      if (![200, 201].includes(response.status)) throw new Error("Permintaan masih diproses. Periksa status sebelum mencoba lagi.");
      if (["verify-email", "onboarding"].includes(mode) && (!body.data?.id || !["user", "admin"].includes(body.data.role))) throw new Error("Profil belum dapat dikonfirmasi. Coba muat ulang.");
      if (mode === "register") router.push("/auth/check-email");
      else if (mode === "verify-email") { acceptProfile(body.data); showToast("success", "Email berhasil diverifikasi. Lengkapi profil Anda."); router.replace("/auth/onboarding"); }
      else if (mode === "onboarding") { acceptProfile(body.data); showToast("success", "Profil berhasil disimpan."); router.replace(getHomePath(body.data.role)); }
      else if (mode === "reset-password") { retryAuth(); setMessage("Password berhasil diperbarui."); }
      else setMessage("Jika alamat email memenuhi syarat, instruksi akan dikirim. Periksa kotak masuk dan folder spam Anda.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Koneksi gagal."); }
    finally { inFlight.current = false; setBusy(false); }
  }

  const needsEmail = ["login", "register", "forgot-password", "check-email"].includes(mode);
  const needsPassword = ["login", "register", "reset-password"].includes(mode);
  const editingProfile = mode === "onboarding" && !!user?.onboarding_complete;
  const Container = editingProfile ? "section" : "main";
  if (mode === "onboarding" && !isLoading && authErrorStatus) {
    return <ErrorScreen status={authErrorStatus} onRetry={authErrorStatus === 403 ? undefined : retryAuth} />;
  }
  return <Container className="auth-screen">
    <section className="auth-card">
      <Link className="landing-brand" href={editingProfile && user ? getHomePath(user.role) : "/"}><Sparkles size={18} aria-hidden="true" />SmartDoc</Link>
      <PageHeading {...(mode === "onboarding" && user?.onboarding_complete ? { title: user.role === "admin" ? "Profil admin" : "Profil & pengaturan", description: "Kelola nama tampilan dan zona waktu akun Anda." } : mode === "login" && role === "admin" ? { title: "Masuk sebagai", accent: "admin" } : headings[mode])} />
      {mode === "check-email" && <p role="status">Jika alamat email memenuhi syarat, instruksi verifikasi akan dikirim. Periksa kotak masuk dan folder spam Anda. Belum menerima email? Kirim ulang di bawah.</p>}
      {mode === "verify-email" && <p>Konfirmasikan email untuk masuk dan melengkapi profil Anda.</p>}
      {mode === "reset-password" && message ? <SuccessNotice title={message}><p>Gunakan password baru untuk masuk kembali.</p><Link className="ui-button ui-button--primary" href="/login">Masuk ke akun</Link></SuccessNotice> : <form method="post" onSubmit={submit} className="workspace-form" aria-busy={busy}>
        {needsEmail && <label>Email<TextField type="email" name="email" placeholder="nama@email.com" autoComplete="email" required disabled={busy} /></label>}
        {needsPassword && <label>Password<TextField type="password" name="password" placeholder={mode === "login" ? "Masukkan password Anda" : "Minimal 8 karakter"} autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={8} maxLength={72} disabled={busy} /></label>}
        {mode === "register" && <>
          <label>Konfirmasi password<TextField type="password" name="confirm_password" placeholder="Ulangi password Anda" required autoComplete="new-password" disabled={busy} /></label>
          <label className="check-label"><input type="checkbox" name="accept_terms" required disabled={busy} />Saya menyetujui <Link href="/terms">ketentuan penggunaan lokal</Link>.</label>
        </>}
        {mode === "login" && <label className="check-label"><input type="checkbox" name="remember_me" disabled={busy} />Ingat saya selama 30 hari</label>}
        {mode === "onboarding" && <>
          <label>Nama tampilan<input name="display_name" required maxLength={100} defaultValue={user?.display_name || ""} disabled={busy} /></label>
          <label>Zona waktu<select name="timezone" defaultValue={user?.timezone || "Asia/Jakarta"} disabled={busy}><option>Asia/Jakarta</option><option>Asia/Makassar</option><option>Asia/Jayapura</option><option>UTC</option></select></label>
        </>}
        <button type="submit" className="ui-button ui-button--primary" disabled={busy || isLoading}>{busy ? "Memproses…" : isLoading ? "Memuat sesi…" : mode === "login" ? "Masuk" : mode === "register" ? "Daftar" : mode === "onboarding" ? "Simpan profil" : mode === "verify-email" ? "Verifikasi dan masuk" : mode === "reset-password" ? "Simpan password" : "Kirim email"}</button>
      </form>}
      {error && <p role="alert" className="guest-error">{error}</p>}
      {message && mode !== "reset-password" && <SuccessNotice title="Periksa email Anda"><p>{message}</p></SuccessNotice>}
      {editingProfile && user ? <div className="auth-links"><Link href={getHomePath(user.role)}>Kembali ke dashboard</Link></div> : <div className="auth-links"><Link href="/">Beranda</Link><Link href="/login">Login user</Link><Link href="/register">Daftar</Link><Link href="/auth/forgot-password">Lupa password</Link></div>}
    </section>
  </Container>;
}
