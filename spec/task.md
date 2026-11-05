# SmartDoc — Daftar Pekerjaan

Diperbarui: 6 November 2026. Dokumen ini merupakan pemecahan pekerjaan dari [PRD](PRD.md). Detail arsitektur berada di [ARCHITECTURE.md](ARCHITECTURE.md), referensi visual di [DESIGN.md](DESIGN.md), dan panduan menjalankan aplikasi di [README](README.md).

Status `[x]` berarti implementasi atau pemeriksaan yang disebutkan sudah tersedia. Status `[ ]` berarti belum diselesaikan atau belum diverifikasi. Checklist T-001–T-049 mempertahankan status implementasi dan hasil pemeriksaan terdahulu; pengujian ulang kali ini terbatas pada hasil yang tercantum di bagian bukti penyelesaian. Kelulusan implementasi tidak otomatis berarti production-ready.

## Pemetaan requirement dan kriteria selesai

| Milestone | Dasar kebutuhan PRD | Hasil yang diperiksa |
| --- | --- | --- |
| 1 | FR-03, NFR-01 | Alur akun/sesi dan penolakan akses yang tidak sah |
| 2 | FR-01, NFR-03 | Lima tools menghasilkan unduhan valid atau error yang jelas |
| 3 | FR-04, NFR-01–03 | Operasi dokumen, kuota, sumber tersimpan, dan ownership |
| 4 | FR-05, NFR-07 | Agenda, kategori, kalender, dan preservasi data saat reschedule |
| 5 | FR-06–07, NFR-08 | Administrasi dan audit sesuai batas privacy |
| 6 | NFR-04–06, NFR-09–10 | Batas resource, lifecycle, recovery, dan test isolation |
| 7 | FR-02, NFR-03 | Batas PPTX dan preservasi isi sesuai mode kompresi |
| 8 | NFR-01–10 | Bukti release checks dan keputusan kriteria rilis |

Requirement dan scope didefinisikan di [PRD](PRD.md); detail implementasi di [ARCHITECTURE](ARCHITECTURE.md). Setiap task baru perlu menyebut hasil yang dapat diperiksa, dependensi bila ada, dan rujukan bukti sebelum ditandai selesai. Checklist lama mempertahankan status tercatat; review ini bukan verifikasi ulang seluruh implementasi.

## Milestone 1 — Fondasi dan autentikasi

- [x] T-001: Sediakan frontend Next.js/React/TypeScript dan backend FastAPI/PostgreSQL dengan Alembic migrations.
- [x] T-002: Pisahkan portal login User dan Admin; registrasi publik hanya membuat User.
- [x] T-003: Implementasikan verifikasi email, reset password sekali pakai, onboarding, dan local email inbox.
- [x] T-004: Gunakan HttpOnly cookies, session-bound CSRF, refresh rotation, absolute expiry, dan Remember me.
- [x] T-005: Cabut seluruh sesi saat logout/reset password dan periksa role/status akun melalui database.
- [x] T-006: Sediakan provisioning akun melalui seed CLI tanpa mempublikasikan password atau credentials.

## Milestone 2 — Document tools publik dan privat

- [x] T-007: Sediakan katalog tools dan lima halaman Guest dengan download langsung tanpa history akun.
- [x] T-008: Implementasikan Office/gambar ke PDF dan PDF ke DOCX/JPG/PNG dengan format output sesuai input.
- [x] T-009: Implementasikan compressor untuk PDF, gambar, dan Office.
- [x] T-010: Implementasikan splitter dengan page ranges, fixed chunks, dan individual-page ZIP.
- [x] T-011: Implementasikan merger dan penyisipan dengan validasi jumlah input, urutan, posisi, dan combined page limit.
- [x] T-012: Implementasikan watermark dan password PDF dengan validasi parameter serta preview yang didukung.
- [x] T-013: Bersihkan temporary Guest files setelah respons/kegagalan dan crash leftovers pada startup.
- [x] T-014: Gunakan background jobs untuk tools privat dengan loading/error/status dan hasil download.

## Milestone 3 — Workspace dan kepemilikan dokumen

