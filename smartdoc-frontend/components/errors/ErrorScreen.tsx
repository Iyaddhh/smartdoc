"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- Critical fallbacks use document navigation so recovery works without the router or auth context. */

import { ArrowLeft, ArrowRight, FileSearch, ShieldAlert, CircleAlert, ServerOff, Sparkles } from "lucide-react";
import { useEffect } from "react";
import { pageErrors, type PageErrorStatus } from "@/lib/page-errors";
import styles from "./error-screen.module.css";

const icons = { 403: ShieldAlert, 404: FileSearch, 500: CircleAlert, 503: ServerOff };

export default function ErrorScreen({ status, onRetry, busy = false, notice, homeHref = "/", homeLabel = "Ke beranda", allowBack = false }: {
  status: PageErrorStatus;
  onRetry?: () => void;
  busy?: boolean;
  notice?: string;
  homeHref?: "/" | "/dashboard" | "/administration";
  homeLabel?: string;
  allowBack?: boolean;
}) {
  const content = pageErrors[status];
  const Icon = icons[status];
  useEffect(() => {
    const previous = document.title;
    const title = `${status} — ${content.title} | SmartDoc`;
    const applyTitle = () => { if (document.title !== title) document.title = title; };
    // Streamed route metadata can arrive after this client fallback mounts.
    const observer = new MutationObserver(applyTitle);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    applyTitle();
    return () => { observer.disconnect(); document.title = previous; };
  }, [status, content.title]);
  function goBack() {
    if (window.history.length > 1) window.history.back();
    else window.location.assign(homeHref);
  }
  return <main className={styles.page} aria-labelledby="error-page-title">
    <meta name="robots" content="noindex, nofollow" />
    <header className={styles.header}>
      <a href="/" className={styles.brand} aria-label="SmartDoc, beranda"><Sparkles size={21} aria-hidden="true" />SmartDoc</a>
      <span className={styles.headerLabel}>Pusat dokumen Anda</span>
    </header>
    <section className={styles.content}>
      <div className={styles.symbol} aria-hidden="true"><Icon size={28} strokeWidth={1.5} /></div>
      <p className={styles.code}>Error {status}</p>
      <h1 id="error-page-title">{content.title}</h1>
      <p className={styles.description}>{content.description}</p>
      <div className={styles.actions}>
        {onRetry && <button type="button" className={styles.primary} onClick={onRetry} disabled={busy}>
          {busy ? "Memeriksa layanan…" : "Coba lagi"}<ArrowRight size={16} aria-hidden="true" />
        </button>}
        <a href={homeHref} className={onRetry ? styles.secondary : styles.primary}>{homeLabel}<ArrowRight size={16} aria-hidden="true" /></a>
        {allowBack && <button type="button" className={styles.secondary} onClick={goBack}><ArrowLeft size={16} aria-hidden="true" />Kembali</button>}
      </div>
      <p className={styles.notice} role="status" aria-live="polite">{busy ? "Sedang memeriksa ketersediaan layanan." : notice}</p>
    </section>
    <footer className={styles.footer}>SmartDoc · Pengolahan dokumen dalam satu tempat</footer>
  </main>;
}
