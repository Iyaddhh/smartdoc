import Link from "next/link";
export default function Page() {
  return <main className="auth-screen"><article className="auth-card"><h1>Ketentuan pengujian lokal</h1><p>SmartDoc saat ini digunakan untuk pengembangan lokal. Gunakan dokumen uji milik Anda. Data workspace disimpan di PostgreSQL dan storage lokal. Tools guest tidak membuat riwayat permanen.</p><p>Ketentuan dan kebijakan privasi untuk penggunaan publik belum diterbitkan.</p><Link href="/register">Kembali ke pendaftaran</Link></article></main>;
}
