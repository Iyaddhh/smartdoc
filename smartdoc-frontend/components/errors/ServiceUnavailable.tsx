"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ErrorScreen from "@/components/errors/ErrorScreen";
import { useAuth } from "@/lib/AuthContext";

export default function ServiceUnavailable() {
  const router = useRouter();
  const { retryAuth } = useAuth();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  async function retry() {
    if (busy) return;
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/auth/csrf", { credentials: "include", cache: "no-store", signal: AbortSignal.timeout(10000) });
      const body = await response.json();
      if (response.ok && body.success === true) { retryAuth(); router.replace("/"); return; }
      setNotice("Layanan belum tersambung. Silakan coba lagi sebentar.");
    } catch { setNotice("Layanan belum tersambung. Periksa koneksi Anda dan coba lagi."); }
    finally { setBusy(false); }
  }
  return <ErrorScreen status={503} onRetry={retry} busy={busy} notice={notice} />;
}
