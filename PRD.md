# SmartDoc — Product Requirements Document

Struktur dan kontrak endpoint aktif: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

| | |
|---|---|
| **Versi** | 1.4.0 |
| **Status** | Active / Implemented |
| **Tanggal Terakhir Diperbarui** | 22 September 2026 |
| **Fase** | Production-Ready — Multi-Tenancy, RBAC, Rate Limiting, High-Performance Pool & Document Pagination |
| **Tech Stack** | Next.js 16.3 · FastAPI (Python 3.11) · PostgreSQL 16 · Docker Compose |

> Dokumen ini merupakan panduan spesifikasi teknis dan fungsional produk **SmartDoc** terkini yang merefleksikan seluruh fitur, arsitektur, skema database, isolasi data pengguna (multi-tenancy), kontrol akses berbasis peran (RBAC), aturan validasi, dan paginasi yang **telah terimplementasi di dalam codebase** per 22 September 2026.

> **Pembaruan arah produk (28 Oktober 2026):** OCR dan manajemen template telah dihapus dari aplikasi. Rincian OCR/template di bawah merupakan catatan arsitektur lama dan bukan lagi spesifikasi fitur aktif. Tabel dan kolom lama tetap dipertahankan pada database yang sudah ada agar data tidak terhapus otomatis.

---

## 1. Gambaran Umum Produk

### 1.1 Visi
**SmartDoc** adalah platform manajemen dan rekayasa dokumen terpadu berbasis web yang dirancang untuk kebutuhan personal maupun tim/institusi. Sistem ini menyediakan konversi multi-arah antar-format dokumen, kompresi berkas cerdas, pemisahan (*split*), penggabungan (*merge*), pemberian tanda air (*watermark*) & enkripsi proteksi, manajemen template formulir berbasis OCR, serta riwayat arsip dokumen privat per pengguna dengan paginasi modern.

### 1.2 Pernyataan Masalah & Solusi

| Masalah Lapangan | Solusi SmartDoc |
|---|---|
| Konversi format dokumen manual dan terpisah-pisah | **Document Converter** terpadu untuk Office ke PDF, PDF ke Gambar, Multi-Image ke PDF |
| Ukuran file dokumen terlalu besar untuk lampiran email/portal | **File Compressor** cerdas untuk PDF, JPG, PNG, DOCX, XLSX, PPTX |
| Penggabungan dan pemotongan halaman PDF butuh tools berbayar | **Document Merger & Splitter** visual interaktif per-halaman dengan thumbnail |
| Dokumen rahasia/draft mudah disalahgunakan tanpa identitas | **Watermark & Protection** teks kustom + enkripsi password PDF |
| Pengelolaan template formulir fisik untuk digitalisasi data | **Template Engine** berbasis koordinat ternormalisasi khusus Admin (RBAC) |
| Akses tidak terotorisasi ke sistem pemrosesan dokumen | **Autentikasi JWT & RBAC** penuh dengan register, login, role guard (`user` vs `admin`), dan proteksi rate limiting |
| Dokumen pengguna lain dapat terlihat (kebocoran privasi) | **Multi-Tenancy & Data Isolation** ketat: pengguna hanya dapat melihat dan memproses berkas miliknya sendiri |
| Dokumen berserakan tanpa navigasi riwayat yang efisien | **Riwayat Dokumen** terpusat dengan paginasi server-side (minimal 10), pencarian full-text nama berkas, filter kategori, rename, dan batch actions |

---

## 2. Fitur Lengkap Produk

### 2.1 Autentikasi, Multi-Tenancy & RBAC (Role-Based Access Control)

- **Register & Rate Limiting**: Pengguna baru mendaftar dengan username (3–50 karakter), email valid, dan password minimal 8 karakter. Diproteksi rate limiter `@limiter.limit("5/minute")`.
- **Login & Brute-Force Protection**: Login via form OAuth2 (`OAuth2PasswordRequestForm`). Diproteksi rate limiter `@limiter.limit("15/minute")` untuk mencegah serangan brute force. Mengembalikan JWT Bearer Token (HS256) dengan masa berlaku 7 hari.
- **Role-Based Access Control (RBAC)**:
  - Role tersimpan di kolom `users.role` (`user` atau `admin`).
  - Token JWT menyertakan claim: `{ sub: user_id, username, role, exp }`.
  - Dependency backend `require_admin` memproteksi endpoint mutasi template (`POST`, `PUT`, `DELETE /api/templates`), merespon HTTP 403 Forbidden untuk akun non-admin.
  - Sidebar frontend secara kondisional hanya menampilkan menu navigasi **"Manajemen Template"** untuk user bertipe `admin` dan menampilkan badge status "Admin".