- [x] T-015: Sediakan direct upload, folder, pencarian, pagination, rename, move, download, dan penghapusan berkas.
- [x] T-016: Pisahkan saved storage dari activity history; hitung kuota melalui `stored_size_bytes`.
- [x] T-017: Pertahankan hasil sementara ketika auto-save gagal karena kuota; terapkan TTL hasil sementara.
- [x] T-018: Sediakan detail dokumen, preview per halaman/fullscreen, metadata, dan related agenda.
- [x] T-019: Proses saved documents melalui lima tools tanpa upload ulang; buat dokumen hasil baru dan pertahankan sumber.
- [x] T-020: Pusatkan ownership policy; tolak akses lintas akun termasuk oleh Admin.
- [x] T-021: Validasi seluruh owner sebelum batch delete dan saring batch download sesuai owner/availability.

## Milestone 4 — Tugas, event, dan kalender

- [x] T-022: Implementasikan CRUD tugas dengan notes, priority, status, dan deadline opsional.
- [x] T-023: Implementasikan CRUD event dengan validasi waktu mulai/selesai.
- [x] T-024: Implementasikan kategori pribadi dengan nama unik case-insensitive, warna, dan assignment opsional.
- [x] T-025: Hubungkan dokumen milik sendiri dengan tugas/event dan pertahankan agenda saat kategori dihapus.
- [x] T-026: Satukan tugas/event dalam kalender month/week/day beserta shared filters.
- [x] T-027: Sediakan drag-and-drop dan selected-date scheduling dengan preservasi waktu, durasi, status, kategori, dan dokumen.
- [x] T-028: Sediakan dashboard counts, storage usage, dan in-app reminders saat dashboard terbuka; arahkan `/tugas` ke kalender.

## Milestone 5 — Administrasi dan audit

- [x] T-029: Sediakan console Admin terpisah dengan backend authorization.
- [x] T-030: Sediakan daftar/detail akun, pencarian, pagination, kuota, status, storage usage, dan session revocation.
- [x] T-031: Sediakan monitoring proses, filter history, health checks, dan read-only service settings.
- [x] T-032: Batasi respons Admin pada metadata yang diizinkan; jangan tampilkan isi dokumen/agenda, password, token, atau raw error.
- [x] T-033: Catat audit perubahan akun/kuota/sesi.
- [x] T-034: Catat aktivitas dokumen dengan transaksi yang terkait, pagination, dan owner-only API.

## Milestone 6 — Keandalan pemrosesan

- [x] T-035: Pusatkan transisi start/complete/fail; output wajib ada dan tidak kosong.
- [x] T-036: Terapkan satu backend runtime per database, admission limits, rate limits, dan free-disk checks.
- [x] T-037: Isolasi engine CPU dalam process dengan timeout/cancellation dan cleanup setelah process berhenti.
- [x] T-038: Tandai interrupted jobs sebagai gagal saat startup; pertahankan saved documents dan beri TTL working files.
- [x] T-039: Gunakan strict page-range parser serta batas request/file/image/page/archive.
- [x] T-040: Jalankan integration tests menggunakan disposable database/storage, bukan data aplikasi.

## Milestone 7 — Kompresi PPTX 200 MB dan mode Seimbang

- [x] T-041: Selaraskan batas PPTX frontend/backend ke 200 MB dan request multipart ke 202 MB.
- [x] T-042: Pisahkan batas 20.000 komponen PPTX dari batas Office lain; bedakan error komponen berlebih dan duplikat.
- [x] T-043: Terapkan batas dekompresi PPTX tanpa menghapus slide untuk memenuhi batas.
- [x] T-044: Optimalkan JPEG/PNG dengan mode `balanced`, menjaga format, resolusi, metadata yang didukung, dan alpha channel.
- [x] T-045: Pertahankan byte seluruh komponen selain gambar yang dioptimalkan; verifikasi output dan fallback ke sumber jika gagal.
- [x] T-046: Aktifkan Seimbang pada Guest, User, dan pemrosesan saved documents; sediakan `lossless` melalui konfigurasi.
- [x] T-047: Hindari rendering preview PDF untuk kompresi PPTX dan tampilkan ukuran output sebenarnya.
- [x] T-048: Uji kompresi file nyata melalui aplikasi lokal: sumber 168,50 MB menjadi 97,71 MB, dengan 422 slide dan 2.798 komponen tetap tersedia. Hasil ini khusus file yang diuji, bukan jaminan untuk semua file 200 MB.
- [x] T-049: Pastikan file asli tidak berubah, output dapat dibaca, serta jumlah shape dan teks slide tetap sama.

