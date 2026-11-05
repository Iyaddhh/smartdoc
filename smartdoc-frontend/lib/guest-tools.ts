export const guestTools = [
  { id: "converter", name: "Konversi", href: "/konversi" },
  { id: "compressor", name: "Kompresi", href: "/kompresi" },
  { id: "splitter", name: "Pisah halaman", href: "/pisah-halaman" },
  { id: "merger", name: "Gabung berkas", href: "/gabung-berkas" },
  { id: "watermark", name: "Watermark & sandi", href: "/watermark-sandi" },
] as const;

export type GuestToolId = typeof guestTools[number]["id"];
