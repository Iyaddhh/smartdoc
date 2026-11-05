import Link from "next/link";
import { ArrowUpRight, Combine, FileOutput, Minimize2, Scissors, ShieldCheck } from "lucide-react";
import { guestTools } from "@/lib/guest-tools";

const icons = { converter: FileOutput, compressor: Minimize2, splitter: Scissors, merger: Combine, watermark: ShieldCheck };
const descriptions = {
  converter: "Ubah PDF, Office, dan gambar ke format yang Anda perlukan.",
  compressor: "Perkecil ukuran berkas agar lebih mudah dibagikan.",
  splitter: "Ambil halaman pilihan atau pisahkan dokumen menjadi beberapa bagian.",
  merger: "Satukan beberapa berkas menjadi satu dokumen PDF.",
  watermark: "Tambahkan tanda air atau kata sandi pada dokumen Anda.",
};

export default function GuestTools() {
  return <section className="guest-tools" id="tools" aria-label="Tools dokumen">
    <div className="guest-tool-picker" aria-label="Pilihan tools">
      {guestTools.map(({ id, name, href }) => {
        const Icon = icons[id];
        return <Link key={id} id={`guest-tool-${id}`} href={href} aria-labelledby={`guest-title-${id}`} aria-describedby={`guest-description-${id}`}>
          <span className="guest-tool-icon" aria-hidden="true"><Icon size={40} strokeWidth={1.5} /></span>
          <span className="guest-tool-name" id={`guest-title-${id}`}>{name}</span>
          <p id={`guest-description-${id}`}>{descriptions[id]}</p>
          <ArrowUpRight className="guest-tool-arrow" size={20} aria-hidden="true" />
        </Link>;
      })}
    </div>
  </section>;
}