## Milestone 8 — Pemeriksaan lanjutan sebelum rilis

- [ ] T-050: Tuntaskan 12 frontend lint warnings yang masih tercatat atau dokumentasikan pengecualian yang beralasan. Full lint terbaru sudah dijalankan dengan exit 0 dan 0 error; perapian warnings belum selesai.
- [x] T-051: Jalankan ulang full backend suite dan simpan hasil terbaru: 248 cases lulus pada database/storage disposable sesudah milestone auth, termasuk regression document tools.
- [ ] T-052: Jalankan browser E2E untuk alur Guest, User, Admin, detail dokumen, audit, dan download.
- [ ] T-053: Periksa keyboard navigation, focus management, screen reader, layout responsive, dan alur touch.
- [ ] T-054: Verifikasi timeout/cancellation dan process-group cleanup di Linux.
- [ ] T-055: Uji load, concurrent jobs, disk-full, crash recovery, serta kegagalan filesystem/database.
- [ ] T-056: Verifikasi clean Docker build/deployment, konfigurasi production, backup/restore, dan dependency security checks terbaru.
- [ ] T-057: Tetapkan release criteria dan target performa/SLA produksi sebelum memberi label production-ready.

Urutan dependensi: fondasi dan autentikasi mendahului workspace privat; ownership dan lifecycle jobs mendahului saved-source processing; verifikasi pada milestone 8 mendahului keputusan rilis. Checklist ini tidak menetapkan tanggal atau penanggung jawab yang belum disepakati.

## Tindak lanjut hasil inspeksi codebase

Pekerjaan berikut mencatat gap yang ditemukan saat memperbarui spec; belum diimplementasikan. Ini mendukung requirement yang sudah ada; status release checks T-050–T-057 mengikuti bukti pemeriksaan terbaru.

| Status / ID | Pekerjaan dan dasar spec | Acceptance criteria dan verifikasi |
| --- | --- | --- |
| [ ] T-058 | Sanitasi error status job owner; NFR-08 dan security bagian batas implementasi | API owner memakai kode/pesan aman; internal details tetap terpisah. Uji error yang berisi path, secret sintetis, dan exception engine; owner/Admin tidak menerima data sensitif. |
| [ ] T-059 | Tinjau redaksi log dan diagnostic traces; NFR-01/08 | Kebijakan log production tidak mengekspos local variables, tokens, password, atau isi file. Uji exception/log dengan data sintetis; dokumentasikan informasi diagnostik yang tetap diperlukan. |
| [ ] T-060 | Seragamkan timestamp API; NFR-02 dan kontrak arsitektur | Semua timestamp UTC menyertakan offset/Z; UI Asia/Jakarta dan UTC menampilkan waktu yang sama secara benar. Perbarui kontrak dan test serialisasi, termasuk jobs. |
| [ ] T-061 | Tetapkan mekanisme pengambilan agenda di atas 500 item; FR-05 | Spec API/UI menetapkan pagination atau pembatasan eksplisit tanpa menyembunyikan agenda secara diam-diam. Verifikasi dengan lebih dari 500 item sintetis. Keputusan kontrak mendahului implementasi. |
| [ ] T-062 | Lengkapi deployment email dan proxy; FR-03, NFR-01/04, security | Tentukan relay/TLS/authentication dan trusted proxy sesuai environment. Verifikasi email serta client identity/rate limit tanpa mempercayai forwarding headers sembarang; terkait T-056 sebelum rilis. |
| [ ] T-063 | Lengkapi response contracts backend/frontend; NFR-09 | Response models atau contract tests mendeskripsikan payload nyata, termasuk storage fields job, bentuk hasil Guest/privat, dan `has_password` yang wajib pada tipe frontend watermark tetapi tidak dikirim handler. Uji kesesuaian client serta API, bukan hanya TypeScript compile. |
| [ ] T-064 | Lengkapi cleanup sebelum private job committed; NFR-03/05/06 | Bagian compressor dituntaskan pada T-078; lanjutkan watermark/splitter agar membersihkan working files saat validasi PDF, flush, atau commit gagal. Fault injection tidak menyisakan orphan `work`/`results`, record palsu, atau menghapus sumber saved. |
| [ ] T-065 | Tetapkan deadline global pipeline Guest; NFR-04/05 | Satu request dengan beberapa konversi memiliki deadline terdokumentasi dalam proxy budget. Timeout/cancellation menghentikan engine sebelum cleanup dan menghasilkan respons yang jelas. Uji pipeline beberapa file dan disconnect tanpa orphan process/file. |

