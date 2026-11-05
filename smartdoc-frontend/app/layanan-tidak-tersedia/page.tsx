import type { Metadata } from "next";
import ServiceUnavailable from "@/components/errors/ServiceUnavailable";

export const metadata: Metadata = { title: "503 — Layanan sementara tidak tersedia | SmartDoc", robots: { index: false, follow: false } };

export default function ServiceUnavailablePage() {
  return <ServiceUnavailable />;
}