- **Multi-Tenancy & Data Isolation**:
  - Kolom `user_id` pada tabel `documents` memastikan kepemilikan dokumen terisolasi penuh.
  - Seluruh query dokumen menerapkan helper `_get_user_doc` (`Document.user_id == current_user.id`), mencegah celah IDOR (Insecure Direct Object Reference).
  - Setiap eksekusi proses berkas (converter, compressor, splitter, merger, watermark) otomatis mengikat berkas output ke user yang sedang aktif.

### 2.2 Document Converter
- **Format yang Didukung**:
  - `.docx` → `.pdf` (LibreOffice headless)
  - `.xlsx` → `.pdf` (LibreOffice headless, semua sheet)
  - `.pptx` → `.pdf` (LibreOffice headless, semua slide)
  - `.pdf` → `.docx` (pdf2docx, format terjaga)
  - `.pdf` → `.jpg` / `.png` (Poppler/pdf2image)
  - `.jpg` / `.png` → `.pdf` (Pillow, single atau multi-image)
- **Multi-Image to PDF**: Upload banyak gambar sekaligus (maks. 50 gambar, maks. 12 MB/file, total maks. 35 MB) dengan judul kustom.
- **Output Kondisional**: 1 halaman PDF → 1 berkas gambar; lebih dari 1 halaman → arsip `.zip`.

### 2.3 File Compressor
- **Format yang Didukung**: `.pdf`, `.jpg`, `.jpeg`, `.png`, `.docx`, `.xlsx`, `.pptx`.
- **Engine Kompresi**: Ghostscript (`/ebook`, DPI 150) untuk PDF, Pillow re-encoding untuk gambar, dan dekompresi/downsampling/re-kompresi gambar internal untuk format Office.
- **Perlindungan Kualitas**: Jika hasil kompresi lebih besar dari berkas asli, berkas asli dipertahankan.

### 2.4 Document Merger (Penggabung Dokumen)
- **Format Input**: `.pdf`, `.docx`, `.xlsx`, `.pptx`, `.jpg`, `.jpeg`, `.png`.
- **Mode Penggabungan**:
  - `sequence`: Penggabungan berurutan sesuai daftar file input.
  - `insert`: Penyisipan dokumen ke dalam dokumen utama (posisi `start`, `end`, atau `custom` setelah halaman N).
- File non-PDF dikonversi sementara ke format PDF via LibreOffice sebelum proses merger.

### 2.5 Document Splitter (Pemisah Dokumen)
- **Format Input**: `.pdf`, `.docx` (didahului konversi sementara).
- **Galeri Thumbnail**: Endpoint `POST /api/splitter/info` menyediakan thumbnail visual base64 per halaman.
- **3 Mode Pemisahan**:
  1. `extract_range`: Pemisahan berdasarkan ekspresi rentang (misal `1-3, 5, 8-10`).
  2. `fixed_interval`: Pemotongan berkala setiap N halaman menjadi file ZIP.
  3. `all_single`: Pemisahan setiap halaman menjadi file PDF tersendiri dalam arsip ZIP.

### 2.6 Watermark & Protection
- **Format Input**: `.pdf`, `.docx`.
- **Watermark Teks**: Teks kustom dengan pengaturan rotasi sudut, transparansi (opacity), ukuran font, dan warna hex.
- **Enkripsi Sandi**: Proteksi pembukaan dokumen PDF dengan algoritma enkripsi password standar.

### 2.7 Template Engine & OCR (Admin Restricted)
- **Akses Khusus Admin**: Hanya dapat diakses oleh user dengan role `admin`.
- **Struktur Template**: File `.docx` dengan tag Jinja `{{field}}` dan koordinat zona ternormalisasi `{x_norm, y_norm, w_norm, h_norm}` (0.0–1.0).
- **Versioning & Soft Delete**: Setiap upload berkas baru menaikkan versi template; penghapusan bersifat soft delete (`is_active = false`).

### 2.8 Riwayat Dokumen & Paginasi Lanjutan (Document History)
- **Paginasi Server-Side**:
  - Jumlah tampilan baris minimal dan default adalah **10 dokumen per halaman** (`limit=10`).
  - Pilihan per halaman yang fleksibel: **10**, **20**, **50**, dan **100** dokumen.
  - Menghitung agregat `total_items` dan `total_pages` secara dinamis.
- **Pencarian Nama Berkas Server-Side**:
  - Parameter `search` dengan pencarian case-insensitive (`ilike`) pada nama kustom (`custom_name`) dan nama asli (`original_file`) di seluruh arsip database.
  - Dilengkapi *debounce* 300ms pada antarmuka frontend untuk kenyamanan pengetikan.
- **Navigasi UI Lengkap**:
  - Label status: *"Menampilkan X–Y dari Z dokumen"*.
  - Tombol navigasi: Pertama (`<<`), Sebelumnya (`<`), nomor halaman dengan sistem *smart ellipsis* (`1 ... 4 5 6 ... 10`), Berikutnya (`>`), dan Terakhir (`>>`).