## Milestone 9 - Pematangan Auth dan Access Control

Prioritas aktif sesudah baseline spec. Tidak menyalakan frontend/backend pengguna; integration memakai PostgreSQL sementara dan database disposable. Existing T-001-T-006 menunjukkan fondasi, bukan kelulusan milestone ini.

- [x] T-066: Wajibkan session-bound JWT untuk cookie/Bearer serta claim validation; FR-03/NFR-01. AC: token tanpa sid, malformed, wrong issuer/audience/type, expired/revoked, akun inactive/unverified, dan token_version lama ditolak; role terbaru dari database tetap acuan. Terverifikasi dengan unit dan integration tests.
- [x] T-067: Benahi logout scope dan serialisasi lifecycle; FR-03/NFR-01. AC: known unexpired refresh termasuk rotated token mencabut seluruh sesi; invalid/expired token hanya browser cleanup tanpa pesan palsu. Refresh, login, reset, verify, suspend, revoke-sessions, dan CLI update mengikuti account-before-token locks. Race pada PostgreSQL nyata lulus.
- [x] T-068: Verifikasi matriks auth/session/CSRF/RBAC/ownership; FR-03/FR-04/FR-07. AC: replay, absolute expiry, multi-session, role change, suspend, reset sekali pakai, CSRF missing/foreign origin, dan cross-account akses ditolak sesuai kontrak. Targeted integration, full backend suite, dan client regression lulus; batas browser/deployment dicatat di bawah.

## Milestone 10 - Halaman Error

- [x] T-069: Implementasikan shared ErrorScreen serta root not-found/error/global-error dan URL bantuan 403/503; NFR-07/08. AC: empat halaman berbahasa Indonesia, navigasi/retry relevan, raw error tidak tampil, root fallback tidak bergantung AuthProvider dan mempunyai html/body/styling sendiri. Verifikasi render, build, dan browser.
- [x] T-070: Hubungkan AuthContext/AuthGate dengan error halaman; FR-03/FR-07/NFR-01. AC: 401 tetap refresh/login; 403 dan role mismatch menolak private children; backend 500 tampil 500; jaringan/503 tampil 503 tanpa menghapus sesi. Retry membaca ulang dan kembali ke halaman semula bila layanan pulih. Error form/aksi tidak dialihkan secara global.
- [x] T-071: Verifikasi halaman dan recovery; NFR-07/10. AC: unit/component tests memeriksa classification, rendering aman, dan fallback; frontend tests/typecheck/targeted lint/build lulus. Browser memeriksa 404, role 403, unavailable/recovery, error boundary 500/retry, mobile overflow, dan keyboard actions; layanan test dihentikan setelah pemeriksaan.

## Milestone 11 - Success handling alur utama

- [x] T-072: Seragamkan kontrak client dan toast nonmodal; FR-08/NFR-07/09, DESIGN feedback sukses, ARCHITECTURE kontrak success feedback. AC: 200/201/204 completed terpisah dari 202; malformed/false tidak sukses; maksimum tiga toast tanpa backdrop/focus steal, dismiss/hover/focus dan mobile berfungsi. Terverifikasi unit dan browser.
- [x] T-073: Terapkan konfirmasi auth dan mutation workspace/Admin; dependensi T-072, FR-03/04/05/07/08. AC: reset mempunyai login CTA; register/email generik; login sesuai role; write gagal/accepted tidak memicu feedback selesai atau mengosongkan form. Browser dengan API sintetis dan targeted lint lulus; rincian cakupan di bukti milestone.
- [x] T-074: Validasi hasil processing dan download; dependensi T-072, FR-01/02/08, NFR-03. AC: job done tanpa output tersedia tidak memicu success/download, Guest menolak hasil kosong/nonbinary/202, save hasil memeriksa status saved, ukuran aktual dipertahankan. Regression tests dan browser lulus.
- [x] T-075: Verifikasi milestone success handling; dependensi T-072–T-074. Frontend tests, typecheck, targeted lint, production build, browser alur sukses/gagal/accepted serta layout mobile lulus; layanan pengujian sementara dihentikan. Tidak memakai data pengguna.

