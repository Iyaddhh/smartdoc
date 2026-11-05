"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from "lucide-react";
import styles from "./feedback.module.css";

export type ToastType = "success" | "error" | "info" | "warning";
export interface ToastMessage { id: string; type: ToastType; title?: string; message: string; duration?: number }
const listeners = new Set<(toast: ToastMessage) => void>();
let lastSignature = "";
let lastTime = 0;
let sequence = 0;

export function showToast(type: ToastType, message: string, title?: string, duration = 5000) {
  const signature = `${type}:${title || ""}:${message}`;
  const now = Date.now();
  if (signature === lastSignature && now - lastTime < 1500) return;
  lastSignature = signature; lastTime = now;
  const toast = { id: String(++sequence), type, message, title, duration };
  listeners.forEach((listener) => listener(toast));
}

const icons = { success: CheckCircle2, error: XCircle, info: Info, warning: AlertTriangle };
const titles = { success: "Berhasil", error: "Terjadi kendala", info: "Informasi", warning: "Perhatian" };

function ToastItem({ toast, dismiss }: { toast: ToastMessage; dismiss: (id: string) => void }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const remaining = useRef(toast.duration ?? 5000);
  useEffect(() => {
    if (hovered || focused || (toast.duration ?? 5000) <= 0) return;
    const started = Date.now();
    const timer = setTimeout(() => dismiss(toast.id), Math.max(0, remaining.current));
    return () => { clearTimeout(timer); remaining.current -= Date.now() - started; };
  }, [toast.id, toast.duration, dismiss, hovered, focused]);
  const Icon = icons[toast.type];
  return <div className={`${styles.toast} ${styles[toast.type]}`} data-toast={toast.type}
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    onFocus={() => setFocused(true)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}
    onKeyDown={(event) => { if (event.key === "Escape") dismiss(toast.id); }}>
    <Icon size={21} aria-hidden="true" />
    <div role={toast.type === "error" ? "alert" : "status"} aria-atomic="true" className={styles.copy}>
      <strong>{toast.title || titles[toast.type]}</strong><p>{toast.message}</p>
    </div>
    <button type="button" className={styles.close} aria-label={`Tutup notifikasi ${toast.title || titles[toast.type]}`} onClick={() => dismiss(toast.id)}><X size={18} aria-hidden="true" /></button>
  </div>;
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const dismiss = useCallback((id: string) => setToasts((current) => current.filter((toast) => toast.id !== id)), []);
  useEffect(() => {
    const receive = (toast: ToastMessage) => setToasts((current) => [...current, toast].slice(-3));
    listeners.add(receive);
    return () => { listeners.delete(receive); };
  }, []);
  return <aside className={styles.stack} aria-label="Notifikasi">{toasts.map((toast) => <ToastItem key={toast.id} toast={toast} dismiss={dismiss} />)}</aside>;
}
