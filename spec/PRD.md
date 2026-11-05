# SmartDoc — Product Requirements Document

Diperbarui: 6 November 2026. Status: development dan validasi lokal. Dokumen ini mendefinisikan kebutuhan produk; rencana pekerjaan tersedia di [task.md](task.md), keputusan teknis di [ARCHITECTURE.md](ARCHITECTURE.md), dan referensi visual di [DESIGN.md](DESIGN.md).

Baseline kebutuhan diselaraskan melalui inspeksi working tree dan pemeriksaan terarah pada tanggal tersebut. Dokumen ini memuat perilaku produk yang dituju; status implementasi, hasil tests, dan gap berada di task. Kelulusan pemeriksaan terarah tidak berarti seluruh acceptance criteria sudah terverifikasi.

## 1. Problem Statement

Pengguna perlu mengolah dokumen dalam berbagai format, mengecilkan ukuran berkas, mengatur halaman, serta menambahkan watermark atau password. Pekerjaan ini sering dilakukan terpisah dari penyimpanan dokumen dan pengelolaan tugas yang terkait dengan dokumen tersebut.

SmartDoc menyediakan document tools publik untuk kebutuhan sekali pakai dan workspace pribadi untuk menyimpan dokumen serta menghubungkannya dengan tugas dan kalender. Masalah yang harus ditangani adalah ketidakjelasan hasil pemrosesan, risiko perubahan atau kehilangan isi dokumen, akses lintas akun yang tidak sah, dan kesulitan melacak pekerjaan terkait dokumen.

Pernyataan masalah ini menjadi dasar kebutuhan produk. Dokumen ini belum memuat hasil user research, ukuran pasar, atau metrik penggunaan produksi.

## 2. Goals

- Memungkinkan Guest menggunakan lima document tools dan mengunduh hasil tanpa membuat akun.
- Menyediakan workspace pribadi untuk dokumen, folder, tugas, event, kalender, dan riwayat aktivitas.
- Menjaga kepemilikan dokumen dan agenda pada setiap operasi, termasuk ketika pengakses memiliki role Admin.
- Memberikan hasil unduhan yang valid, status pemrosesan yang sesuai keadaan sebenarnya, dan pesan kegagalan yang dapat ditindaklanjuti.
- Mendukung kompresi PPTX hingga 200 MB dengan mode Seimbang, tanpa menghapus slide, teks, catatan, atau objek.
- Menyediakan administrasi akun dan pemantauan operasional tanpa membuka isi dokumen pengguna.

Keberhasilan dinilai dari terpenuhinya acceptance criteria, pengujian dengan data terisolasi, dan pemeriksaan hasil dokumen. Target adopsi, conversion rate, SLA produksi, dan target durasi untuk setiap jenis dokumen belum ditetapkan. Kelulusan automated tests tidak menjadi bukti production readiness.

## 3. Target Users

| Target user | Kebutuhan utama | Hak akses |
| --- | --- | --- |
| Guest | Mengolah dokumen sekali pakai dan langsung mengunduh hasil | Halaman document tools publik; tanpa penyimpanan permanen atau riwayat akun |
| User | Menyimpan dokumen, memproses ulang, serta mengatur tugas dan event terkait | Workspace pribadi, document tools, folder, riwayat, kalender, dan profil |
| Admin | Mengatur akses akun dan memantau kesehatan layanan | Console administrasi, kuota, pencabutan sesi, metadata proses, audit, konfigurasi read-only, dan profil sendiri |

Guest merupakan keadaan tanpa autentikasi, bukan role akun yang disimpan di database. Role akun adalah `user` dan `admin`. Registrasi publik selalu membuat User. Pembuatan Admin menggunakan seed CLI secara eksplisit. Admin tidak memperoleh akses ke dokumen, tugas, event, atau kategori pribadi akun lain.

## 4. User Stories

