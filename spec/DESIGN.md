# SmartDoc - Pedoman Desain

Diperbarui: 6 November 2026. Dokumen ini mengatur tampilan dan interaksi SmartDoc berdasarkan stylesheet dan komponen pada working tree. Scope produk ada di [PRD](PRD.md), struktur komponen di [ARCHITECTURE](ARCHITECTURE.md), dan pekerjaan UI yang belum selesai di [task.md](task.md). Pemeriksaan source tidak menggantikan browser/accessibility testing.

## Pedoman visual SmartDoc

Heading desktop berukuran 28px; heading mobile 24px, action target 44px, dan teks form 16px. Card memakai radius 12px dan padding 16px; field 6px dan action button 8px. Inter digunakan untuk body dan heading kecil; Satoshi memakai fallback Inter/system. Card putih memiliki border Ash 1px, navigasi aktif memakai blue tint, field memiliki border abu-abu dan keyboard focus ring biru, serta primary action menggunakan fill hitam. Preview dokumen dan warna watermark mempertahankan rendering sesuai konten.

Arah visual terinspirasi Dub: canvas terang, typography compact, border tipis, dan aksen biru. Nilai implementasi berikut dicocokkan dengan stylesheet aktif; perubahan visual dimulai dari pedoman ini sebelum mengubah kode.

### Pemetaan implementasi aktif

| Area | Source dan perilaku |
| --- | --- |
| Tokens | `app/tokens.css`: warna, typography, spacing, radius, sidebar 240px, mobile header 56px, transition 0,15/0,2 detik |
| Typography | Inter dimuat melalui Google Fonts pada `app/layout.tsx`; Satoshi/Geist Mono dideklarasikan sebagai font stacks, tanpa font loader tersendiri |
| Elevation | Runtime `--shadow-sm`, `--shadow-md`, `--shadow-lg`, `--shadow-xl`, dan drawer bernilai `none`; primary button memakai shadow subtle |
| Page shell | `globals.css` untuk shell/private tools; `workspace.css` untuk public/auth/workspace; `page-layouts.css` untuk hierarchy dan layout per resource |
| Fields | `fields.css`, `TextField`, dan `FilePicker`; hover/focus/disabled/error, password visibility, native file input yang dapat difokuskan |
| Halaman publik | `PublicShell`, katalog `GuestTools`, dan lima `GuestToolPage` dengan shared form |
| Workspace | Dashboard, Documents, DocumentDetails, Planner, dan DocumentActivity di `components/workspace` |
| Administrasi | Komponen `components/admin` dan AdminNavigation; monitoring berada di `/administration/processes` |
| Preview | StoredDocumentPreview meminta satu halaman per request; fullscreen menggunakan native dialog. Rendering Office dapat gagal dan harus menampilkan error/retry |

CSS menggunakan breakpoints sesuai layout: 1.100px untuk beberapa grid, 900px untuk katalog, 768/1.024px untuk shell lama, dan 640px untuk form/mobile. `page-layouts.css` memberi heading 24px pada mobile, menimpa ukuran 28px dari `workspace.css`; urutan import stylesheet penting. Target 44px diterapkan pada kontrol mobile terkait, bukan klaim seluruh elemen aplikasi sudah memenuhi accessibility.

### States dan interaksi yang harus dipertahankan

- Tampilkan loading, empty, error, retry, dan hasil sesuai data aktual. Perubahan input/opsi membatalkan hasil lama pada form Guest.
- Form kompresi PPTX mendukung 200 MB dan melewati preview PDF; tool lain mengikuti batasnya sendiri. Tampilkan ukuran hasil aktual, tanpa persentase kompresi buatan.
- Bedakan saved file, temporary result, expired/removed file, dan history. Tindakan download/preview mengikuti availability API.
- Kalender menyediakan month/week/day, kategori, selected-date scheduling, dan drag-and-drop. Alternatif tombol harus tetap tersedia untuk keyboard/touch.
- Shared ProcessingModal dan modal lain perlu diverifikasi fokus/keyboard secara terpisah; penggunaan native dialog pada preview tidak membuktikan semua modal sudah accessible.

## Design tokens aktif

Source acuan nilai adalah `app/tokens.css`. Hindari menduplikasi seluruh deklarasi CSS dalam dokumentasi; gunakan token yang sudah tersedia pada implementasi.

### Warna