## Milestone 12 - Penguatan kompresi PPTX 200 MB

- [x] T-076: Streaming staging PPTX dan disk-backed saved-source snapshot; FR-02/04, NFR-03/04, ARCHITECTURE kompresi PPTX. AC: Guest/private/workspace tidak membentuk bytes buffer seluruh PPTX; snapshot tetap owner-checked, bounded dan dibersihkan. Verifikasi chunk tracking, limit tepat 200 MB/+1 byte, serta regression saved-source/kuota.
- [x] T-077: Pisahkan lifecycle archive PPTX, bounded image optimization, CRC dan atomic output; FR-02, NFR-03/05. AC: seluruh komponen dipertahankan, input CRC rusak gagal, gambar di atas budget disalin utuh, output lolos validator dan hash, partial output tidak dipublikasikan. Dependensi validator path T-076; verifikasi fault injection serta preservasi.
- [x] T-078: Tutup gap staging/commit compressor; NFR-03/06 dan T-064 bagian compressor. AC: validasi, write, cancellation dan commit gagal tidak meninggalkan work/results baru; sumber saved tidak terhapus. Dependensi T-076; verifikasi integration/fault injection. Jalur splitter/watermark T-064 tetap terpisah.
- [x] T-079: Verifikasi kompresi dan batas deployment; dependensi T-076–T-078. Jalankan suite terisolasi, uji upload nyata 200 MB/+1 dan preservasi, periksa proxy/config serta dokumen, catat resource/hosting limits tanpa klaim bebas error. Tidak memakai dokumen pribadi atau database aplikasi; hentikan layanan test setelah verifikasi.

## Backlog di luar scope aktif

Google OAuth, Brevo, Turnstile, external notifications, recurring tasks/events, nested folders, version history, trash/recovery, sharing, team workspace, billing, distributed workers, dan automatic retries/resume menunggu keputusan scope. Fitur tersebut tidak menjadi pekerjaan aktif hanya karena tercatat di backlog. OCR/template management tetap di luar scope.

## Bukti penyelesaian

Catat hasil dan keterbatasan pemeriksaan secara singkat pada task terkait. Kontrol keamanan mengacu pada [security.md](security.md). Centang implementasi tidak menggantikan acceptance criteria dan release checks pada milestone 8.

Pembaruan baseline 5 November 2026 mencakup inspeksi router (59 route aplikasi dan tiga route root/health), 10 model tabel aktif, 11 migrations, 31 page routes frontend, serta konfigurasi deployment dan tests. Server aplikasi tidak dinyalakan. Runner integration mencoba koneksi PostgreSQL namun ditolak sebelum database test dibuat; schema live tidak diperiksa. T-048–T-049 tetap merujuk pemeriksaan file terdahulu; tidak membuktikan semua file PPTX 200 MB berhasil atau seluruh slide telah direview visual.

### Hasil baseline sebelum milestone auth

| Pemeriksaan | Hasil dan cakupan |
| --- | --- |
| `npm.cmd test` dari frontend | 20 tests lulus; helper dan transport, bukan browser E2E |
| `npx.cmd tsc --noEmit` dari frontend | Lulus, exit 0 |
| `npm.cmd run lint` dari frontend | Exit 0; 0 error, 12 warnings terkait img dan font; T-050 tetap terbuka |
| `npm.cmd run build` dari frontend | Lulus; 31 page routes aplikasi serta generated not-found route |
| Backend `python -m pytest -q tests/test_auth_config.py tests/test_page_ranges.py tests/test_pptx_preservation.py tests/test_pptx_upload_limits.py` | 38 cases lulus; termasuk synthetic PPTX tepat 200 MB, penolakan satu byte berlebih, dan preservasi komponen. Tidak membutuhkan database berjalan. |
| Backend `python run_tests.py -q` | Exit 1 saat koneksi PostgreSQL: ConnectionRefusedError/WinError 1225; suite belum berjalan, T-051 tetap terbuka |

