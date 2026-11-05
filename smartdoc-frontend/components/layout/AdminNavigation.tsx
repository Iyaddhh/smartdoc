import Link from "next/link";
import { Activity, LayoutDashboard, ScrollText, Server, Settings2, UserRound, Users } from "lucide-react";

const links = [
  { href: "/administration", label: "Dashboard", icon: LayoutDashboard },
  { href: "/administration/users", label: "Pengguna", icon: Users },
  { href: "/administration/processes", label: "Pemantauan proses", icon: Activity },
  { href: "/administration/health", label: "Kondisi layanan", icon: Server },
  { href: "/administration/audit", label: "Audit admin", icon: ScrollText },
  { href: "/administration/settings", label: "Pengaturan layanan", icon: Settings2 },
];

export default function AdminNavigation({ pathname, onNavigate }: { pathname: string; onNavigate: () => void }) {
  return <>{links.map(({ href, label, icon: Icon }) => <Link className={`nav-link ${pathname === href || (href === "/administration/users" && pathname.startsWith(href + "/")) ? "active" : ""}`} key={href} href={href} onClick={onNavigate}><Icon size={17} strokeWidth={1.75} />{label}</Link>)}
    <div className="sidebar-section-label">Akun</div><Link href="/administration/profile" className={`nav-link ${pathname === "/administration/profile" ? "active" : ""}`} onClick={onNavigate}><UserRound size={17} strokeWidth={1.75} />Profil admin</Link>
  </>;
}
