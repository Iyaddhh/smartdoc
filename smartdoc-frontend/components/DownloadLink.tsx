"use client";

import { useState, type ComponentProps } from "react";
import { fetchFile } from "@/lib/api/files";
import { showToast } from "./Toast";

export default function DownloadLink({ href, onClick, children, ...props }: ComponentProps<"a">) {
  const [busy, setBusy] = useState(false);
  return <a {...props} href={href} aria-busy={busy} onClick={async (event) => {
    event.preventDefault();
    onClick?.(event);
    if (!href || busy) return;
    setBusy(true);
    try {
      const { blob, disposition } = await fetchFile(href);
      const encoded = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
      const filename = encoded ? decodeURIComponent(encoded) : disposition?.match(/filename="([^"]+)"/i)?.[1];
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename || (typeof props.download === "string" ? props.download : "dokumen");
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      showToast("error", error instanceof Error ? error.message : "Gagal mengunduh berkas.");
    } finally {
      setBusy(false);
    }
  }}>{children}</a>;
}
