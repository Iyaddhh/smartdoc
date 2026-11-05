# SmartDoc

Aplikasi pengolahan dokumen berbasis web dengan document tools publik dan workspace pribadi untuk dokumen, tugas, serta kalender. Development menggunakan Next.js/React/TypeScript, FastAPI, dan PostgreSQL.

Dokumentasi diperbarui pada 6 November 2026 setelah milestone auth, halaman error, success handling, dan penguatan PPTX: 59 route router API dan tiga root/health routes, 10 model tabel aktif, migrations 001–011, dan 33 page routes frontend. Backend terakhir mencatat 273 lulus; frontend terbaru 29 tests, typecheck, targeted lint, dan production build lulus. Browser error pages dan success handling diuji pada frontend production sementara dengan API sintetis. Hasil dan batas pemeriksaan tercatat pada task; database aplikasi tidak diubah.

## Membaca proyek

Mulai dari PRD untuk kebutuhan dan scope, lanjutkan ARCHITECTURE untuk database/API/alur pemrosesan, lalu baca DESIGN dan security sesuai perubahan. Gunakan task sebagai rencana pekerjaan dan catatan verifikasi. Workflow lengkap ada di [AGENTS.md](../AGENTS.md).

Komponen utama berada pada `smartdoc-frontend/app` dan `components`, sedangkan HTTP handlers backend berada di `smartdoc-backend/app/api`. Model ORM ada di `app/models`, migrations di `alembic/versions`, dan aturan bersama/engine ada di `app/core` serta `app/services`. Berkas aktual berada pada filesystem storage; PostgreSQL menyimpan metadata.

## Dokumentasi

Seluruh dokumentasi produk, development, dan rencana pekerjaan berada di folder `spec`:

| Dokumen | Tanggung jawab utama | Detail yang dirujuk ke dokumen lain |
| --- | --- | --- |
| [PRD](PRD.md) | Mengapa produk diperlukan, untuk siapa, kebutuhan, acceptance criteria, dan scope | Task implementasi, desain teknis, dan hasil tests |
| [task.md](task.md) | Pemecahan pekerjaan, milestone, dependensi, checklist, dan rujukan bukti selesai | Definisi scope dan laporan pengujian lengkap |
| [ARCHITECTURE](ARCHITECTURE.md) | Cara kerja sistem, kontrak API, data, otorisasi, lifecycle, dan keputusan teknis | Setup langkah demi langkah, design tokens, dan laporan tests |
| [DESIGN](DESIGN.md) | Pedoman UI/UX, typography, warna, spacing, states, dan referensi visual | Logika backend dan status task |
| [README](README.md) | Pintu masuk proyek, indeks dokumen, setup, konfigurasi, dan perintah operasional | Requirement lengkap dan rincian modul |
| [security.md](security.md) | Kontrol keamanan, batas kepercayaan, privacy, dan persyaratan deployment | Status task dan laporan hasil tests |

### Aturan pemeliharaan dokumen

Setiap detail memiliki dokumen acuan sesuai tabel. Ringkasan singkat boleh muncul di dokumen lain dengan tautan ke acuan; perubahan scope dimulai di PRD, diikuti task dan dokumen teknis yang terdampak. Kontrol keamanan dijelaskan di security.md; status pekerjaan dan catatan verifikasi singkat berada di task.md. Jika kebutuhan dan implementasi berbeda, catat gap sebagai pekerjaan; jangan mengubah requirement hanya agar terlihat selesai.

Temuan keamanan ditindaklanjuti sebagai task dengan kriteria verifikasi; security.md tetap berfokus pada kontrol dan kebijakan keamanan. Pedoman SmartDoc dan contoh referensi visual dibedakan di DESIGN.

[AGENTS.md](../AGENTS.md) pada root menjadi satu acuan instruksi agent untuk seluruh proyek, termasuk workflow spec-driven dan aturan Next.js. `smartdoc-frontend/CLAUDE.md` hanya merujuk ke `../AGENTS.md`. Pembuatan AGENTS otomatis pada frontend dinonaktifkan melalui `agentRules: false` agar aturan tidak terduplikasi. Instruksi agent bukan spesifikasi produk atau daftar pekerjaan. Dokumentasi memakai bahasa Indonesia dengan istilah teknis tetap Inggris.

