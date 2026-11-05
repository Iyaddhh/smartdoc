import ErrorScreen from "@/components/errors/ErrorScreen";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "403 — Akses ditolak | SmartDoc", robots: { index: false, follow: false } };

export default function AccessDeniedPage() {
  return <ErrorScreen status={403} />;
}