| Token | Nilai source |
| --- | --- |
| `--color-canvas-white` | `#ffffff` |
| `--color-paper-mist` | `#f5f5f5` |
| `--color-ash` | `#e5e5e5` |
| `--color-smoke` | `#d4d4d4` |
| `--color-pebble` | `#c8c8c8` |
| `--color-midnight-ink` | `#0a0a0a` |
| `--color-charcoal` | `#171717` |
| `--color-graphite` | `#262626` |
| `--color-slate` | `#404040` |
| `--color-steel` | `#525252` |
| `--color-fog` | `#737373` |
| `--color-silver` | `#a3a3a3` |
| `--color-electric-blue` | `#2563eb` |
| `--color-deep-sapphire` | `#1e40af` |
| `--color-primary-action-fill` | `#000000` |
| `--color-soft-mint` | `#dcfce7` |
| `--color-vivid-green` | `#16a34a` |
| `--color-tangerine` | `#ea580c` |
| `--color-lavender` | `#7c3aed` |
| `--color-active-blue` | `#dbeaff` |
| `--color-violet-tint` | `#f5f3ff` |
| `--color-amber-tint` | `#fff7ed` |
| `--color-backdrop` | `rgb(10 10 10 / 35%)` |
| `--clr-success` | `#166534` |
| `--clr-success-bg` | `#f0fdf4` |
| `--clr-success-border` | `#bbf7d0` |
| `--clr-error` | `#b91c1c` |
| `--clr-error-bg` | `#fef2f2` |
| `--clr-error-border` | `#fecaca` |
| `--clr-info` | `var(--color-deep-sapphire)` |
| `--clr-info-bg` | `#eff6ff` |
| `--clr-info-border` | `#bfdbfe` |
| `--clr-warning` | `#9a3412` |
| `--clr-warning-bg` | `var(--color-amber-tint)` |
| `--clr-bg` | `var(--color-canvas-white)` |
| `--clr-surface` | `var(--color-canvas-white)` |
| `--clr-border` | `var(--color-ash)` |
| `--clr-border-muted` | `var(--color-smoke)` |
| `--clr-text-primary` | `var(--color-charcoal)` |
| `--clr-text-muted` | `var(--color-steel)` |
| `--clr-text-subtle` | `var(--color-fog)` |
| `--clr-accent` | `var(--color-electric-blue)` |
| `--clr-accent-edge` | `var(--color-electric-blue)` |
| `--clr-wash` | `var(--color-active-blue)` |

### Typography dan ukuran

| Role/token | Nilai aktif |
| --- | --- |
| Font UI | Inter, lalu ui-sans-serif/system; weight 400/500/600 |
| Font display | Satoshi dengan fallback Inter/system; tidak ada Satoshi font loader tersendiri |
| Monospace | Geist Mono dengan fallback SFMono-Regular/Consolas; tidak ada loader tersendiri |
| Caption / body-sm / body | 11px / 13px / 14px |
| Body-lg / body-xl / subheading | 16px / 18px / 20px |
| Heading-sm / heading / heading-lg / display tokens | 24px / 30px / 36px / 48px |
| Page heading pada komponen | 28px desktop dan 24px mobile; ukuran token heading tidak otomatis sama dengan ukuran komponen |
| Form mobile | 16px dan tinggi minimum 44px pada kontrol terkait |

### Spacing, radius, dan elevation

Base spacing 4px; skala aktif: 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 48, 56, 64, 80, 96, 112px. Radius input 6px, button/image/small card 8px, card 12px, large card 16px, pill 9999px. Gunakan nama token yang ada di source; contoh `--radius-large-cards`, bukan nama alias dari referensi lama.

Shadow aktif `--shadow-subtle: 0 1px 2px rgb(0 0 0 / 5%)`; button memakai token tersebut. Shadow sm/md/lg/xl/drawer bernilai none. Jangan memakai contoh shadow elevated dari referensi lama sebagai nilai runtime.

### Layout

| Bagian | Pedoman aktif |
| --- | --- |
| Page max-width token | 1200px; `.workspace-page` membatasi area utamanya ke 1120px |
| Sidebar / mobile header | 240px / 56px |
| Gap halaman workspace | 24px |
| Section/card/element tokens | 64px / 16px / 8px |
| Planner desktop | Dua kolom: form/kalender dan daftar; menumpuk pada breakpoint terkait |
| Detail dokumen | Preview dan metadata; tools, aktivitas, dan agenda terkait di bagian berikutnya |
| Responsive | Grid memiliki breakpoint 1100/900px, shell 1024/768px, kontrol mobile 640px, katalog sangat kecil 359px |
| Motion | Transition 0,15 dan 0,2 detik; stylesheet menyediakan reduced-motion rule |

## Komponen dan interaction states

