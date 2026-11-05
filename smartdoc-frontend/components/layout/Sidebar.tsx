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
  FolderOpen,
  CalendarDays,
  Settings2,
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import AdminNavigation from "@/components/layout/AdminNavigation";

// Sub-items for "Alat Dokumen" dropdown
const docToolLinks = [
  { href: "/converter", label: "Konversi", icon: FileOutput },
  { href: "/compressor", label: "Kompresi", icon: Minimize2 },
  { href: "/splitter", label: "Pisah halaman", icon: Scissors },
  { href: "/merger", label: "Gabung berkas", icon: Combine },
  { href: "/watermark", label: "Watermark & sandi", icon: ShieldCheck },
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
          <span style={{ fontWeight: 500, fontSize: "15px", color: "var(--color-midnight-ink)" }}>
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
              <span className="sidebar-wordmark">SmartDoc</span>
              <p>{user?.role === "admin" ? "Administrasi layanan" : "Document Workspace"}</p>
            </div>
          </div>

          {/* Close button visible only in drawer mode on small screens */}
          <button
            onClick={() => setIsMobileOpen(false)}
            aria-label="Tutup menu"
            style={{
              color: "var(--color-graphite)",
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
          {user?.role === "admin" ? <AdminNavigation pathname={pathname} onNavigate={() => setIsMobileOpen(false)} /> : <>
          <Link
            href="/dashboard"
            className={`nav-link ${pathname === "/dashboard" ? "active" : ""}`}
            onClick={() => setIsMobileOpen(false)}
          >
            <LayoutDashboard size={17} strokeWidth={1.75} />
            Dashboard
          </Link>

          {/* Collapsible Dropdown: Alat Dokumen */}
          <Link className={`nav-link ${pathname === "/dokumen" ? "active" : ""}`} href="/dokumen"><FolderOpen size={18} strokeWidth={1.75} />Dokumen saya</Link>
          <Link className={`nav-link ${pathname === "/kalender" ? "active" : ""}`} href="/kalender"><CalendarDays size={18} strokeWidth={1.75} />Kalender</Link>
          <Link className={`nav-link ${pathname === "/pengaturan" ? "active" : ""}`} href="/pengaturan"><Settings2 size={18} strokeWidth={1.75} />Profil & pengaturan</Link>
          <div style={{ marginTop: "6px" }}>
            <button
              type="button"
              onClick={() => setIsDocToolsOpen((prev) => !prev)}
              aria-expanded={isDocToolsOpen}
              className={`nav-link ${isDocToolActive && !isDocToolsOpen ? "active" : ""}`}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontWeight: 500,
                border: "none",
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <FileCog
                  size={17}
                  strokeWidth={1.75}
                />
                <span>
                  Alat Dokumen
                </span>
              </div>
              <ChevronDown
                size={15}
                style={{
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
                  borderLeft: "2px solid var(--color-ash)",
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
                        fontWeight: 500,
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
          </>}
        </nav>

        {/* User Info + Logout */}
        <div className="sidebar-account">
          {/* Avatar */}
          <div className="sidebar-avatar">
            {(user?.display_name || user?.username)?.[0]?.toUpperCase() ?? "U"}
          </div>
          {/* User info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-midnight-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user?.display_name || user?.username || "User"}
              </span>
              {user?.role === "admin" && (
                <span className="sidebar-role">
                  Admin
                </span>
              )}
            </div>
            <div style={{ fontSize: "11px", color: "var(--color-graphite)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {user?.email ?? ""}
            </div>
          </div>
          {/* Logout button */}
          <button
            id="sidebar-logout-btn"
            className="sidebar-logout"
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
          >
            <LogOut size={15} strokeWidth={2} />
          </button>
            {logoutError && <span role="alert" className="guest-error">Gagal mengakhiri sesi. Coba lagi.</span>}
        </div>
      </aside>
    </>
  );
}
