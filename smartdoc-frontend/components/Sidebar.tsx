"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileOutput,
  Minimize2,
  Scissors,
  Combine,
  ShieldCheck,
  ScanLine,
  History,
  LayoutTemplate,
  Sparkles,
  Menu,
  X,
  ChevronDown,
  FileCog,
} from "lucide-react";

// Sub-items for "Alat Dokumen" dropdown
const docToolLinks = [
  { href: "/converter", label: "Converter", icon: FileOutput },
  { href: "/compressor", label: "Compressor", icon: Minimize2 },
  { href: "/splitter", label: "Splitter", icon: Scissors },
  { href: "/merger", label: "Merger", icon: Combine },
  { href: "/watermark", label: "Watermark & Keamanan", icon: ShieldCheck },
];

const adminLinks = [
  { href: "/admin/templates", label: "Manajemen Template", icon: LayoutTemplate },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Check if current route is inside "Alat Dokumen"
  const isDocToolActive = docToolLinks.some((item) => pathname.startsWith(item.href));

  // Dropdown state: open by default if active or user toggles it
  const [isDocToolsOpen, setIsDocToolsOpen] = useState(true);

  // Auto-expand dropdown when navigating to any doc tool route
  useEffect(() => {
    if (isDocToolActive) {
      setIsDocToolsOpen(true);
    }
  }, [pathname, isDocToolActive]);

  // Auto-close mobile drawer on route change
  useEffect(() => {
    setIsMobileOpen(false);
  }, [pathname]);

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (isMobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMobileOpen]);

  return (
    <>
      {/* Mobile Top Header */}
      <header className="mobile-header">
        <div className="mobile-header-logo">
          <div className="sidebar-logo-mark" style={{ width: 26, height: 26 }}>
            <Sparkles size={14} strokeWidth={2} />
          </div>
          <span style={{ fontWeight: 600, fontSize: "15px", color: "var(--color-ink-black)" }}>
            SmartDoc
          </span>
        </div>

        <button
          className="mobile-nav-toggle"
          onClick={() => setIsMobileOpen((prev) => !prev)}
          aria-label={isMobileOpen ? "Tutup menu" : "Buka menu"}
        >
          {isMobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </header>

      {/* Mobile Drawer Backdrop */}
      <div
        className={`mobile-drawer-backdrop ${isMobileOpen ? "active" : ""}`}
        onClick={() => setIsMobileOpen(false)}
      />

      {/* Main Sidebar / Slide-in Drawer */}
      <aside className={`sidebar ${isMobileOpen ? "drawer-open" : ""}`}>
        {/* Brand / Logo */}
        <div className="sidebar-logo">
          <div className="sidebar-logo-brand">
            <div className="sidebar-logo-mark">
              <Sparkles size={16} strokeWidth={2} />
            </div>
            <div>
              <h1>SmartDoc</h1>
              <p>Document Workspace</p>
            </div>
          </div>

          {/* Close button visible only in drawer mode on small screens */}
          <button
            onClick={() => setIsMobileOpen(false)}
            style={{
              color: "var(--color-ash-gray)",
              display: isMobileOpen ? "flex" : "none",
              alignItems: "center",
              justifyContent: "center",
              padding: "4px",
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          {/* Main Dashboard Link */}
          <div className="sidebar-section-label">Navigasi Utama</div>
          <Link
            href="/"
            className={`nav-link ${pathname === "/" ? "active" : ""}`}
            onClick={() => setIsMobileOpen(false)}
          >
            <LayoutDashboard size={17} strokeWidth={1.75} />
            Dashboard
          </Link>

          {/* Collapsible Dropdown: Alat Dokumen */}
          <div style={{ marginTop: "6px" }}>
            <button
              type="button"
              onClick={() => setIsDocToolsOpen((prev) => !prev)}
              className={`nav-link ${isDocToolActive && !isDocToolsOpen ? "active" : ""}`}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: isDocToolActive ? "var(--color-stone-canvas)" : "transparent",
                fontWeight: isDocToolActive ? 600 : 500,
                border: "none",
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <FileCog
                  size={17}
                  strokeWidth={1.75}
                  style={{ color: isDocToolActive ? "var(--color-cyan-edge)" : "inherit" }}
                />
                <span style={{ color: isDocToolActive ? "var(--color-ink-black)" : "inherit" }}>
                  Alat Dokumen
                </span>
              </div>
              <ChevronDown
                size={15}
                style={{
                  color: isDocToolActive ? "var(--color-ink-black)" : "var(--color-ash-gray)",
                  transition: "transform 0.2s ease",
                  transform: isDocToolsOpen ? "rotate(180deg)" : "rotate(0deg)",
                }}
              />
            </button>

            {/* Dropdown Items */}
            {isDocToolsOpen && (
              <div
                className="animate-fade-in"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "2px",
                  marginTop: "2px",
                  marginLeft: "12px",
                  paddingLeft: "10px",
                  borderLeft: "2px solid var(--color-stone-border)",
                }}
              >
                {docToolLinks.map(({ href, label, icon: Icon }) => {
                  const isActive = pathname.startsWith(href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      className={`nav-link ${isActive ? "active" : ""}`}
                      onClick={() => setIsMobileOpen(false)}
                      style={{
                        padding: "7px 10px",
                        fontSize: "13px",
                        fontWeight: isActive ? 600 : 400,
                      }}
                    >
                      <Icon size={15} strokeWidth={1.75} />
                      {label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* OCR & History Links */}
          <div style={{ marginTop: "6px", display: "flex", flexDirection: "column", gap: "2px" }}>
            <Link
              href="/scan"
              className={`nav-link ${pathname.startsWith("/scan") ? "active" : ""}`}
              onClick={() => setIsMobileOpen(false)}
            >
              <ScanLine size={17} strokeWidth={1.75} />
              OCR / Scan
            </Link>

            <Link
              href="/riwayat-dokumen"
              className={`nav-link ${pathname.startsWith("/riwayat-dokumen") ? "active" : ""}`}
              onClick={() => setIsMobileOpen(false)}
            >
              <History size={17} strokeWidth={1.75} />
              Riwayat Dokumen
            </Link>
          </div>

          {/* Admin Section */}
          <div className="sidebar-section-label" style={{ marginTop: "20px" }}>
            Admin
          </div>
          {adminLinks.map(({ href, label, icon: Icon }) => {
            const isActive = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`nav-link ${isActive ? "active" : ""}`}
                onClick={() => setIsMobileOpen(false)}
              >
                <Icon size={17} strokeWidth={1.75} />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Bottom Status Info */}
        <div style={{ padding: "16px 20px", borderTop: "1px solid var(--color-stone-border)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  backgroundColor: "var(--color-cyan-signal)",
                  display: "inline-block",
                }}
              />
              <span style={{ fontSize: "12px", color: "var(--color-warm-gray)", fontWeight: 400 }}>
                Sistem Aktif
              </span>
            </div>
            <span style={{ fontSize: "11px", color: "var(--color-ash-gray)" }}>v1.0</span>
          </div>
        </div>
      </aside>
    </>
  );
}
