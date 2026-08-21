import type { Metadata, Viewport } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import ToastContainer from "@/components/Toast";

export const metadata: Metadata = {
  title: "SmartDoc — Document Management System",
  description: "Platform terpadu untuk konversi, kompresi, pemisahan halaman, dan digitalisasi dokumen berstandar profesional.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter+Tight:ital,wght@0,400;0,500;0,600;1,400&family=Inter:wght@300;400;500;600;700&display=swap"
        />
      </head>
      <body>
        <div className="layout">
          <Sidebar />
          <main className="main-content">{children}</main>
          <ToastContainer />
        </div>
      </body>
    </html>
  );
}