## Fitur

- **Converter:** Office (.docx/.xlsx/.pptx) dan gambar menjadi PDF; PDF menjadi DOCX/JPG/PNG. Banyak input hanya untuk gambar menjadi PDF.
- **Compressor:** PDF, gambar, dan Office. PPTX memakai mode Seimbang dengan batas 200 MB; resolusi/transparansi gambar dipertahankan, tetapi warna/detail dapat berubah. Slide, teks, catatan, relasi, chart, font, dan objek tetap dipertahankan dan diverifikasi.
- **Splitter:** ekstraksi page ranges, fixed chunks, atau ZIP berisi setiap halaman.
- **Merger:** penggabungan input yang didukung menjadi PDF serta penyisipan di awal, akhir, atau setelah halaman tertentu.
- **Watermark dan password:** pengaturan teks, rotasi, opacity, ukuran font, warna, serta enkripsi PDF.
- **Workspace:** upload dokumen, folder, pencarian, preview, rename, download, kuota, hasil sementara, dan pemrosesan saved documents tanpa upload ulang.
- **Agenda:** tugas/event, kategori pribadi, lampiran dokumen milik sendiri, kalender month/week/day, drag-and-drop, selected-date scheduling, serta in-app reminders.
- **Administrasi:** pengelolaan status/kuota/sesi akun, process monitoring, health, read-only settings, dan audit tanpa akses isi dokumen pengguna.

Guest memakai tools tanpa akun dan menerima download langsung tanpa history database. User memiliki workspace pribadi. Admin memiliki console terpisah; role Admin tidak melewati ownership policy dokumen/agenda.

## Struktur proyek

```text
smartdoc/
  spec/                       # Spesifikasi, task, arsitektur, desain, dan keamanan
    PRD.md
    task.md
    ARCHITECTURE.md
    DESIGN.md
    security.md
    README.md
    audit/reproduce_backend.py # Helper reproduksi historis; bukan suite test aktif
  smartdoc-frontend/           # Next.js App Router dan TypeScript
    app/ components/ hooks/ lib/
  smartdoc-backend/            # FastAPI, SQLAlchemy, dan Alembic
    app/ alembic/ tests/
    dev_mail.py
    run_tests.py
    requirements.txt
    requirements-dev.txt
  storage/                    # Storage lokal/shared volume sesuai konfigurasi
  docker-compose.yml
  .env.example
  AGENTS.md                   # Workflow spec-driven untuk seluruh repository
```

## Menjalankan secara lokal

Path dan perintah di bawah merujuk ke root repository atau working directory yang disebutkan, bukan direktori dokumen ini. Gunakan `127.0.0.1` secara konsisten pada browser agar sesi cookie tidak terpisah dari `localhost`. Panduan native berikut memakai frontend port 3001 dan backend port 8001.

| Layanan | Alamat lokal |
| --- | --- |
| Frontend | http://127.0.0.1:3001 |
| Backend | http://127.0.0.1:8001 |
| API reference | http://127.0.0.1:8001/docs |
| Email inbox development | http://127.0.0.1:8025 |
| PostgreSQL | Gunakan host/port pada `smartdoc-backend/.env`; konfigurasi contoh lokal memakai `localhost:5433` dan database `smartdoc_db` |

### 1. Database dan environment

Pastikan PostgreSQL lokal/container yang dipakai aplikasi sudah berjalan. Database dapat diperiksa melalui DBeaver, pgAdmin, atau `psql` menggunakan credentials dari konfigurasi lokal. Port 8025 merupakan email viewer, bukan database viewer. Jangan menyalin credentials ke chat atau Git.

Salin contoh environment jika file lokal belum tersedia. Pertahankan konfigurasi yang sudah digunakan apabila file tersebut sudah ada:

```powershell
if (-not (Test-Path smartdoc-backend/.env)) { Copy-Item smartdoc-backend/.env.example smartdoc-backend/.env }
if (-not (Test-Path smartdoc-frontend/.env.local)) { Copy-Item smartdoc-frontend/.env.example smartdoc-frontend/.env.local }
```