- **Operasi Massal & Keamanan**:
  - Batch Download: Berkas ZIP dikemas di thread pool (`asyncio.to_thread`) untuk mencegah blocking.
  - Batch Delete: Menghapus berkas dan rekaman database secara bersamaan.
  - Preview & Download: Dilindungi verifikasi kepemilikan dan *path traversal guard*.

---

## 3. Arsitektur Teknis & Infrastruktur

### 3.1 Stack Teknologi Terpasang

- **Frontend**: Next.js 16.3.1 (App Router), React 19.2.8, TypeScript, Tailwind CSS v4, Lucide React, Konva (Canvas Preview).
- **Backend**: FastAPI 0.110.0, Uvicorn 0.28.0, SQLAlchemy 2.0.28 (Async), asyncpg 0.29.0, SlowAPI 0.1.9 (Rate Limiter), Alembic 1.13.1, Pydantic v2, Loguru.
- **Database**: PostgreSQL 16 Alpine dengan Async Connection Pooling (`pool_size=10, max_overflow=20, pool_pre_ping=True, pool_recycle=1800`).
- **Processing Engines**: LibreOffice Headless, Poppler (pdf2image), pypdf 4.1.0, pdf2docx 0.5.8, Pillow 10.2.0, python-docx 1.1.0, docxtpl 0.16.8, openpyxl 3.1.2, python-pptx 0.6.23, filetype 1.2.0.
- **Timezone Helper**: Standardisasi naive UTC datetime via `utc_now()` pada `app/core/datetime_utils.py` untuk kompatibilitas penuh dengan tipe PostgreSQL `TIMESTAMP WITHOUT TIME ZONE`.
- **Proxy**: Same-origin relative proxy via Next.js `rewrites()` mengeliminasi kendala CORS dan preflight latency.

### 3.2 Batasan & Aturan Validasi Berkas

| Kategori Parameter | Batas Maksimum | Keterangan |
|---|---|---|
| **File Dokumen (Word/Excel/PPT)** | **35 MB** | Validasi via streaming chunking 1 MB |
| **File PDF** | **35 MB** | Berlaku untuk single file dan total multi-image |
| **File Gambar Satuan** | **12 MB** | Per 1 file gambar |
| **Total Multi-Gambar** | **35 MB** | Akumulasi konversi gambar ke PDF |
| **Dimensi Gambar Maksimum** | **10.000 x 10.000 px** | Mencegah exhaustion RAM |
| **Halaman PDF & Multi-Gambar** | **50 halaman/gambar** | Menjaga stabilitas CPU |
| **Concurrency Background Jobs** | **Maks. 3 job bersamaan** | `job_semaphore = asyncio.Semaphore(3)` |
| **Concurrency LibreOffice** | **Maks. 1 proses bersamaan** | `libreoffice_semaphore = asyncio.Semaphore(1)` |
| **Rate Limit Register** | **5 request / menit** | `@limiter.limit("5/minute")` |
| **Rate Limit Login** | **15 request / menit** | `@limiter.limit("15/minute")` |
| **Timeout Pemrosesan Job** | **300 detik (5 menit)** | `asyncio.wait_for(timeout=300)` |
| **Token JWT Expiry** | **7 hari** | `ACCESS_TOKEN_EXPIRE_MINUTES = 10080` |

---

## 4. Skema Database PostgreSQL

### 4.1 Tabel `users`
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'user' NOT NULL,  -- 'user' atau 'admin'
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);
```

### 4.2 Tabel `templates`
```sql
CREATE TABLE templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    version INTEGER DEFAULT 1 NOT NULL,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    thumbnail VARCHAR(500),
    fields JSONB NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);
```

### 4.3 Tabel `documents`
```sql
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,  -- Multi-tenancy
    template_id UUID REFERENCES templates(id) ON DELETE SET NULL,
    template_version INTEGER,
    feature VARCHAR(50) NOT NULL,
    custom_name VARCHAR(255),
    original_file VARCHAR(500) NOT NULL,
    output_file VARCHAR(500),
    output_docx VARCHAR(500),
    output_pdf VARCHAR(500),
    extracted_fields JSONB,
    confidence_score FLOAT,
    original_size BIGINT NOT NULL,
    output_size BIGINT,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);
CREATE INDEX idx_documents_created_at ON documents(created_at);
CREATE INDEX idx_documents_feature ON documents(feature);
CREATE INDEX idx_documents_user_id ON documents(user_id);
```

### 4.4 Tabel `jobs`
```sql
CREATE TABLE jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    feature VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    progress INTEGER DEFAULT 0,
    error TEXT,
    started_at TIMESTAMP WITHOUT TIME ZONE,
    finished_at TIMESTAMP WITHOUT TIME ZONE,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);
