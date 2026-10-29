"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  FileOutput,
  Minimize2,
  Scissors,
  Combine,
  ShieldCheck,
  History,
  Sparkles,
  Menu,
  X,
  ChevronDown,
  FileCog,
  LogOut,
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";

// Sub-items for "Alat Dokumen" dropdown
const docToolLinks = [
  { href: "/converter", label: "Converter", icon: FileOutput },
  { href: "/compressor", label: "Compressor", icon: Minimize2 },
  { href: "/splitter", label: "Splitter", icon: Scissors },
  { href: "/merger", label: "Merger", icon: Combine },
  { href: "/watermark", label: "Watermark & Keamanan", icon: ShieldCheck },
];

export default function Sidebar() {
  const pathname = usePathname();
  return <SidebarContent key={pathname} />;
}

function SidebarContent() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [logoutError, setLogoutError] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Check if current route is inside "Alat Dokumen"
  const isDocToolActive = docToolLinks.some((item) => pathname.startsWith(item.href));

  // Dropdown state: closed by default
  const [isDocToolsOpen, setIsDocToolsOpen] = useState(isDocToolActive);

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
            href="/dashboard"
            className={`nav-link ${pathname === "/dashboard" ? "active" : ""}`}
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

          {/* Riwayat Dokumen */}
          <div style={{ marginTop: "6px", display: "flex", flexDirection: "column", gap: "2px" }}>
            <Link
              href="/riwayat-dokumen"
              className={`nav-link ${pathname.startsWith("/riwayat-dokumen") ? "active" : ""}`}
              onClick={() => setIsMobileOpen(false)}
            >
              <History size={17} strokeWidth={1.75} />
              Riwayat Dokumen
            </Link>
          </div>
        </nav>

        {/* User Info + Logout */}
        <div style={{
          margin: "12px",
          padding: "10px 12px",
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: "10px",
          display: "flex",
          alignItems: "center",
          gap: "10px",
        }}>
          {/* Avatar */}
          <div style={{
            width: 32, height: 32, borderRadius: "50%",
            background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
            fontSize: "13px", fontWeight: 700, color: "white",
          }}>
            {user?.username?.[0]?.toUpperCase() ?? "U"}
          </div>
          {/* User info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-ink-black)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user?.username ?? "User"}
              </span>
              {user?.role === "admin" && (
                <span style={{
                  fontSize: "9px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  padding: "1px 5px",
                  borderRadius: "4px",
                  background: "rgba(99, 102, 241, 0.12)",
                  color: "#6366f1",
                  border: "1px solid rgba(99, 102, 241, 0.25)",
                }}>
                  Admin
                </span>
              )}
            </div>
            <div style={{ fontSize: "11px", color: "var(--color-ink-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {user?.email ?? ""}
            </div>
          </div>
          {/* Logout button */}
          <button
            id="sidebar-logout-btn"
            title="Keluar"
            disabled={isLoggingOut}
            onClick={async () => {
              setLogoutError(false);
              setIsLoggingOut(true);
              const done = await logout();
              setIsLoggingOut(false);
              if (done) router.replace("/");
              else setLogoutError(true);
            }}
            style={{
              background: "none", border: "none", cursor: "pointer",
              padding: "5px", borderRadius: "7px",
              color: "var(--color-ink-secondary)",
              display: "flex", alignItems: "center",
              transition: "color 0.2s, background 0.2s",
              flexShrink: 0,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "#ef4444"; (e.currentTarget as HTMLButtonElement).style.background = "rgba(239,68,68,0.1)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "var(--color-ink-secondary)"; (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
          >
            <LogOut size={15} strokeWidth={2} />
          </button>
            {logoutError && <span role="alert" style={{ color: "#ef4444", fontSize: 12 }}>Gagal mengakhiri sesi. Coba lagi.</span>}
        </div>
      </aside>
    </>
  );
}
