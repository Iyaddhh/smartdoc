"use client";

import ErrorScreen from "@/components/errors/ErrorScreen";
import type { PageErrorBoundaryProps } from "@/lib/page-errors";

export default function ErrorPage({ retry, reset }: PageErrorBoundaryProps) {
  return <ErrorScreen status={500} onRetry={retry ?? reset ?? (() => window.location.reload())} />;
}