CREATE INDEX idx_jobs_document_id ON jobs(document_id);
CREATE INDEX idx_jobs_status ON jobs(status);
```

### 4.5 Riwayat Migrasi Alembic
- `001_initial_schema.py`: Pembuatan tabel dasar `documents`, `jobs`, `templates`.
- `002_add_users_table.py`: Pembuatan tabel `users`.
- `003_multi_tenancy_and_rbac.py`: Penambahan kolom `role` pada `users` dan kolom `user_id` relasional berindeks pada `documents`.

---

## 5. Katalog Endpoint API Utama

| Modul | Method & Path | Hak Akses | Keterangan & Parameter | HTTP Code |
|---|---|---|---|---|
| **System** | `GET /health` | Public | Health check status server | 200 |
| **System** | `GET /` | Public | Info root & metadata API | 200 |
| **Auth** | `POST /api/auth/register` | Public (Limit 5/m) | Registrasi pengguna baru | 201 |
| **Auth** | `POST /api/auth/login` | Public (Limit 15/m) | Login OAuth2 form → JWT Bearer | 200 |
| **Auth** | `GET /api/auth/me` | Authenticated | Profil user aktif (`id`, `username`, `email`, `role`) | 200 |
| **Jobs** | `GET /api/jobs/{job_id}` | Authenticated | Polling progres background job | 200 |
| **Converter** | `POST /api/converter/process` | Authenticated | Konversi berkas (single/multi-image) | 202 |
| **Compressor** | `POST /api/compressor/process` | Authenticated | Kompresi berkas | 202 |
| **Splitter** | `POST /api/splitter/info` | Authenticated | Info halaman & thumbnail galeri | 200 |
| **Splitter** | `POST /api/splitter/process` | Authenticated | Pemisahan berkas (range/interval/single) | 202 |
| **Merger** | `POST /api/merger/info` | Authenticated | Validasi halaman sebelum merge | 200 |
| **Merger** | `POST /api/merger/process` | Authenticated | Penggabungan berkas (sequence/insert) | 202 |
| **Watermark** | `POST /api/watermark/process` | Authenticated | Watermark teks & enkripsi password | 202 |
| **Documents** | `GET /api/documents` | Authenticated | Riwayat privat: `page`, `limit` (def: 10), `feature`, `search` | 200 |
| **Documents** | `GET /api/documents/{id}` | Owner Only | Detail dokumen spesifik | 200 |
| **Documents** | `GET /api/documents/{id}/preview` | Owner Only | Pratinjau inline PDF/gambar | 200 |
| **Documents** | `GET /api/documents/{id}/download` | Owner Only | Unduh berkas hasil | 200 |
| **Documents** | `PATCH /api/documents/{id}` | Owner Only | Ganti nama berkas | 200 |
| **Documents** | `DELETE /api/documents/{id}` | Owner Only | Hapus dokumen + berkas fisik | 200 |
| **Documents** | `POST /api/documents/batch-delete` | Owner Only | Hapus massal dokumen terpilih | 200 |
| **Documents** | `POST /api/documents/batch-download` | Owner Only | Unduh massal dalam bentuk ZIP | 200 |
| **Documents** | `POST /api/documents/first-page-preview` | Authenticated | Ekstraksi thumbnail halaman pertama | 200 |
| **Templates** | `GET /api/templates` | Authenticated | Daftar template aktif | 200 |
| **Templates** | `GET /api/templates/{id}` | Authenticated | Detail spesifikasi template | 200 |
| **Templates** | `POST /api/templates` | **Admin Only** | Buat template baru | 201 |
| **Templates** | `PUT /api/templates/{id}` | **Admin Only** | Update template & naikkan versi | 200 |
| **Templates** | `DELETE /api/templates/{id}` | **Admin Only** | Soft delete template | 200 |

---

## 6. Status Kualitas & Verifikasi Pengujian

Seluruh pipeline sistem telah diverifikasi secara otomatis melalui rangkaian automated test (22/22 PASSED):
- `tests/test_all_features_e2e.py` (8 tes E2E untuk converter, compressor, splitter, merger, watermark, history, dan error states).
- `tests/test_api_and_core.py` (9 tes unit untuk health check, CORS, magic bytes, exception handler 422, rate limiting 429, limit ukuran berkas, dan validasi dimensi gambar).
- `tests/test_deep_verification.py` (5 tes konkurensi semaphore, non-freezing event loop, anti-zombie subprocess reaping, dan URI LibreOffice Windows).
- Build frontend via Next.js Turbopack (`npm run build`): **100% SUKSES** tanpa error TypeScript pada 14 rute aplikasi.