| ID | User story | Acceptance criteria |
| --- | --- | --- |
| US-01 | Sebagai Guest, saya ingin mengolah dokumen tanpa registrasi agar dapat langsung memperoleh hasil. | Lima tools tersedia di URL publik; hasil dapat diunduh; tidak ada Document atau Job dalam riwayat akun. |
| US-02 | Sebagai pengguna, saya ingin mengompres PPTX besar agar lebih mudah dibagikan. | PPTX valid hingga 200 MB diterima selama memenuhi batas keamanan/resource; seluruh slide dan komponen tetap tersedia; hasil tidak lebih besar dari sumber. |
| US-03 | Sebagai pengguna, saya ingin mengetahui ukuran hasil yang sebenarnya agar dapat menilai penghematan. | Ukuran dan persentase pengurangan berasal dari berkas hasil, bukan angka estimasi. |
| US-04 | Sebagai User, saya ingin mendaftar dan memverifikasi email agar dapat menggunakan workspace pribadi. | Konfirmasi password dan persetujuan terms diwajibkan; link verifikasi sekali pakai; verifikasi dilanjutkan ke onboarding. |
| US-05 | Sebagai User, saya ingin mengelompokkan dokumen dalam folder agar mudah ditemukan. | Dokumen dapat diunggah, dicari, dipindah, diganti nama, dan diunduh; menghapus folder tidak menghapus dokumennya. |
| US-06 | Sebagai User, saya ingin memproses dokumen tersimpan agar tidak perlu mengunggah ulang. | Tools menerima dokumen milik sendiri; hasil menjadi dokumen baru; dokumen sumber dipertahankan. |
| US-07 | Sebagai User, saya ingin mengaitkan dokumen dengan tugas dan event agar pekerjaan terjadwal. | Lampiran harus milik sendiri; jadwal, status, kategori, dan tautan dokumen tetap terjaga saat reschedule. |
| US-08 | Sebagai User, saya ingin melihat aktivitas dokumen agar dapat melacak perubahan dan pemrosesan. | Aktivitas tersedia pada detail dokumen milik sendiri, menggunakan pagination dan kode kegagalan yang aman. |
| US-09 | Sebagai User, saya ingin sesi akun terlindungi agar akses dapat dicabut saat logout atau reset password. | Logout dengan bukti refresh yang valid dan reset password mencabut seluruh sesi; logout tanpa bukti sesi hanya membersihkan browser dengan scope yang jujur. Token mentah tidak disimpan di localStorage atau tabel autentikasi. |
| US-10 | Sebagai Admin, saya ingin mengatur status, kuota, dan sesi akun agar akses layanan dapat dikendalikan. | Tindakan memerlukan otorisasi Admin dan tercatat dalam audit; password dan session token tidak ditampilkan. |
| US-11 | Sebagai Admin, saya ingin memantau proses dan kesehatan layanan tanpa membaca dokumen pengguna. | Console hanya menampilkan metadata yang diizinkan; tidak ada preview, download, atau akses agenda pengguna lain. |
| US-12 | Sebagai pengguna, saya ingin kegagalan pemrosesan dijelaskan agar dapat mencoba kembali. | Output kosong atau parsial tidak dinyatakan berhasil; proses terputus saat restart ditandai gagal dan meminta unggah ulang. |

## 5. Functional Requirements

### FR-01 — Document tools publik

- Landing page `/` menampilkan katalog tools. Setiap tool memiliki halaman publik: `/konversi`, `/kompresi`, `/pisah-halaman`, `/gabung-berkas`, dan `/watermark-sandi`.
- Converter menyediakan Office atau gambar ke PDF, serta PDF ke DOCX/JPG/PNG. Pilihan output mengikuti format input yang didukung. Banyak input hanya digunakan untuk gambar menjadi PDF.
- Input Office yang didukung adalah DOCX/XLSX/PPTX, gambar JPG/JPEG/PNG. Splitter dan watermark menerima PDF/DOCX; merger dan compressor menerima format yang didukung sesuai tool. ZIP hasil bukan sumber yang dapat diproses ulang oleh kelima tools.
- Konversi PDF ke gambar pada Guest menghasilkan ZIP; pada jalur privat satu halaman menghasilkan berkas gambar dan banyak halaman menghasilkan ZIP. UI harus menawarkan hasil sesuai berkas aktual.
- Splitter mendukung rentang halaman, fixed chunks, dan ZIP berisi halaman individual. Input rentang atau ukuran chunk ditampilkan sesuai mode yang dipilih.
- Merger mendukung penggabungan dan penyisipan dokumen di awal, akhir, atau sesudah halaman tertentu. Mode penyisipan menerima dua input.
- Watermark mendukung teks, opacity, rotasi, ukuran font, warna, dan proteksi password PDF.
- Perubahan berkas atau opsi menghapus hasil unduhan sebelumnya agar hasil lama tidak disalahartikan sebagai hasil baru.
- Guest menerima unduhan langsung tanpa membuat record Document atau Job. Berkas sementara dibersihkan setelah pengiriman atau kegagalan; startup membersihkan sisa proses yang terputus.
- Tools privat mendukung preview, background jobs, status proses, riwayat, dan pilihan menyimpan hasil ke workspace.