Atur `DATABASE_URL` backend sesuai PostgreSQL yang dipakai. Gunakan `FRONTEND_URL=http://127.0.0.1:3001` dan pastikan CORS mengizinkan origin lokal tersebut. Frontend memakai `API_INTERNAL_URL=http://127.0.0.1:8001`.

Backend selalu membaca `smartdoc-backend/.env` secara eksplisit; process environment memiliki prioritas lebih tinggi. File `.env` root merupakan konfigurasi Docker Compose yang terpisah. JWT/database/mail secrets hanya berada di backend, bukan environment publik frontend.

### 2. Backend

Jalankan dari `smartdoc-backend`. Buat virtual environment apabila belum tersedia:

```powershell
if (-not (Test-Path .venv/Scripts/python.exe)) { python -m venv .venv }
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8001 --no-proxy-headers
```

Pada Linux/macOS, executable virtual environment berada di `.venv/bin/python`. Docker backend memakai Python 3.11; frontend memakai Node 24. Gunakan versi dependency dari manifest/lockfile repository. LibreOffice merupakan engine utama Office-to-PDF; DOCX memiliki fallback docx2pdf yang bergantung pada aplikasi Office pada host yang mendukungnya. PyMuPDF menyediakan PDF rendering tanpa external Poppler. Ghostscript/pngquant merupakan optional optimizers dengan Python fallbacks.

Jalankan satu backend process per database (`--workers 1`). Backend memegang PostgreSQL advisory lock sepanjang lifespan; instance kedua ditolak agar recovery tidak mengganggu pekerjaan aktif. Startup menjalankan Alembic migrations dan menandai job terputus sebagai gagal. Saved documents dipertahankan; working files sementara mengikuti TTL. Hentikan backend lama sebelum berganti antara native dan Docker pada database yang sama.

### 3. Email lokal

Pada terminal terpisah dari `smartdoc-backend`:

```powershell
.\.venv\Scripts\python.exe dev_mail.py
```

`MAIL_TRANSPORT=local` merupakan default development. Email verifikasi/reset disimpan dalam direktori `.local-mail` yang diabaikan Git dan dibuka melalui loopback port 8025. Email tidak dikirim ke layanan eksternal. Local delivery ditolak di luar `APP_ENV=development`.

Lokasi outbox adalah `.local-mail` pada parent dari storage root yang sudah di-resolve; default native menempatkannya di direktori backend. Opsi `MAIL_TRANSPORT=smtp` juga tersedia dengan `SMTP_HOST`, `SMTP_PORT`, dan `MAIL_FROM`, tetapi implementasi belum memakai SMTP authentication atau STARTTLS. Compose tidak menyediakan mail service; konfigurasi email perlu disiapkan terpisah sebelum registrasi/verifikasi melalui container. Ketentuan deployment ada di [security.md](security.md).

### 4. Frontend

Jalankan dari `smartdoc-frontend`:

```powershell
npm.cmd ci
npm.cmd run dev -- --hostname 127.0.0.1 --port 3001
```

Next.js rewrite meneruskan `/api/*` ke backend. Guest processing memiliki proxy timeout 330 detik, dengan batas request 202 MB untuk PPTX 200 MB. Browser authentication memakai HttpOnly cookies, session-bound CSRF, dan refresh rotation melalui shared transport.