Backend targeted run mencatat CryptographyDeprecationWarning ARC4 dari pypdf dan PytestConfigWarning untuk `asyncio_default_fixture_loop_scope`. Perintah tersebut memakai dependency yang sudah terpasang; tidak ada upgrade dependency atau scan terbaru. Log lint/build/backend berada di `logs/spec-review-*`. Database/schema aktual, browser, Docker, Linux, dan full suite tetap belum terverifikasi pada review ini.

Dokumentasi dicocokkan dengan route/schema/config/token source serta diperiksa tautan, heading, code fences, dan referensi task. Temuan T-058–T-065 masih terbuka; pekerjaan ini menyelaraskan spec dan bukan implementasi perbaikannya.

Pemeriksaan baseline sebelum perubahan auth: 9 Markdown proyek/instruksi diperiksa, 46 tautan lokal valid, 59 route router tercantum, 65 task IDs unik berurutan, tujuh bagian utama PRD tersedia, dan 44 token warna DESIGN sama dengan source. Seluruh field konfigurasi Settings dicantumkan pada README; 10 tabel/84 kolom ORM dicatat tanpa akses database live. Snapshot hash 219 source files aplikasi/tests tetap sama setelah penataan dokumentasi dan checks. Port aplikasi 3001/8001/8025 tidak mendengarkan saat pemeriksaan akhir.

### Hasil milestone auth

Spec PRD/security/arsitektur dan T-066–T-068 ditulis sebelum implementasi. PostgreSQL 16 sementara dipakai pada loopback port 15433 tanpa volume aplikasi; runner membuat dan menghapus database test serta temporary storage. Environment test hanya berlaku pada process test, bukan perubahan `.env` aplikasi. Tidak ada migration baru atau modifikasi database/dokumen pengguna.

| Pemeriksaan | Hasil |
| --- | --- |
| Targeted auth/RBAC/workspace/policy pertama | 45 lulus; bukti awal, tidak dijumlahkan dengan suite berikut |
| Lifecycle policy/race run awal | 54 lulus sebelum enam cases tambahan |
| Full backend suite terakhir | 248 lulus, 0 gagal, 145,41 detik; mencakup 60 cases di `test_auth_lifecycle.py` |
| Frontend regression | `npm.cmd test`: 20 lulus; shared refresh transport, role routing, dan helpers |
| Syntax dan dokumen | Python AST parse serta referensi Markdown lulus; `git diff --check` lulus |

Delapan race cases menguji kedua urutan refresh melawan logout/reset/suspend/Admin revoke dengan independent HTTP connections dan waiters yang dikonfirmasi melalui PostgreSQL locks. Cases tambahan menguji login vs suspend pada kedua urutan, verify/reset serentak (hanya satu sukses), JWT malformed/sessionless, foreign/revoked/expired sessions, status akun, expired replay tanpa revocation login baru, logout scope, absolute expiry, dan CLI credentials update.

HTTPS cookie test memakai ASGITransport dengan URL HTTPS, menguji Secure/HttpOnly/SameSite flags serta CSRF Origin. Ini bukan browser TLS/reverse-proxy test. Login multi-session memakai HTTP clients independen, bukan real-browser multi-tab. Browser E2E, email production, proxy, dan release checks pada T-052/T-056/T-062 tetap terbuka.

Run full pertama mencatat 243 lulus dan 5 kegagalan fixture endpoint lama (mock count bukan integer). Fixture diperbaiki agar mengikuti kontrak advisory-lock/count admission tanpa menonaktifkan kontrol, lalu full suite dijalankan ulang hingga 248 lulus. Dua warnings pypdf ARC4 dan pytest configuration masih tercatat. Log run tersedia pada `logs/auth-milestone-*.txt`.

