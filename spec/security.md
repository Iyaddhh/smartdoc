# SmartDoc - Keamanan Aplikasi

Diperbarui: 6 November 2026. Dokumen ini menjadi acuan kontrol keamanan, batas kepercayaan, penanganan data sensitif, dan persyaratan deployment SmartDoc. Kebutuhan produk berada di [PRD](PRD.md), susunan modul di [ARCHITECTURE](ARCHITECTURE.md), dan pekerjaan yang belum selesai di [task.md](task.md). Dokumen ini bukan laporan penetration test atau pernyataan production-ready.

## Aset dan batas kepercayaan

Aset yang dilindungi meliputi isi dokumen, preview dan hasil pemrosesan, agenda pribadi, credentials, session tokens, serta metadata akun. Browser dan seluruh file upload dianggap input yang tidak dipercaya. Frontend guards membantu navigasi; keputusan akses tetap dilakukan backend.

| Batas akses | Ketentuan |
| --- | --- |
| Guest ke document tools | Akses publik dengan rate limits, validasi input, dan pembatasan resource; tanpa riwayat akun |
| User ke workspace | Hanya dokumen, folder, agenda, kategori, dan job milik sendiri |
| Admin ke console | Pengelolaan akun dan metadata operasional yang diizinkan; tanpa content bypass |
| Backend ke filesystem dan engine | Path harus berada dalam storage yang diizinkan; input divalidasi sebelum diproses |
| Operator infrastruktur | Hak OS/database terpisah dari role Admin aplikasi; pembatasannya menjadi tanggung jawab deployment |

## Autentikasi dan sesi

- Password disimpan menggunakan bcrypt melalui `app/core/security.py`. Password dan raw token tidak boleh ditampilkan melalui API administrasi atau log aktivitas.
- Access JWT diverifikasi menggunakan algoritma yang ditentukan server. Backend memeriksa akun aktif, role terkini, token version, dan status sesi; claim role saja tidak menjadi dasar izin.
- Access JWT memakai HS256 dengan required claims `exp`, `iat`, `sub`, `ver`, `sid`, `iss`, `aud`, dan `token_use=access`; issuer `smartdoc`, audience `smartdoc-api`. Subject/session harus UUID valid, token_version integer nonnegatif. Cookie dan Bearer sama-sama memerlukan sesi database milik akun yang aktif, verified, belum dicabut, dan belum kedaluwarsa. JWT lama tanpa session binding ditolak; client internal tidak memperoleh bypass.
- Browser memakai HttpOnly access/refresh cookies. Refresh token disimpan sebagai hash, dirotasi secara atomik, dan memiliki absolute expiry. Penggunaan ulang token yang dicabut membatalkan sesi akun.
- Reset password mencabut seluruh sesi akun; scope logout dijelaskan di bawah. Link verifikasi/reset sekali pakai disimpan sebagai hash dan memiliki expiry.
- Logout seluruh perangkat memerlukan refresh token yang dikenal dan belum expired, termasuk row revoked akibat rotation. Cookie invalid/expired/tidak ada hanya menghasilkan browser cleanup dengan scope eksplisit; tidak mengklaim pencabutan akun. Seluruh jalur issuance/revocation mengambil account lock sebelum session/action-token lock. Replay refresh tetap mencabut seluruh sesi.
- Refresh token yang sudah expired ditolak sebelum pemeriksaan replay yang dapat mencabut sesi. Token historis yang sudah lewat absolute expiry tidak boleh membatalkan login baru. Production startup wajib menolak konfigurasi cookies non-Secure; pengujian browser HTTPS tetap menjadi release check tersendiri.
- Provisioning CLI `--update` mengikuti account lock dan mencabut seluruh sesi saat mengganti password/role. Refresh token lama tidak boleh memulihkan akses sesudah perubahan credentials oleh operator.
- Registrasi publik hanya membuat User. Admin dibuat melalui provisioning CLI eksplisit; field role dari registrasi tidak boleh memberi hak Admin.
- Raw authentication tokens tidak disimpan di localStorage. CSRF cookie dapat dibaca client untuk dikirim melalui header; cookie tersebut berbeda dari access/refresh token.

Implementasi utama: `app/core/security.py`, `app/core/auth_cookies.py`, `app/services/auth_sessions.py`, dan `app/api/auth.py` pada backend; `lib/session.ts` pada frontend.

## CSRF, cookies, dan origin

Cookie mutations memerlukan signed CSRF token yang terikat pada sesi. Login dan registrasi memakai pre-session binding. Backend membandingkan header dan cookie dengan signature yang diharapkan, serta memeriksa Origin bila tersedia terhadap origin yang diizinkan.