Uji ingress lokal memakai file sintetis tepat 209.715.200 byte melalui Next.js ke backend; tambahan satu byte ditolak. Startup menolak `MAX_REQUEST_SIZE_MB` yang tidak mencakup batas file/batch ditambah margin multipart 2 MB. Pengaturan Next.js adalah konfigurasi lokal/self-hosted; hosting target tetap perlu diuji. [Vercel Functions](https://vercel.com/docs/functions/limitations#request-body-size) membatasi payload 4,5 MB bila request melewati Function; external rewrites memiliki jalur reverse proxy tersendiri dan belum diuji pada deployment proyek ini.

Fallback `API_INTERNAL_URL` pada source adalah port 8000; panduan native ini memakai 8001 sehingga environment harus diatur eksplisit. Target rewrite Docker diberikan saat build, sehingga perubahan target container memerlukan build ulang frontend.

### 5. Akun dan pemeriksaan alur

Registrasi melalui `/register`, masukkan email dan password yang sama pada konfirmasi, lalu setujui local testing terms. Buka link pada email inbox lokal untuk verifikasi, selesaikan onboarding display name/timezone, kemudian masuk ke workspace. Reset password tersedia melalui `/auth/forgot-password`; link dikirim ke inbox yang sama.

Akun dibuat secara eksplisit, tanpa dummy account atau admin otomatis. Provisioning CLI dari backend:

```powershell
.\.venv\Scripts\python.exe seed_user.py --username NAME --email EMAIL --role admin
```

Password diminta tanpa ditampilkan. Login User berada di `/login` dan Admin di `/admin/login`; reset password dan logout dengan bukti refresh yang belum expired mencabut seluruh sesi akun. Role/status diperiksa oleh backend, bukan hanya navigasi frontend.

JWT cookie dan Bearer wajib terikat ke session database serta memakai issuer/audience/type yang ditentukan server. JWT sessionless lama ditolak. Browser yang masih mempunyai refresh token valid dapat memperoleh access token baru melalui shared refresh transport. Tidak ada penerbitan service token tanpa sesi. Logout membedakan `scope=account` (revocation committed) dan `scope=browser` (cookie dibersihkan tanpa klaim pencabutan perangkat lain). CLI `--update` mencabut refresh maupun access sessions lama.

Untuk production, `AUTH_COOKIE_SECURE=true` wajib dan backend menolak startup bila flag ini false. Gunakan HTTPS, FRONTEND_URL dan origin allowlist yang sesuai. Deployment browser/reverse proxy serta delivery email tetap membutuhkan release checks tersendiri.

## Menjalankan melalui Docker Compose

Siapkan `.env` root dari `.env.example` bila belum tersedia, isi PostgreSQL password dan konfigurasi yang diperlukan, lalu jalankan:

```powershell
docker compose up -d --build
```

Compose menyediakan frontend `http://localhost:3000`, backend `http://localhost:8000`, API reference `http://localhost:8000/docs`, serta PostgreSQL pada host port 5433. Backend di container mengakses database melalui service `db`; frontend memakai `API_INTERNAL_URL=http://backend:8000` saat build. Jangan menjalankan backend native dan Docker bersamaan pada database yang sama.

Sesuaikan `FRONTEND_URL` pada `.env` root dengan origin browser, misalnya `http://localhost:3000`, dan masukkan origin yang sama ke `CORS_ALLOWED_ORIGINS`. Contoh root masih mencantumkan FRONTEND_URL native 3001; menyalinnya tanpa penyesuaian dapat mengarahkan link email dan pemeriksaan origin ke alamat yang berbeda dari frontend Compose. Pilih satu hostname secara konsisten.

Port backend dan database dipublikasikan hanya ke loopback; frontend port 3000 tidak memiliki pembatasan loopback pada Compose. Backend memakai bind mount `./storage` dan `./logs`, database memakai named volume `postgres_data`. Healthcheck backend menggunakan `/ready` yang memeriksa query database, kemampuan menulis storage, dan minimum free disk. Backend Docker berjalan non-root dengan satu worker; frontend memakai standalone output sebagai user node.

## Konfigurasi pemrosesan

| Variabel | Deskripsi | Default |
| --- | --- | --- |
| `APP_ENV` | Environment aplikasi | `development` |
| `DATABASE_URL` | PostgreSQL URL backend; ambil credentials dari environment lokal | Sesuai environment |
| `STORAGE_PATH` | Direktori storage | `./storage` |
| `MAX_FILE_SIZE_DOCUMENT_MB` / `MAX_FILE_SIZE_PDF_MB` | Batas Word/Excel dan PDF | `35` |
| `MAX_FILE_SIZE_PPTX_MB` | Batas PPTX | `200` |
| `MAX_REQUEST_SIZE_MB` | Batas request termasuk multipart | `202` |
| `MAX_PPTX_UNCOMPRESSED_MB` / `MAX_PPTX_ENTRY_MB` | Batas total/per-entry dekompresi PPTX | `512` / `200` |
| `MAX_PPTX_ENTRIES` | Batas komponen internal PPTX, bukan jumlah slide | `20000` |
| `MAX_PPTX_IMAGE_PIXELS` | Budget decode optimasi gambar PPTX; gambar lebih besar disalin utuh | `8000000` |
| `COMPRESSION_PPTX_MODE` | `balanced` untuk optimasi gambar; `lossless` untuk seluruh byte isi tetap sama | `balanced` |
| `COMPRESSION_IMAGE_QUALITY` / `COMPRESSION_IMAGE_DPI` | Target kualitas gambar dan DPI sesuai engine | `85` / `150` |
| `MAX_FILE_SIZE_IMAGE_MB` | Batas gambar | `12` |
| `MAX_TOTAL_UPLOAD_MB` | Total unggahan standar selain pengecualian kompresi PPTX | `35` |
| `MAX_IMAGE_DIMENSION_PX` / `MAX_PDF_PAGES` | Batas sisi gambar dan halaman PDF | `10000` / `50` |
| `MAX_ACTIVE_JOBS_PER_USER` / `MAX_ACTIVE_JOBS_GLOBAL` | Maksimum job pending/processing | `2` / `12` |
| `MIN_FREE_DISK_MB` | Ambang free disk tambahan sebelum admission | `256` |
| `TEMP_FILE_TTL_HOURS` / `JOB_TIMEOUT_SECONDS` | TTL temporary files dan timeout job | `24` / `300` |
| `API_INTERNAL_URL` | URL backend untuk rewrite frontend | `http://127.0.0.1:8001` untuk native |
| `FRONTEND_URL` / `CORS_ALLOWED_ORIGINS` | Origin frontend dan allowlist CORS | Sesuai environment |
| `JWT_ACCESS_SECRET` | Secret backend; alias legacy `SECRET_KEY` masih diterima | Wajib diatur sesuai environment; jangan salin nilai lokal ke dokumentasi |
| `JWT_ACCESS_EXPIRES_IN` | Durasi access JWT | `15m` |
| `JWT_REFRESH_EXPIRES_IN` / `JWT_REFRESH_REMEMBER_ME_EXPIRES_IN` | Absolute expiry refresh session | `7d` / `30d` |
| `AUTH_COOKIE_SECURE` / `AUTH_COOKIE_SAME_SITE` / `AUTH_COOKIE_DOMAIN` | Kebijakan cookies | `false` / `lax` / kosong pada development |
| `TRUST_PROXY` | Flag dideklarasikan; belum terhubung langsung dengan limiter | `false` |
| `MAIL_TRANSPORT` / `MAIL_FROM` | Transport dan sender email | `local` / sender lokal sesuai contoh environment |
| `SMTP_HOST` / `SMTP_PORT` | Relay SMTP dasar; tanpa login/STARTTLS pada implementasi saat ini | `127.0.0.1` / `1025` |
| `MAX_UPLOAD_FILES` | Batas jumlah input | `50` |
| `MAX_TOTAL_IMAGE_PIXELS` | Aggregate pixel budget terkait rendering/konversi | `100000000` |
| `MAX_PDF_PAGE_EDGE_POINTS` | Maksimum sisi halaman PDF | `2400` |
| `MAX_OFFICE_UNCOMPRESSED_MB` / `MAX_OFFICE_ENTRY_MB` / `MAX_OFFICE_ENTRIES` | Batas Office selain PPTX | `128` / `32` / `2000` |
| `MAX_OFFICE_COMPRESSION_RATIO` | Rasio maksimum per ZIP entry Office termasuk PPTX | `200` |
| `API_RATE_LIMIT` / `PROCESS_RATE_LIMIT` / `PREVIEW_RATE_LIMIT` | Rate limits default, scope process, dan preview | `120/minute` / `10/minute` / `20/minute` |

Nilai MB dikonversi menggunakan `1024 * 1024` byte. Pengecualian PPTX 200 MB adalah untuk kompresi dan validasi per-file; total batch tool lain tetap 35 MB. Frontend memakai batas statis dalam `lib/file-validation.ts`, sehingga mengubah environment backend tidak otomatis memperbarui batas UI. Tabel ini menunjukkan default source, bukan pembacaan secrets atau nilai `.env` lokal.

Saved uploads dan saved outputs memakai kuota akun, default 500 MB. Temporary results tidak memakai kuota dan memiliki TTL. Auto-save yang melebihi kuota tetap menyediakan temporary download. Menghapus berkas membebaskan kuota serta mempertahankan activity history; menghapus folder mempertahankan dokumennya.

## Pengujian dan validasi

Frontend, dari `smartdoc-frontend`:

```powershell
npm.cmd test
npx.cmd tsc --noEmit
npm.cmd run lint
npm.cmd run build
```

Backend, dari `smartdoc-backend`:

```powershell
.\.venv\Scripts\python.exe run_tests.py -q
```

Runner backend membuat disposable PostgreSQL database dan temporary storage, menjalankan migrations, lalu membersihkannya. Akun PostgreSQL memerlukan CREATE DATABASE permission. Integration tests tidak dijalankan langsung terhadap database aplikasi. Test fixtures tidak menjadi seed data pengguna.

Gunakan runner tersebut, karena sejumlah integration fixtures memakai akun UUID tetap yang disiapkan runner di database sementara. Nama file `test_all_features_e2e.py` menunjukkan cakupan backend/API, bukan browser E2E. Frontend memakai Node test runner untuk helper/transport; ini belum mencakup seluruh interaksi komponen di browser. Peta cakupan tersedia di [ARCHITECTURE](ARCHITECTURE.md#cakupan-tests-dan-batas-verifikasi).

Pengujian terarah kompresi:

```powershell
.\.venv\Scripts\python.exe run_tests.py -q tests/test_pptx_balanced.py tests/test_pptx_preservation.py tests/test_pptx_upload_limits.py
```

Hasil backend terakhir: full suite 273 lulus pada database/storage disposable. Frontend setelah milestone success handling: 29 tests, TypeScript, targeted lint file yang berubah, dan production build lulus; browser error/recovery dan success feedback desktop/mobile lulus dengan API sintetis. Full lint baseline masih memiliki 12 warnings dan tanpa error. Contoh menjalankan suite auth dengan konfigurasi database test yang tersedia: `python run_tests.py -q tests/test_auth_lifecycle.py tests/test_rbac.py tests/test_cookie_workspace.py tests/test_document_policy.py`. Perintah, cakupan, dan pekerjaan tersisa tersedia pada [task](task.md). Browser E2E seluruh fitur/accessibility penuh, Linux process groups, load, disk-full, dan production deployment tetap perlu diverifikasi.

## Batas implementasi

Halaman error tersedia untuk 404, 403, 500, dan 503. URL tidak dikenal memakai custom not-found; role mismatch/403 pada guard menampilkan akses ditolak; root error/global-error menangani kegagalan rendering; pemeriksaan session yang gagal menyediakan retry 503/500. Halaman bantuan publik berada di `/akses-ditolak` dan `/layanan-tidak-tersedia`. 401 tetap mengikuti refresh/login, dan error form/aksi tetap lokal. Angka pada UI error client tidak mengganti HTTP status dokumen yang sudah terkirim.

Dashboard/list memakai data API/database sebenarnya, tanpa dummy customer, agenda, atau metrik. Status kosong/error ditampilkan secara eksplisit. Ownership dipusatkan di `services/document_policy.py`; Admin tidak memiliki content bypass. Engine CPU memakai disposable processes dengan timeout/cancellation dan cleanup. Sistem belum memakai distributed queue, automatic retry, atau automatic resume.

Google OAuth, Brevo, Turnstile, external notifications, recurring tasks/events, nested folders, version history, trash/recovery, sharing, team workspace, dan billing belum diimplementasikan. OCR/template management berada di luar scope aktif. Detail kebutuhan dan batas produk tersedia di [PRD](PRD.md).

## Lisensi

Proyek ini dibuat dan dikembangkan untuk kebutuhan manajemen pengolahan dokumen cerdas. Bebas digunakan dan dimodifikasi untuk pengembangan lebih lanjut.