### FR-02 — Kompresi dan keutuhan PPTX

- Batas unggah PPTX adalah 200 MB per berkas. Batas default Word, Excel, dan PDF adalah 35 MB; gambar adalah 12 MB.
- Dukungan 200 MB berlaku pada alur kompresi PPTX, termasuk sumber tersimpan. Tool lain tetap mengikuti batas batch dan preview masing-masing. Ukuran yang disebut MB pada aplikasi dihitung dengan kelipatan 1.024 × 1.024 byte.
- Validator PPTX mendukung sampai 20.000 komponen internal, bukan 20.000 slide. Batas dekompresi tetap diterapkan: total 512 MB, maksimum 200 MB per komponen, dan rasio kompresi maksimum sesuai konfigurasi.
- Mode default `balanced` mengoptimalkan JPEG/PNG dengan menjaga format, resolusi, dan transparansi. Warna atau detail gambar dapat berubah. Gambar animasi dan format yang tidak dapat dipertahankan dengan aman menggunakan data asli.
- Seluruh komponen tetap tersedia dan urutannya dipertahankan. Slide XML, teks, catatan, relasi, font, chart, embedded objects, dan media yang tidak dioptimalkan diperiksa identik dengan sumber.
- Gambar yang dioptimalkan harus lolos pemeriksaan sebelum disimpan. Hasil yang gagal verifikasi atau tidak lebih kecil dikembalikan sebagai salinan sumber.
- Mode `lossless` tersedia melalui konfigurasi backend untuk mempertahankan seluruh byte isi komponen.
- Kompresi PPTX tidak memerlukan rendering preview PDF. Semua slide diproses tanpa menghapus slide tersembunyi maupun slide yang melewati batas halaman PDF.
- UI menampilkan ukuran berkas hasil yang sebenarnya dan menyediakan unduhan PPTX. Tidak ada jaminan persentase pengurangan yang sama untuk setiap berkas.
- Upload kompresi PPTX, upload workspace PPTX, dan snapshot sumber tersimpan menggunakan disk/spooling dengan chunk terbatas; file 200 MB tidak digabung menjadi satu buffer bytes pada jalur tersebut. ZIP entries besar disalin secara streaming. Optimasi gambar melewati gambar yang melampaui budget kerja dengan mempertahankan byte sumber.
- Input dengan CRC/struktur rusak tidak boleh dilaporkan sebagai kompresi berhasil. Output ditulis ke temporary file lalu dipublikasikan setelah validasi struktur, batas archive, dan integritas. Fallback hanya memakai sumber valid; kegagalan staging/commit membersihkan berkas milik operasi tersebut dan mempertahankan dokumen sumber.
- Dukungan 200 MB memerlukan seluruh jalur hosting/proxy menerima request multipart minimal 202 MB. Pengaturan aplikasi tidak dapat menaikkan hard limit platform hosting; dukungan deployment dinyatakan setelah pengujian pada environment tersebut.

### FR-03 — Autentikasi dan sesi