Primary action memakai fill hitam dan teks putih; secondary action memakai surface putih/transparan dengan border Ash. Button standar pada shared workspace mempunyai tinggi minimum 40px; mobile terkait 44px. Fokus shared controls memakai outline biru 3px dengan offset 4px. Disabled memakai opacity dan cursor yang sesuai, bukan label sukses palsu.

Gunakan PageHeading untuk judul; TextField untuk input berikon/password toggle; FilePicker untuk native upload. PublicShell menangani navigasi publik dan Sidebar/AdminNavigation menangani area login sesuai role. Komponen lama private tools masih memiliki inline styles; kepatuhan seluruh layar harus diuji secara visual, bukan disimpulkan dari tokens saja.

| Keadaan | Perilaku yang diharapkan |
| --- | --- |
| Loading | Status proses terlihat; hindari submit berulang |
| Empty | Jelaskan data belum tersedia dengan action yang relevan |
| Error | Pesan jelas dan retry jika operasinya dapat dicoba ulang |
| Success | Hasil berdasarkan API/berkas aktual; ukuran dan status tidak direkayasa |
| Temporary / expired / removed | Jelaskan availability dan batas penyimpanan; history tetap dapat ada |
| Modal/preview | Label yang jelas, kontrol tutup, keyboard/focus yang dapat dioperasikan; native dialog dipakai pada stored preview |
| Kalender | Status dan kategori memakai teks selain warna; drag-and-drop dilengkapi selected-date button |

Kompresi PPTX tidak menjalankan preview PDF sebelum proses; preview manual pada detail dokumen tetap merupakan fitur terpisah dan dapat terkena batas file/halaman. ZIP hasil dapat diunduh, tetapi tidak ditampilkan sebagai format sumber yang didukung stored tools.

### Feedback sukses

Toast dipakai untuk mutation singkat seperti upload, rename, pindah folder, delete, dan save hasil. Posisi kanan bawah desktop dan mengikuti lebar viewport mobile dengan margin 16px; maksimum tiga pesan terlihat. Toast tidak memakai backdrop/modal atau memindahkan fokus. Teks menjelaskan aksi yang selesai, ikon disertai teks, close button minimum 44px. Success/info memakai live status polite; error memakai alert. Auto-dismiss berhenti saat pointer/fokus berada di toast; durasi nol bertahan sampai ditutup.

Konfirmasi reset password tetap di halaman dengan action login. Registrasi/check-email dan forgot/resend menggunakan kalimat bersyarat yang sama tanpa menyatakan akun pasti ada atau email pasti terkirim. Login cukup redirect. Form sukses memakai status yang dapat dibaca screen reader; error baru menghapus konfirmasi lama.

Panel hasil tetap menjadi feedback utama processing: ukuran aktual, download, serta saved/temporary/quota dijelaskan terpisah. `202`/pending/processing memakai status berjalan. `done` tanpa output tersedia tidak mendapat indikator sukses atau action download. Pesan download berbunyi “Unduhan dimulai”, karena browser tidak mengonfirmasi penyimpanan di perangkat.

## Batas dan verifikasi desain

### Halaman error

404/403/500/503 menggunakan shared full-page surface: brand SmartDoc, indikator kode, satu heading dan deskripsi pendek, primary action hitam serta secondary action dengan border Ash. Canvas putih, aksen biru terbatas, typography Inter/system, responsive tanpa horizontal overflow pada 320px. Navigasi tetap dapat digunakan ketika AuthProvider atau layout utama gagal.

404 menawarkan beranda dan kembali dengan fallback aman; 403 menawarkan halaman sesuai role atau beranda; 500 menawarkan retry boundary dan beranda; 503 menawarkan retry pemeriksaan layanan dan beranda. Judul dan kode tidak hanya dibedakan melalui warna. Halaman menyediakan main landmark, heading, focus-visible, action target minimum 44px, dan status retry yang dapat dibaca screen reader. Raw error, token, path, dan detail backend tidak menjadi konten halaman.

Inter dimuat dari Google Fonts; hasil dapat menggunakan fallback bila jaringan/font tidak tersedia. Dokumen ini tidak mengasumsikan semua font display telah dimuat. Komponen modal selain stored preview belum dibuktikan memiliki focus trap/focus return yang lengkap. Kesetaraan keyboard, touch, kontras, screen reader, dan layout seluruh ukuran tetap mengikuti T-052/T-053.

Referensi Dub dipakai sebagai arah visual; angka frekuensi komponen, hero mockup, logo customer, contoh CSS/Tailwind, dan palet alternatif dari sumber referensi bukan spesifikasi aktif SmartDoc. Saat mengubah UI, perbarui pedoman relevan di sini dan task sebelum mengubah stylesheet/komponen.
