import ErrorScreen from "@/components/errors/ErrorScreen";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "404 — Halaman tidak ditemukan | SmartDoc", robots: { index: false, follow: false } };

export default function NotFound() {
  return <ErrorScreen status={404} allowBack />;
}