- Login email/password menggunakan portal terpisah untuk User dan Admin. Navigasi publik tidak mempromosikan URL login Admin.
- Registrasi mewajibkan konfirmasi password dan persetujuan local testing terms; field role tidak dapat digunakan untuk membuat Admin.
- Link verifikasi dan reset password sekali pakai, kedaluwarsa dalam 30 menit, dan disimpan dalam bentuk hash.
- Verifikasi membuat sesi dan dilanjutkan ke onboarding tanpa login kedua. Onboarding mengumpulkan display name dan timezone WIB, WITA, WIT, atau UTC.
- Access JWT default 15 menit; refresh token default 7 hari atau 30 hari dengan Remember me. Refresh token dirotasi secara atomik, memiliki absolute expiry, dan disimpan sebagai hash.
- Penggunaan ulang refresh token yang sudah dicabut membatalkan sesi akun. Logout dan reset password mencabut akses seluruh perangkat.
- Browser menggunakan HttpOnly cookies serta pemeriksaan CSRF yang terikat pada sesi; login dan registrasi menggunakan pre-session binding. AuthContext menyimpan profil, bukan raw token. Token localStorage lama dibersihkan.
- Role dan status akun diperiksa melalui database. Bearer authentication tetap didukung untuk client internal dan pengujian.
- Milestone pematangan auth mewajibkan JWT cookie/Bearer memiliki session ID, issuer/audience dan penanda access token yang valid. Sessionless JWT lama ditolak; client internal harus memakai token dari sesi yang tercatat. Akun belum verified, sesi dicabut/kedaluwarsa, dan token_version lama ditolak.
- Logout dengan refresh token yang dikenal dan belum kedaluwarsa mencabut seluruh sesi, termasuk jika token baru saja dirotasi. Tanpa bukti sesi tersebut, respons hanya menyatakan cookie browser dibersihkan. Refresh/logout/reset/suspend memakai account lock yang konsisten; akses yang sudah dicabut tidak dipulihkan oleh refresh bersamaan.
- Profil menyediakan display name dan timezone Asia/Jakarta, Asia/Makassar, Asia/Jayapura, atau UTC. Pengaturan profil saat ini tidak menyediakan perubahan email, penghapusan akun, atau pengaturan password mandiri selain reset melalui email.
- Email lokal ditangkap dalam direktori `.local-mail` yang diabaikan Git dan dibaca melalui loopback port 8025. Google, Brevo, dan layanan email eksternal belum terintegrasi.
- Migration 006 mempertahankan akses akun lama dengan menandainya verified dan membatalkan JWT lama. Akun baru wajib memverifikasi email.

### FR-04 — Penyimpanan dokumen

- User dapat mengunggah dokumen ke private storage secara mandiri, membuat/rename/menghapus folder, serta memindahkan dokumen antar-folder.
- Penghapusan folder mempertahankan dokumen tanpa folder. Daftar dokumen mendukung pencarian, pagination, download, rename, dan penghapusan berkas fisik.
- Folder memiliki satu tingkat. Workspace menampilkan saved files; history tetap menampilkan record pemrosesan setelah berkas dihapus atau kedaluwarsa. Keduanya tidak harus memiliki jumlah yang sama.
- Kuota default 500 MB berlaku untuk upload dan hasil yang disimpan. Penggunaan dihitung dari `stored_size_bytes` dokumen tersimpan; temporary results tidak memakai kuota akun.
- Penyimpanan memeriksa kuota dengan account lock. Auto-save yang melebihi kuota tetap menyediakan hasil sementara yang dapat diunduh sebelum TTL berakhir.
- Penghapusan berkas membebaskan kuota dan mempertahankan riwayat aktivitas. Output disk space belum dipesan di muka.
- Detail `/dokumen/[id]` menyediakan preview per halaman/fullscreen, metadata, kontrol rename/folder, agenda terkait, serta pemrosesan ulang melalui lima tools.
- Pemrosesan dokumen tersimpan menggunakan sumber milik sendiri dan membuat dokumen hasil baru. Mixed batch download hanya menyertakan hasil milik sendiri yang tersedia; batch delete memvalidasi semua kepemilikan sebelum menghapus berkas.
- Ketersediaan tools mengikuti format sumber: PDF/DOCX mendukung kelima tools; XLSX/PPTX/gambar mendukung converter, compressor, dan merger. ZIP hasil tetap dapat diunduh/disimpan tetapi belum didukung sebagai input tools atau preview dokumen.

