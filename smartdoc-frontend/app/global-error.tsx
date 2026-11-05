"use client";

import ErrorScreen from "@/components/errors/ErrorScreen";
import type { PageErrorBoundaryProps } from "@/lib/page-errors";

export default function GlobalError({ retry, reset }: PageErrorBoundaryProps) {
  return <html lang="id"><head><title>500 — Terjadi kesalahan | SmartDoc</title></head><body style={{ margin: 0 }}>
    <ErrorScreen status={500} onRetry={retry ?? reset ?? (() => window.location.reload())} />
  </body></html>;
}