Default development memakai `SameSite=lax` dan `AUTH_COOKIE_SECURE=false` agar HTTP lokal dapat digunakan. Deployment HTTPS harus mengaktifkan `AUTH_COOKIE_SECURE=true` dan membatasi CORS pada origin frontend yang benar. Konfigurasi menolak `SameSite=none` tanpa Secure. Cookie domain kosong secara default; perubahan domain perlu mempertimbangkan cakupan akses subdomain.

API menggunakan `Cache-Control: no-store`. CORS dan navigation guards tidak menggantikan autentikasi, CSRF, atau ownership checks.

## Otorisasi dan privacy

Halaman error frontend tidak menerima raw exception atau target redirect dari query pengguna. Role mismatch menampilkan 403 tanpa merender private children; data/API tetap diperiksa backend. 401 tetap mengikuti session refresh dan login, sedangkan gangguan koneksi mempertahankan cookies/profile untuk retry. Shared global fallback dapat dirender tanpa auth context dan tidak mencatat atau menampilkan token/path/stack trace. Retry tidak mengulang mutation atau job pemrosesan.

`app/services/document_policy.py` memusatkan pemeriksaan kepemilikan untuk list, detail, preview, download, mutation, saved-source processing, dan status job. Dokumen yang ditautkan ke agenda harus milik akun yang sama. Batch delete memvalidasi seluruh owner sebelum penghapusan; batch download hanya menyertakan hasil milik sendiri yang tersedia.

Respons Admin memakai allowlist metadata. Isi dokumen/agenda, preview, download, password hashes, session tokens, raw engine errors, dan filesystem paths tidak menjadi data console. Session revocation dan status akun diperiksa sebelum akses resource privat.

## Upload dan pemrosesan dokumen

Ancaman yang perlu dibatasi mencakup file malformed, path traversal, decompression bomb, konsumsi CPU/memory/disk berlebihan, dan kebocoran hasil lintas akun.

- Backend memvalidasi format/signature, ukuran, dimensi gambar, halaman PDF, dan struktur Office archive. Validasi browser hanya memberi feedback awal.
- PPTX memiliki batas upload 200 MB, request 202 MB, 20.000 komponen internal, total dekompresi 512 MB, dan maksimum 200 MB per komponen. Batas rasio kompresi juga diterapkan. Komponen duplikat ditolak; batas komponen bukan batas jumlah slide.
- Path filesystem diperiksa setelah resolution terhadap storage root. Nama file atau ID dari client tidak menjadi izin untuk membaca path sembarang.
- Rate limits, admission limits, execution slots, free-disk checks, serta timeout/cancellation membatasi pekerjaan. Engine CPU dijalankan pada disposable processes dan dihentikan sebelum cleanup.
- Process isolation untuk lifecycle tidak sama dengan OS sandbox terhadap dokumen berbahaya. Dokumentasi ini tidak mengklaim antivirus scanning atau isolasi engine dengan hak OS terpisah telah tersedia.
- Preservasi PPTX memeriksa struktur dan hash komponen. Mode `balanced` dapat mengubah warna/detail gambar; pemeriksaan integritas tidak menyatakan file bebas malware.
- Staging PPTX dan saved-source snapshot memakai chunk/spooling terbatas; optimasi gambar mempunyai budget pixel/encoded bytes dan melewati gambar besar tanpa menghapusnya. CRC sumber diperiksa sebelum fallback; output sementara hanya dipublikasikan setelah validasi archive dan integritas. Error/cancellation/commit failure membersihkan berkas baru milik operasi; ownership dan sumber tersimpan tetap dipertahankan.