### FR-05 — Tugas, event, kalender, dan pengingat

- User dapat membuat, mengubah, dan menghapus tugas dengan catatan, prioritas, status, serta deadline opsional.
- User dapat membuat, mengubah, dan menghapus event dengan validasi waktu mulai dan selesai.
- Tugas/event dapat memiliki satu kategori pribadi opsional dengan nama dan warna. Nama kategori unik per akun secara case-insensitive. Penghapusan kategori mempertahankan agenda sebagai uncategorized.
- Status agenda adalah todo/doing/done, priority low/normal/high; setiap item menerima maksimal 20 lampiran dokumen. Endpoint daftar saat ini membatasi respons pada 500 item terbaru tanpa pagination; batas ini perlu terlihat dalam perencanaan pertumbuhan data.
- Dokumen yang dilampirkan harus milik sendiri. Akses dan assignment lintas akun ditolak, termasuk untuk Admin.
- `/kalender` menyatukan tugas dan event dalam tampilan month/week/day. Form berada di kiri dan daftar draggable cards di kanan pada desktop; layout menumpuk pada layar kecil.
- Drag-and-drop atau tombol selected-date menjadwalkan ulang dengan mempertahankan waktu, durasi event, status, kategori, dan tautan dokumen. Tugas tanpa deadline tetap dapat disimpan.
- Filter kalender dan daftar menggunakan kategori serta pilihan all/unscheduled/selected-date yang sama. Task completion mengubah tampilannya pada kalender.
- `/tugas` diarahkan ke kalender dan tidak menjadi navigasi terpisah.
- Dashboard menampilkan jumlah dokumen, tugas terbuka, storage usage, serta in-app reminders untuk 24 jam mendatang dan tugas terlambat. Polling pengingat hanya berjalan saat dashboard terbuka.

### FR-06 — Aktivitas dokumen

- Detail dokumen menyediakan aktivitas milik sendiri dengan pagination: upload, rename, perpindahan folder, save, penghapusan berkas, dan proses queued/started/finished.
- Event berisi ID, action, outcome, waktu UTC, dan failure code yang diizinkan. System transitions tidak memiliki human actor ID. Isi dokumen, nama, password, token, dan raw engine error tidak disimpan.
- Perubahan yang committed dan audit event terkait menggunakan transaksi yang sama. Process failure, interrupted recovery, dan quota-save failure dicatat.
- Aktivitas pemrosesan melekat pada dokumen hasil. Penghapusan berkas mempertahankan audit/history. Tidak ada endpoint untuk mengedit audit atau mengisi aktivitas lama secara fiktif.
- Migration 011 menyediakan `document_audit`. Log ini tidak mencakup semua permintaan ditolak, download/read, atau seluruh kegagalan infrastruktur, dan bukan external compliance log yang tamper-proof.

### FR-07 — Administrasi

- Admin masuk ke `/administration` dengan navigasi dashboard, users, monitoring proses, health, audit, settings, dan profil sendiri. User ditolak dari area serta API Admin.
- Daftar akun mendukung pencarian email, pagination 10 record, nomor baris berkelanjutan, dan pagination controls hanya jika hasil melebihi 10 record.
- Baris dan email berupa teks. Action icon membuka detail akun dengan nama, email, role, status, verifikasi, waktu registrasi, onboarding, kuota, dan storage usage.
- Admin dapat mengaktifkan/suspend User, mengatur kuota, dan mencabut sesi. Suspend mengunci akun dan mencabut sesi; akun Admin tidak dapat disuspend melalui panel ini. Perubahan role dan provisioning Admin menggunakan CLI.
- Storage usage dihitung dari agregasi yang sama dengan quota enforcement. Dokumen, agenda, password, hash password, dan session token tidak ditampilkan.
- Monitoring proses dan audit menggunakan pagination 25 record. Monitoring awal menampilkan seluruh proses aktif; history mendukung 24 jam, 7 hari, dan all-time berdasarkan creation time, serta filter feature/status. Refresh berjalan tiap 15 detik selama tampilan terlihat.
- Metadata proses mencakup ID, feature/status, progress, UTC timestamps, durasi, dan generic failure code. Tidak ada linkage pengguna/dokumen, nama, path, raw error, preview, atau download dokumen pengguna lain.
- Health memeriksa backend/database, storage availability/free space/write permissions, serta engine discovery. Engine discovery tidak menjamin setiap konversi berhasil.
- Settings hanya memperlihatkan konfigurasi yang diizinkan dan bersifat read-only. Perubahan dilakukan melalui environment/deployment.
- Audit Admin mencatat perubahan akun, kuota, dan sesi. Metrik hanya berasal dari workspace yang tercatat; penggunaan Guest tidak direkayasa menjadi history atau statistik.

