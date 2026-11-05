export type PageErrorStatus = 403 | 404 | 500 | 503;
export type AuthErrorStatus = Exclude<PageErrorStatus, 404>;

export const pageErrors = {
  403: { title: "Akses ditolak", description: "Akun Anda tidak memiliki izin untuk membuka halaman ini. Kembali ke halaman yang tersedia untuk Anda." },
  404: { title: "Halaman tidak ditemukan", description: "Halaman yang Anda cari mungkin telah dipindahkan atau alamatnya tidak tersedia. Anda bisa kembali ke beranda." },
  500: { title: "Terjadi kesalahan", description: "Halaman ini belum dapat ditampilkan. Coba muat kembali, atau kembali ke beranda untuk melanjutkan." },
  503: { title: "Layanan sementara tidak tersedia", description: "Kami belum dapat terhubung ke layanan. Periksa koneksi Anda dan coba lagi beberapa saat." },
} as const;

/** Authentication failures are page-level; form/mutation failures stay local. */
export function authPageError(status: number): AuthErrorStatus | null {
  if (status === 401) return null;
  if (status === 403) return 403;
  if (status === 500) return 500;
  return 503;
}

export type PageErrorBoundaryProps = {
  error: unknown;
  retry?: () => void;
  reset?: () => void;
};