Penutupan milestone: query PostgreSQL mengonfirmasi nol database `smartdoc_test_*` tertinggal, lalu container sementara `smartdoc-auth-test-postgres` dihentikan dan dihapus melalui `--rm`. Pemeriksaan akhir 9 Markdown/46 tautan/68 task IDs, syntax Python, dan `git diff --check` lulus. Frontend/backend pengguna tetap tidak dinyalakan. Browser E2E dan deployment bukan bagian yang dinyatakan selesai oleh milestone API ini.

### Hasil milestone halaman error - 6 November 2026

T-069–T-071 selesai. PRD, DESIGN, ARCHITECTURE, security, dan task diperbarui sebelum kode. Custom 404/403/500/503, root/global boundaries, AuthGate/Context, dan onboarding guard mengikuti kontrak halaman. Form/processing mutation tidak dialihkan atau diulang otomatis.

- `npm.cmd test`: 24 lulus, termasuk component rendering tanpa auth context, raw error tidak tampil, retry/reset fallback, availability classification, serta busy/status feedback.
- `npx.cmd tsc --noEmit`, targeted ESLint seluruh file yang berubah, dan `npm.cmd run build`: lulus. Build memuat 33 page routes aplikasi dan framework not-found.
- Browser Edge headless pada isolated production frontend port 3101: actual HTTP 404, empat skenario 403 (URL bantuan, kedua role mismatch, backend 403), backend/render 500, retry render, network/503 dengan cookie tetap tersedia, retry ke URL semula, 401 ke login, onboarding unavailable tanpa redirect palsu, serta public 503 probe/recovery lulus.
- Keempat halaman diperiksa pada 320px tanpa horizontal overflow, action minimum 44px, dan keyboard Tab dapat mencapai action. Screenshot desktop/mobile diperiksa; artifacts berada pada `logs/error-pages-review`. API test diintersep dengan respons sintetis dan seluruh request test hanya GET; tidak memakai akun/seed/database pengguna.
- Root global error diuji component render untuk html/body serta sanitasi; root-layout crash nyata tidak diinjeksi di browser. Tidak ada klaim accessibility audit penuh atau E2E seluruh fitur.

Browser sempat menemukan root metadata menimpa judul error; static metadata dan sinkronisasi judul fallback diperbaiki, kemudian browser suite diulang sampai lulus. Frontend sementara dan browser test dihentikan sesudah verifikasi. Backend suite tidak diulang karena milestone ini hanya mengubah frontend.

### Hasil milestone success handling - 6 November 2026

T-072–T-075 selesai. PRD FR-08, DESIGN, ARCHITECTURE, dan task diperbarui sebelum kode. API client mempertahankan HTTP status serta menolak envelope malformed; helper completed/accepted dan output tersedia dipakai bersama. Toast menjadi nonmodal; reset password memiliki konfirmasi tetap dan login CTA. Auth, mutation dokumen/folder, agenda/kategori, Admin, save hasil, serta feedback download mengikuti kontrak sukses.

- `npm.cmd test`: 29 lulus, termasuk lima regression tests baru yang menguji respons completed/202/false/malformed/204, status job tanpa output, serta hasil binary kosong/JSON/HTML. Typecheck dan production build lulus; 33 page routes tetap. Targeted ESLint seluruh TypeScript yang berubah lulus tanpa error, dengan empat existing warnings `<img>` pada preview Guest.
- Edge headless pada frontend production sementara port 3101: login User/Admin menuju halaman sesuai role, reset gagal/sukses dengan konfirmasi, register/check-email dan forgot generik, verify/onboarding dengan feedback, write 422/202/malformed tanpa sukses atau reset input, create folder/upload/move dengan refresh, serta double-submit guard lulus.
- Toast maksimum tiga saat pesan keempat datang, halaman tetap dapat dioperasikan, close 44px, pause saat focus/hover, Escape, auto-dismiss, dan layout 320px diperiksa. Konfirmasi reset tidak overflow pada 320px; warna teks CTA diperbaiki setelah inspeksi screenshot dan diverifikasi kembali.
- Browser memeriksa perubahan akun Admin 200 vs 202/422; saved-source accepted/pending/done tanpa hasil vs siap; kuota penuh tanpa klaim saved; save terkonfirmasi; serta download dengan pesan dimulai. Callback private compressor tidak memicu success saat output tidak tersedia. Guest menolak binary kosong, 202, dan JSON; binary tidak kosong menampilkan ukuran/result sebenarnya dari respons sintetis.
- API diintersep dengan data sintetis; tidak memakai akun/seed/database pengguna atau menjalankan engine dokumen nyata. Browser ini bukan E2E backend maupun pemeriksaan seluruh mutation agenda, semua tool, atau seluruh kombinasi accessibility. Backend tidak diubah dan suite backend tidak diulang. Release checks T-050–T-057 tetap mengikuti statusnya.