### FR-08 — Success handling

- Login berhasil mengarahkan ke onboarding atau halaman sesuai role. Registrasi dan permintaan email memakai konfirmasi generik yang tidak mengungkap keberadaan akun. Reset password menampilkan konfirmasi dan action login; verifikasi email serta penyimpanan profil memberikan feedback setelah respons valid.
- Mutation sinkron pada dokumen, folder, agenda, kategori, dan administrasi menampilkan toast singkat atau status di halaman setelah API mengonfirmasi keberhasilan. Form tetap dapat diperbaiki bila gagal; loading mencegah submit berulang. Pembacaan data tidak memicu toast sukses.
- HTTP 200/201 dengan envelope `success: true` atau respons 204 yang sah dapat mengonfirmasi mutation selesai. HTTP 202 berarti diterima untuk diproses dan tidak boleh dianggap selesai. Respons malformed atau `success: false` tidak menampilkan keberhasilan.
- Private job baru berhasil bila status `done`, output berukuran positif, dan `download_available: true`. Hasil tidak tersedia menampilkan penjelasan tanpa download sukses palsu. Guest baru menampilkan hasil setelah menerima binary berkas yang tidak kosong.
- Panel hasil menampilkan ukuran aktual, action download, serta status saved/temporary/quota. Download hanya menyatakan unduhan dimulai; aplikasi tidak mengklaim berkas sudah tersimpan di perangkat. Tidak dibuat halaman HTTP 200 khusus.

Acceptance criteria: uji respons selesai, accepted, gagal, malformed, job pending/done tanpa output, dan output siap. Toast tidak memblokir halaman atau mengambil fokus; konfirmasi penting tetap terlihat di halaman. Verifikasi UI memakai data sintetis tanpa mengubah akun/dokumen pengguna.

## 6. Non-Functional Requirements

### Halaman error tahap awal

Tersedia halaman 404 untuk URL tidak dikenal, 403 untuk akses halaman privat yang tidak diizinkan, 500 untuk render error tak terduga, dan 503 untuk layanan tidak tersedia saat memeriksa sesi. Pesan memakai bahasa Indonesia, tidak menampilkan raw exception, dan menyediakan navigasi aman serta retry yang relevan. Retry halaman hanya mengulang pembacaan/rendering, bukan mengirim ulang upload atau processing job.

401 tetap memakai refresh session lalu login bila sesi tidak valid. Kegagalan jaringan tidak menghapus profil/cookies atau dialihkan ke login seolah credentials salah. Ketidaksesuaian role menampilkan 403 tanpa memasang isi halaman privat. Onboarding tetap mengikuti alur yang ada. Error form/aksi seperti 400/413/422/429 serta halaman 504 khusus berada di luar tahap ini.

URL bantuan `/akses-ditolak` dan `/layanan-tidak-tersedia` menyediakan tampilan error publik. Status tersebut pada UI bukan penggantian HTTP status dari API; error yang terjadi setelah client navigation/streaming tidak dapat mengubah status HTTP dokumen yang sudah terkirim.

Kontrol keamanan pendukung dijelaskan di [security.md](security.md).

