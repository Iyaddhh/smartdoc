import Link from "next/link";
import GuestTools from "@/components/GuestTools";
import { ArrowRight, Sparkles } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="landing-page">
      <header className="landing-header">
        <nav className="landing-nav" aria-label="Navigasi utama">
          <Link href="/" className="landing-brand" aria-label="SmartDoc, halaman utama">
            <span className="landing-brand-mark"><Sparkles size={19} aria-hidden="true" /></span>
            SmartDoc
          </Link>
          <div className="landing-nav-links">
            <a href="#tools">Tools</a>
            <Link href="/admin/login">Masuk admin</Link>
            <Link href="/login" className="landing-nav-login">Masuk / Login <ArrowRight size={15} aria-hidden="true" /></Link>
          </div>
        </nav>
      </header>

      <main>
        <GuestTools />
      </main>

      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <span>© {new Date().getFullYear()} SmartDoc</span>
          <div><Link href="/login">Login user</Link><Link href="/admin/login">Login admin</Link><a href="#tools">Tools</a></div>
        </div>
      </footer>
    </div>
  );
}