Screenshot desktop/mobile diperiksa pada `logs/success-feedback-review`; harness lokal ada di `.browser-test/success_feedback_check.py`. Frontend sementara dan browser ditutup sesudah verifikasi; backend pengguna tetap berhenti. Storage fields pada JobStatus sudah ditambahkan, tetapi T-063 tetap terbuka untuk kelengkapan kontrak backend/frontend lainnya.


### Hasil milestone penguatan PPTX - 6 November 2026

T-076?T-079 selesai. PRD, ARCHITECTURE, security, dan task diperbarui sebelum kode. Upload PPTX memakai staging disk dalam chunk 1 MB; snapshot saved-source memakai spooling 1 MB. Engine archive PPTX dipisah, CRC/hash sumber diperiksa sebelum fallback, entry besar disalin streaming, dan optimasi gambar mempunyai budget 32 MB encoded/8 juta pixels tanpa menghapus gambar di atas budget. Hasil dipublikasikan secara atomik; partial path didaftarkan untuk cleanup dan recovery. Startup memeriksa konsistensi batas request.

- Full backend suite: **273 lulus**, termasuk 25 cases resource baru. Log `logs/pptx-full-suite.txt` mencatat 181,58 detik dan dua existing warnings pypdf ARC4/pytest configuration. Angka ini merupakan unique cases full run; targeted runs sebelumnya tidak dijumlahkan.
- File sintetis tepat 209.715.200 byte diterima pada Guest compressor, private upload compressor, serta direct workspace upload dan pemrosesan saved-source. Tambahan satu byte ditolak 413. Tests memastikan seluruh parts dipertahankan dan sumber saved tetap tersedia. Preservasi slides/hidden slides/notes/charts/metadata/transparency serta batas 20.000 entries tetap lulus pada regression suite.
- Fault injection memeriksa reads dengan chunk terbatas, empty/malformed/oversized input, read/write/commit failure, cancellation staging dan job, CRC sumber rusak, atomic-publish failure, validasi ulang output, pixel budget, snapshot disk/close, dan sumber workspace yang tetap utuh saat gagal. Cancellation job memakai simulasi engine terputus; tidak mengklaim real backend crash PPTX telah diinjeksi.
- Uji jaringan nyata lewat Next.js development port 3101 ke Guest-only FastAPI sementara port 8101: file 200 MB menerima HTTP 200, +1 byte menerima 413, seluruh parts dibandingkan dengan SHA-256, satu slide sintetis tetap ada, serta Guest temp directory bersih. Output file sintetis ini hampir sebesar sumber karena payload besarnya merupakan stored binary yang dipertahankan; ini menguji batas/preservasi, bukan target rasio kompresi. Report ada pada `logs/pptx-ingress-review/result.json`.
- Database memakai PostgreSQL 16 sementara port 15433 dan storage/database disposable. Tidak mengakses database aplikasi atau mengompres ulang dokumen pribadi. Sesudah runner selesai, query memastikan nol database test tertinggal; container `--rm`, frontend test, dan backend test dihentikan. Syntax Python dan diff check lulus. Frontend tidak diubah pada milestone ini; hasil frontend terakhir tetap 29 tests/typecheck/targeted lint/build pada milestone success handling.

Dokumen menjelaskan batas hosting: local proxy sudah diuji, sedangkan deployment Vercel/external proxy belum. Load/concurrency pada batas RAM container 2 GB, disk-full sistem nyata, Linux process groups, dan production deployment tetap mengikuti T-054?T-057. T-064 tetap terbuka untuk staging splitter/watermark. Direktori runtime dan hasil kompresi pribadi ditambahkan ke gitignore; file pribadi tetap lokal.