| ID | Aspek | Kebutuhan dan batas yang berlaku |
| --- | --- | --- |
| NFR-01 | Security dan privacy | Otorisasi kepemilikan berlaku untuk read, preview, download, process, mutation, save, delete, dan tautan agenda. Admin tidak memiliki content bypass. Cookie mutations memerlukan CSRF; sesi yang dicabut tidak dapat mengakses resource pribadi. |
| NFR-02 | Data integrity | Semua layar membaca data API/database yang sebenarnya. Data kosong menampilkan empty state; kegagalan menampilkan error. Tidak ada dummy account, agenda, customer, metrik, atau fallback activity dalam aplikasi lokal. |
| NFR-03 | Document fidelity | Output wajib tersedia dan tidak kosong. Slide/objek PPTX dipertahankan; hasil yang gagal verifikasi menggunakan sumber asli. Output parsial dari job belum selesai tidak dapat diunduh. |
| NFR-04 | Resource limits | Satu backend per database, tiga execution slots, default maksimum dua job pending/processing per akun dan dua belas global, rate limits, batas request/file/page/image/archive, serta pemeriksaan free disk diterapkan. |
| NFR-05 | Reliability | Engine CPU berjalan dalam disposable Python processes. Timeout/cancellation menghentikan proses sebelum cleanup. Windows memakai Job Objects; Linux memakai process groups. |
| NFR-06 | Recovery | Restart menandai proses terputus sebagai gagal; saved documents dipertahankan dan unsaved working files memperoleh TTL. Tidak ada automatic resume, retry terdistribusi, atau durable queue. |
| NFR-07 | Usability | Tersedia loading, error, empty state, dan status hasil. Layout mendukung desktop/mobile serta alternatif selected-date untuk interaksi kalender keyboard/touch. Validasi browser melengkapi validasi backend. |
| NFR-08 | Observability | Status proses dan audit menggunakan metadata yang diizinkan dan kode kegagalan yang aman. Secret dan raw token tidak masuk JSON response atau log aktivitas. Penghapusan filesystem dan database commit tetap memiliki batas transaksi fisik. |
| NFR-09 | Maintainability | Frontend memakai Next.js/React/TypeScript; backend memakai FastAPI, SQLAlchemy, PostgreSQL, dan Alembic. Otorisasi, lifecycle job, validasi, transport sesi, serta perhitungan storage dipusatkan dalam modul bersama. |
| NFR-10 | Test isolation | Integration tests menggunakan disposable PostgreSQL database dan temporary storage melalui `run_tests.py`. Fixtures tidak mengisi database aplikasi. Verifikasi rilis mencakup browser/accessibility, load, disk-full, Linux process-group, dan production deployment; status penyelesaiannya dicatat pada task.md. |

Gap yang diketahui dari inspeksi: error status job milik owner belum seluruhnya memakai pesan yang disanitasi, timestamp API belum seragam menyertakan offset, redaksi log operasional belum dibuktikan aman, dan cleanup sebelum job committed serta deadline seluruh pipeline Guest belum menyeluruh. Requirement keamanan, reliability, dan observability tetap berlaku; tindak lanjutnya tercatat di [task.md](task.md), bukan dianggap selesai berdasarkan kebutuhan tertulis.

## 7. Scope

### In scope — baseline lokal

Scope aktif mencakup lima document tools publik dan privat, autentikasi email/password, verifikasi/reset lokal, onboarding, dokumen/folder, kuota, pemrosesan sumber tersimpan, history/audit, tugas/event/kategori, kalender, in-app reminders, serta console Admin yang dibatasi privacy.

Kompresi Seimbang PPTX hingga batas unggah 200 MB termasuk scope aktif. Produk tidak menjanjikan persentase pengurangan tetap.

Baseline lokal ini menjadi acuan pemecahan pekerjaan. Fase MVP atau rilis berikutnya tidak boleh memasukkan fitur deferred tanpa keputusan scope baru.

### Out of scope / deferred

Google OAuth, Brevo, Turnstile, email/push scheduler, recurring tasks/events, nested folders, version history, trash/recovery, document sharing, team workspace, billing, distributed queue, dan automatic retry/resume belum diimplementasikan.

OCR dan template management telah dikeluarkan dari scope aktif. Historical migrations dan tabel legacy dipertahankan untuk kompatibilitas data. Production readiness, SLA produksi, serta kelulusan pengujian yang belum dijalankan tidak termasuk klaim baseline ini.