Implementasi utama: `app/core/validators.py`, `app/core/storage.py`, `app/core/workers.py`, `app/services/job_admission.py`, dan `app/services/compressor/office.py`. Nilai konfigurasi operasional tersedia di [README](README.md#konfigurasi-pemrosesan).

## Penyimpanan, retensi, dan log

Guest files memakai direktori sementara per request dan dibersihkan setelah respons/kegagalan; startup menangani crash leftovers. Saved documents mengikuti kuota akun, sedangkan unsaved results memiliki TTL. Output yang belum selesai tidak boleh diunduh. Penghapusan file mempertahankan activity history yang diizinkan.

Document activity dan Admin audit hanya menyimpan metadata yang diperlukan. Log aktivitas bukan external tamper-proof compliance log dan belum mencakup seluruh read/download, denied requests, atau kegagalan infrastruktur. Penghapusan filesystem dan database commit merupakan operasi fisik terpisah.

Secrets berada di environment backend, tidak dalam Git, frontend public environment, contoh output, atau log. Local email inbox memuat link sensitif, hanya digunakan pada development melalui loopback, dan direktori `.local-mail` diabaikan Git. Tidak ada klaim encryption at rest untuk seluruh storage; proteksi disk/database/backup perlu ditetapkan pada deployment.

Runtime directories `storage/work`, `storage/results`, padanannya pada backend native, serta `storage/manual-compression` diabaikan Git. Dokumen pribadi, hasil manual, dan partial output tetap berada lokal dan tidak menjadi source project saat commit/push.

## Persyaratan deployment dan pemeriksaan keamanan

### Batas implementasi yang ditemukan dari kode

| Area | Kondisi aktual dan tindak lanjut |
| --- | --- |
| Error job | `fail_job` menyimpan `str(error)` dalam `jobs.error`; `/api/jobs/{job_id}` mengirimnya ke owner. Console Admin dan document activity memakai kode aman. Sanitasi jalur owner masih perlu dituntaskan. |
| Log operasional | Loguru file handler memakai `backtrace=True` dan `diagnose=True`; sejumlah engine mencatat path/error internal. Exception handler menampilkan raw error pada environment development. Redaksi secrets dan isi lokal belum boleh dianggap terjamin. |
| Email | Local transport dibatasi development; SMTP memakai `smtplib.SMTP` tanpa login atau STARTTLS. Integrasi SMTP relay aman dan pembatasan jaringan perlu disiapkan sebelum email production. |
| Backend deployment | Dockerfile menjalankan backend sebagai non-root, tetapi engine berbagi hak OS/container yang sama. Bind mount storage/log harus memiliki permission yang sesuai. |
| Proxy dan rate limit | `TRUST_PROXY` dideklarasikan, tetapi limiter mengambil alamat request tanpa membaca setting tersebut. SlowAPI memakai storage default tanpa konfigurasi shared backend; validasi identitas client di deployment reverse proxy masih diperlukan. |
| Staging dan cleanup | Input privat berada pada `work`, hasil pada `results`. Cleanup sebelum job committed belum menyeluruh pada compressor/watermark/splitter; generic cleanup hanya menyapu temp. Pastikan perbaikan T-064 mempertahankan sumber saved dan menutup kegagalan sebelum record dibuat. |
| Timeout pipeline Guest | Timeout engine tidak menjadi deadline global seluruh pipeline. Beberapa konversi berurutan dapat melebihi proxy timeout; T-065 menetapkan deadline serta cancellation/cleanup yang konsisten. |

Temuan ini berasal dari inspeksi source, bukan bukti exploit atau security scan. Tindak lanjut dicatat pada [task.md](task.md). Requirement melarang kebocoran informasi tetap menjadi target, meskipun implementasi belum memenuhi seluruhnya.

Sebelum rilis, operator perlu menyediakan HTTPS, Secure cookies, secret unik yang kuat, origin allowlist, pembatasan akses database/storage, dan prosedur backup/restore. Validator production menolak JWT secret default atau terlalu pendek; pemeriksaan tersebut tidak menggantikan pengelolaan secret dan rotasi saat terjadi kebocoran.

Dependency checks, browser session/CSRF checks, akses lintas akun, file malformed, resource exhaustion, Linux process cleanup, dan konfigurasi production harus diverifikasi pada environment rilis. Status pekerjaan tersebut mengikuti milestone 8 pada [task.md](task.md). Milestone auth telah diverifikasi dalam full backend suite 248 cases pada PostgreSQL sementara, termasuk policy sesi/ownership, JWT claims, replay, dan race lifecycle. Frontend terbaru mencatat 24 tests serta browser error/recovery dengan API sintetis. HTTPS scheme/flags diuji dengan ASGITransport, bukan browser/TLS production. Hasil tersebut tidak menggantikan security scan atau penetration test.

## Penanganan temuan keamanan

Saat ditemukan masalah, catat komponen terdampak, prasyarat, dampak, serta langkah reproduksi dengan data sintetis. Hindari mencantumkan dokumen pengguna, credentials, atau token aktif. Buat task perbaikan dengan kriteria verifikasi yang jelas.

Jika terjadi kebocoran credentials atau sesi, cabut akses yang terdampak dan lakukan rotasi secret sesuai cakupan insiden. Simpan bukti yang sudah disanitasi, perbaiki penyebab, lalu verifikasi akses dan integritas data sebelum memulihkan layanan. Kontak pelaporan dan penanggung jawab insiden belum ditetapkan dalam proyek ini.
