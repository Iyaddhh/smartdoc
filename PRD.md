# SmartDoc — Product Requirements Document

| | |
|---|---|
| **Versi** | 1.0.0 |
| **Status** | Draft |
| **Tanggal** | 21 Agustus 2026 |
| **Fase** | MVP — Personal Use |
| **Tech Stack** | Next.js · FastAPI · PostgreSQL · Docker |

> Dokumen ini bersifat rahasia dan hanya untuk keperluan internal.

---

## 1. Gambaran Umum Produk

### 1.1 Visi

SmartDoc adalah sistem manajemen dokumen berbasis web yang dirancang untuk memudahkan pengelolaan, konversi, kompresi, dan digitalisasi dokumen fisik. Sistem ini dimulai sebagai solusi personal dan dirancang dengan arsitektur yang dapat berkembang ke skala enterprise.

### 1.2 Pernyataan Masalah

- Konversi dokumen antar format (Word, PDF, Image) masih dilakukan manual menggunakan tools terpisah
- Dokumen fisik hasil scan sulit untuk diedit karena tidak ada digitalisasi otomatis
- Ukuran file dokumen sering terlalu besar untuk dikirim atau disimpan
- Tidak ada sistem terpusat untuk menyimpan dan mengelola riwayat dokumen

### 1.3 Solusi

SmartDoc menyediakan satu platform terpadu dengan tiga fitur inti:

- **Document Converter** — konversi antar format dokumen secara otomatis
- **File Compressor** — kompres ukuran file secara otomatis tanpa kehilangan kualitas signifikan
- **OCR Template-Based** — scan dokumen fisik dan pindahkan isinya ke template digital yang bisa diedit

### 1.4 Target Pengguna

| Fase | Target Pengguna | Skala | Timeline |
|---|---|---|---|
| MVP | Personal — 1 user | 1 pengguna | Sekarang |
| v1.1 | Tim kecil | 2–10 pengguna | Setelah MVP stabil |
| v2.0 | Enterprise / Perusahaan | Multi-user + role | Roadmap |

### 1.5 Batasan Scope MVP

> MVP difokuskan pada 1 pengguna (personal use). Fitur multi-user, autentikasi penuh, dan enterprise features ditunda ke v2.0.

- Tidak ada sistem login/autentikasi di MVP
- Storage menggunakan local filesystem, bukan cloud
- OCR hanya mendukung form berkotak (zone-based) di MVP
- Tidak ada batch processing di MVP

---

## 2. Fitur Produk

### 2.1 Document Converter

Fitur konversi dokumen antar format secara otomatis. Sistem mendeteksi tipe file input dan menentukan library yang tepat untuk konversi.

| Input Format | Output Format | Library | Keterangan |
|---|---|---|---|
| Word (.docx) | PDF | LibreOffice headless | Preservasi formatting |
| PDF (text-based) | Word (.docx) | pdf2docx | Hanya PDF text-based |
| PDF (scan) | Word (.docx) | OCR Pipeline | Diarahkan ke fitur OCR |
| PDF | Image (.jpg/.png) | pdf2image + Poppler | Per halaman |
| Excel (.xlsx) | PDF | LibreOffice headless | Semua sheet |
| PowerPoint (.pptx) | PDF | LibreOffice headless | Semua slide |
| Image | PDF | Pillow | Single atau multi-page |

### 2.2 File Compressor

Fitur kompresi file otomatis tanpa perlu konfigurasi dari user. Sistem menentukan parameter kompresi optimal per format file.

| Format | Library | Metode Kompresi | Target Penghematan |
|---|---|---|---|
| PDF (banyak gambar) | Ghostscript + pypdf | Downsample gambar embedded | 50–80% |
| PDF (teks saja) | Ghostscript + pypdf | Remove metadata, optimize | 10–30% |
| JPG | Pillow | Re-encode quality 82 | 30–60% |
| PNG | Pillow + pngquant | Quantization + strip metadata | 40–70% |
| Word (.docx) | python-docx + Pillow | Kompres gambar embedded | 40–70% |
| Excel (.xlsx) | openpyxl | Kompres gambar embedded | 40–70% |
| PowerPoint (.pptx) | python-pptx | Kompres gambar per slide | 40–70% |

> **Quality Check:** Jika hasil kompresi lebih besar dari file asli, sistem mengembalikan file asli dan menginformasikan user bahwa file sudah dalam kondisi optimal.

### 2.3 OCR Template-Based (Fitur Utama)

Fitur unggulan SmartDoc. User dapat men-scan dokumen fisik berbentuk form berkotak, lalu sistem secara otomatis mengekstrak teks dari setiap field dan mengisinya ke template digital yang identik. Output berupa file `.docx` yang bisa diedit dan `.pdf` yang siap share.

#### 2.3.1 Konsep Zone-Based Field Extraction

Admin mendefinisikan zona (koordinat) setiap field di template. Untuk memastikan template bersifat resolusi-independen (responsif terhadap berbagai resolusi kamera HP, DPI scanner, dan ukuran canvas UI), koordinat disimpan dalam format **relatif ternormalisasi (0.0 s/d 1.0)** terhadap lebar dan tinggi dokumen. Sistem OCR mengekstrak teks berdasarkan overlap bounding box PaddleOCR dengan zona ternormalisasi yang diskalakan ke dimensi aktual gambar.

> Contoh: Form W-4 memiliki field "First Name" di koordinat relatif `{x_norm: 0.120, y_norm: 0.198, w_norm: 0.310, h_norm: 0.038}`. Pada gambar input berukuran 2000x3000 px, zona target dihitung otomatis menjadi `x = 240, y = 594, w = 620, h = 114 px`. Sistem mengambil teks OCR yang berada di area tersebut lalu mengisi tag template yang bersesuaian.

#### 2.3.2 Input yang Didukung

- Foto dari kamera HP
- Scan dari scanner fisik
- PDF hasil scan
- File gambar (JPG, PNG, JPEG)

#### 2.3.3 Output

- File `.docx` — dapat langsung diedit di Microsoft Word atau Google Docs
- File `.pdf` — siap untuk disimpan atau dikirim
- Kedua file tersedia sekaligus setelah proses selesai

#### 2.3.4 Pre-processing Pipeline

Sebelum OCR, gambar diproses oleh OpenCV untuk meningkatkan akurasi:

- **Deskew** — meluruskan dokumen yang miring saat difoto
- **Denoise** — menghilangkan noise dari foto berkualitas rendah
- **Adaptive Thresholding** — menangani pencahayaan tidak merata pada foto HP
- **Contrast Enhancement** — meningkatkan keterbacaan teks

#### 2.3.5 Confidence Score

Setiap hasil OCR dilengkapi confidence score (0–100%) sebagai indikator akurasi. User dapat mengetahui field mana yang perlu diverifikasi secara manual.

| Kondisi Input | Estimasi Akurasi |
|---|---|
| Scanner fisik, form bersih | 95–99% |
| PDF scan berkualitas baik | 90–97% |
| Foto HP, cahaya cukup, tidak miring | 85–93% |
| Foto HP, miring/shadow/blur | 60–80% |

### 2.4 Document Storage & Management

Semua dokumen yang diproses tersimpan di sistem dan dapat dikelola oleh user.

- Lihat riwayat semua dokumen yang pernah diproses
- Download ulang file hasil konversi/kompresi/OCR kapan saja
- Hapus dokumen yang tidak diperlukan
- Preview dokumen sebelum download
- Rename file output sebelum download

---

## 3. User Flow

### 3.1 Flow Document Converter & Compressor

| Langkah | Aksi User | Respons Sistem |
|---|---|---|
| 1 | Pilih fitur (Converter atau Compressor) | Tampilkan halaman fitur yang dipilih |
| 2 | Upload file dari device | Validasi tipe file, ukuran, dan integritas file |
| 3 | Khusus Converter: pilih format output | Tampilkan format output yang tersedia |
| 4 | Klik proses | Jalankan job di background, tampilkan progress |
| 5 | Tunggu proses selesai | Update progress bar via polling setiap 2 detik |
| 6 | Lihat hasil | Tampilkan info before/after size (compressor) atau file hasil |
| 7 | Rename file (opsional) | User bisa ubah nama file sebelum download |
| 8 | Download file | File terdownload ke device user |

### 3.2 Flow OCR Template-Based (User)

| Langkah | Aksi User | Respons Sistem |
|---|---|---|
| 1 | Buka fitur Scan | Tampilkan daftar template yang tersedia |
| 2 | Pilih template yang sesuai | Tampilkan preview template kosong |
| 3 | Upload scan/foto dokumen | Validasi file, tampilkan preview gambar |
| 4 | Klik proses OCR | Jalankan pipeline OCR di background |
| 5 | Tunggu proses selesai | Update progress bar via polling setiap 2 detik |
| 6 | Review hasil ekstraksi per field | Tampilkan tabel field beserta nilai hasil OCR dan confidence score |
| 7 | Koreksi manual jika diperlukan | User edit field yang nilainya salah |
| 8 | Konfirmasi dan generate output | Sistem generate `.docx` dan `.pdf` |
| 9 | Download `.docx` dan/atau `.pdf` | Kedua file tersedia untuk didownload |

### 3.3 Flow Template Management (Admin)

| Langkah | Aksi Admin | Respons Sistem |
|---|---|---|
| 1 | Buka halaman admin Templates | Tampilkan daftar template yang ada |
| 2 | Klik buat template baru | Tampilkan form pembuatan template |
| 3 | Isi nama dan deskripsi template | Validasi input |
| 4 | Upload contoh dokumen (foto/scan yang sudah diisi) | Tampilkan gambar dokumen di zone editor |
| 5 | Drag & drop kotak di atas setiap field | Tampilkan koordinat zona yang dipilih |
| 6 | Beri nama setiap field | Validasi nama field (unik, tidak ada spasi) |
| 7 | Upload template `.docx` kosong | Validasi file template |
| 8 | Simpan template | Template tersimpan dan siap dipakai user |

---

## 4. Arsitektur Sistem

### 4.1 Gambaran Arsitektur

SmartDoc menggunakan arsitektur client-server dengan tiga komponen utama yang berjalan dalam Docker container:

| Komponen | Teknologi | Port | Fungsi |
|---|---|---|---|
| Frontend | Next.js 14 (App Router) | 3000 | UI pengguna dan admin |
| Backend | FastAPI (Python 3.11) | 8000 | API, business logic, OCR pipeline |
| Database | PostgreSQL 16 | 5432 | Metadata dokumen, template, job tracking |

> Semua komponen berjalan dalam Docker Compose. Cukup satu perintah `docker-compose up` untuk menjalankan seluruh sistem.

### 4.2 Tech Stack Lengkap

| Layer | Teknologi | Keterangan |
|---|---|---|
| Frontend | Next.js 14 (App Router) | Server Components, built-in routing |
| Backend | FastAPI (Python) | Async, auto docs, performa tinggi |
| OCR Engine | PaddleOCR | Akurasi tinggi, support Bahasa Indonesia |
| Pre-processing | OpenCV + Pillow | Deskew, denoise, adaptive threshold |
| Zone Matching | Custom Logic | Bounding box overlap matching |
| Template Filling | python-docx-template | Syntax `{{field}}` di file `.docx` |
| File Converter | LibreOffice headless, pdf2docx, pdf2image | Konversi antar format |
| File Compressor | Ghostscript, pypdf, Pillow, pngquant | Kompresi semua format |
| Zone Editor UI | react-konva | Drag & drop zona field di browser |
| Job Polling | Custom Hook (React) | Polling tiap 2 detik, tanpa WebSocket |
| ORM | SQLAlchemy (async) + Alembic | Database access dan migration |
| Logging | Loguru | Structured logging, auto rotate |
| Container | Docker + Docker Compose | 3 service: FE, BE, DB |

### 4.3 OCR Pipeline Detail

Pipeline OCR terdiri dari 5 tahap yang berjalan secara berurutan sebagai background task:

| Tahap | Komponen | Input | Output |
|---|---|---|---|
| 1. Input Normalization | pdf2image / Pillow | File apapun (foto/scan/PDF) | Array gambar per halaman |
| 2. Pre-processing | OpenCV | Gambar raw | Gambar bersih dan lurus |
| 3. OCR Extraction | PaddleOCR | Gambar terproses | Teks + bounding box tiap teks |
| 4. Zone Field Matching | Custom Logic | Teks + bbox, definisi zona template | Dict `{field: value}` |
| 5. Document Building | python-docx-template + LibreOffice | Dict field values + template `.docx` | File `.docx` + `.pdf` |

### 4.4 Komunikasi Frontend ↔ Backend

Frontend berkomunikasi dengan Backend melalui REST API. Untuk proses yang berjalan di background (OCR, konversi berat), frontend melakukan polling status job setiap 2 detik.

| Method | Endpoint | Fungsi | Payload / Params |
|---|---|---|---|
| POST | `/api/converter/process` | Submit job konversi | Multipart form-data |
| POST | `/api/compressor/process` | Submit job kompresi | Multipart form-data |
| POST | `/api/ocr/process` | Submit job OCR | Multipart form-data |
| GET | `/api/jobs/{job_id}` | Cek status job (polling) | — |
| GET | `/api/documents` | List riwayat dokumen | Query: page, limit |
| GET | `/api/documents/{id}/download` | Download file hasil | Query: format (opsional) |
| PATCH | `/api/documents/{id}` | Update metadata / Rename file | JSON: `{"custom_name": "..."}` |
| DELETE | `/api/documents/{id}` | Hapus dokumen & file fisik | — |
| GET | `/api/templates` | List template tersedia | Query: is_active |
| GET | `/api/templates/{id}` | Detail template & konfigurasi zona | — |
| POST | `/api/templates` | Buat template baru + upload `.docx` (admin) | Multipart form-data |
| PUT | `/api/templates/{id}` | Update metadata & zona template (admin) | JSON / Multipart |
| DELETE | `/api/templates/{id}` | Hapus template (admin) | — |

---

## 5. Database Schema

### 5.1 Tabel `templates`

| Kolom | Tipe | Keterangan |
|---|---|---|
| id | UUID (PK) | Primary key, auto-generated |
| name | VARCHAR(255) | Nama template, contoh: "Form Laporan Bulanan" |
| description | TEXT | Deskripsi opsional template |
| version | INTEGER | Versi template, increment saat ada update |
| is_active | BOOLEAN | Hanya versi aktif yang tampil ke user |
| file_path | VARCHAR(500) | Path ke file `.docx` template kosong |
| thumbnail | VARCHAR(500) | Path ke gambar preview template |
| fields | JSONB | Array definisi field beserta koordinat zona |
| created_at | TIMESTAMP | Waktu pembuatan template |

> Struktur JSONB `fields` (menggunakan koordinat ternormalisasi 0.0–1.0):
> ```json
> [
>   {
>     "key": "nama_lengkap",
>     "label": "Nama Lengkap",
>     "type": "text",
>     "zone": {
>       "x_norm": 0.120,
>       "y_norm": 0.198,
>       "w_norm": 0.310,
>       "h_norm": 0.038
>     }
>   }
> ]
> ```

### 5.2 Tabel `documents`

| Kolom | Tipe | Keterangan |
|---|---|---|
| id | UUID (PK) | Primary key, auto-generated |
| template_id | UUID (FK) | Referensi ke templates (nullable, hanya untuk OCR) |
| template_version | INTEGER | Snapshot versi template saat dokumen dibuat |
| feature | VARCHAR(50) | Fitur yang digunakan: converter/compressor/ocr |
| original_file | VARCHAR(500) | Path ke file asli yang diupload user |
| output_file | VARCHAR(500) | Path ke file hasil (converter/compressor) |
| output_docx | VARCHAR(500) | Path ke file `.docx` hasil OCR |
| output_pdf | VARCHAR(500) | Path ke file `.pdf` hasil OCR |
| extracted_fields | JSONB | Nilai field hasil ekstraksi OCR |
| confidence_score | FLOAT | Rata-rata akurasi OCR (0.0–1.0) |
| original_size | BIGINT | Ukuran file asli dalam bytes |
| output_size | BIGINT | Ukuran file hasil dalam bytes |
| status | VARCHAR(50) | Status: pending/processing/done/failed |
| created_at | TIMESTAMP | Waktu upload/proses |

### 5.3 Tabel `jobs`

| Kolom | Tipe | Keterangan |
|---|---|---|
| id | UUID (PK) | Primary key, auto-generated |
| document_id | UUID (FK) | Referensi ke documents |
| feature | VARCHAR(50) | Fitur yang dijalankan |
| status | VARCHAR(50) | Status: pending/processing/done/failed |
| progress | INTEGER | Persentase progress (0–100) |
| error | TEXT | Pesan error jika status failed (nullable) |
| started_at | TIMESTAMP | Waktu job mulai diproses (nullable) |
| finished_at | TIMESTAMP | Waktu job selesai (nullable) |
| created_at | TIMESTAMP | Waktu job dibuat |

---

## 6. Struktur Project

### 6.1 Monorepo Structure

```
smartdoc/
├── smartdoc-frontend/     # Aplikasi Next.js
├── smartdoc-backend/      # Aplikasi FastAPI
├── storage/                # Penyimpanan file (Docker volume)
├── docker-compose.yml      # Konfigurasi Docker Compose
└── .env                    # Environment variables
```

### 6.2 Frontend Structure (Next.js)

```
app/(user)/dashboard/          # Halaman riwayat dokumen
app/(user)/converter/          # Halaman file converter
app/(user)/compressor/         # Halaman file compressor
app/(user)/scan/               # Halaman OCR template-based
app/(admin)/templates/         # Halaman manajemen template (admin)
components/zone-editor/        # Komponen drag & drop zona (react-konva)
components/file-upload/        # Komponen upload file dengan validasi
components/preview/            # Komponen preview dokumen
lib/api.ts                     # Semua fungsi fetch ke FastAPI
lib/useJobPolling.ts           # Custom hook untuk polling status job
```

### 6.3 Backend Structure (FastAPI)

```
app/api/converter.py                  # Endpoint konversi dokumen
app/api/compressor.py                 # Endpoint kompresi file
app/api/ocr.py                        # Endpoint OCR dan template-based scan
app/api/templates.py                  # Endpoint CRUD template (admin)
app/api/documents.py                  # Endpoint history, download, hapus dokumen
app/api/jobs.py                       # Endpoint cek status job (untuk polling)
app/core/config.py                    # Konfigurasi dari environment variables
app/core/validators.py                # Validasi file (tipe, ukuran, integritas)
app/core/response.py                  # Standard API response structure
app/core/logger.py                    # Setup Loguru logging
app/core/cleanup.py                   # Auto cleanup temporary files
app/services/converter/office.py      # LibreOffice wrapper
app/services/converter/pdf.py         # pdf2docx dan pdf2image
app/services/compressor/pdf.py        # Ghostscript + pypdf compression
app/services/compressor/image.py      # Pillow + pngquant compression
app/services/compressor/office.py     # Kompresi docx, xlsx, pptx
app/services/ocr/preprocessor.py      # OpenCV pre-processing pipeline
app/services/ocr/engine.py            # PaddleOCR wrapper
app/services/ocr/zone_matcher.py      # Zone-based field extraction
app/services/ocr/builder.py           # python-docx-template filler
app/models/template.py                # SQLAlchemy model untuk tabel templates
app/models/document.py                # SQLAlchemy model untuk tabel documents
app/models/job.py                     # SQLAlchemy model untuk tabel jobs
storage/temp/uploads/                 # File sementara saat baru diupload
storage/temp/processing/              # File sementara mid-pipeline
storage/templates/                    # File .docx template kosong
storage/documents/originals/          # File asli yang diupload user
storage/documents/outputs/            # File hasil konversi/kompresi/OCR
logs/                                  # File log aplikasi (auto-rotate)
```

---

## 7. Persyaratan Non-Fungsional

### 7.1 Validasi & Keamanan File

| Aturan | Detail |
|---|---|
| Max file size (default) | 50 MB untuk semua format |
| Max file size PDF | 100 MB (bisa lebih besar) |
| Max file size Image | 20 MB |
| Max halaman PDF | 50 halaman per proses |
| Timeout proses | 5 menit per job |
| Validasi tipe file | Dilakukan di frontend DAN backend (MIME type + file header magic bytes) |
| Validasi Template `.docx` | Inspeksi tag Jinja2 via `docxtpl` (`get_undeclared_template_variables()`); wajib cocok dengan nama field zona |
| File corrupt | Ditolak dengan pesan error yang jelas |
| PDF password-protected | Ditolak dengan instruksi unlock terlebih dahulu |

### 7.2 Format File yang Didukung

| Fitur | Format yang Diterima |
|---|---|
| Converter | .pdf, .docx, .xlsx, .pptx, .jpg, .jpeg, .png |
| Compressor | .pdf, .docx, .xlsx, .pptx, .jpg, .jpeg, .png |
| OCR | .jpg, .jpeg, .png, .pdf (scan) |

### 7.3 Performance

| Metrik | Target |
|---|---|
| Konversi Word → PDF (file normal) | < 10 detik |
| Kompresi PDF (< 10 MB) | < 15 detik |
| OCR 1 halaman (scan bersih) | < 20 detik |
| OCR 1 halaman (foto HP) | < 30 detik |
| Response API (non-background) | < 500ms |
| Polling interval | 2 detik |

### 7.4 Standard API Response

Semua endpoint menggunakan struktur response yang konsisten:

| Field | Tipe | Keterangan |
|---|---|---|
| success | boolean | `true` jika berhasil, `false` jika error |
| data | object \| null | Payload data hasil proses |
| message | string | Pesan deskriptif untuk ditampilkan ke user |
| error | string \| null | Detail error jika `success = false` |

### 7.5 Logging

Sistem menggunakan Loguru untuk structured logging:

- Log level DEBUG untuk development, INFO untuk production
- Auto-rotate file log setiap 10 MB
- Retention log selama 30 hari, dikompresi otomatis
- Setiap job di-log dengan `job_id` untuk traceability
- Error log menyertakan full stack trace

### 7.6 Temporary File Management

| Lokasi | Isi | TTL (Time To Live) |
|---|---|---|
| storage/temp/uploads/ | File mentah saat baru diupload | 24 jam |
| storage/temp/processing/ | File sementara mid-pipeline | Langsung dihapus setelah job selesai |

> Cleanup job berjalan otomatis setiap 1 jam saat aplikasi aktif, menghapus file yang sudah melewati TTL-nya.

---

## 8. Testing Strategy

### 8.1 Kategori Testing

SmartDoc menggunakan pendekatan AI-powered application testing — bukan melatih model dari scratch, melainkan mengevaluasi performa pretrained model terhadap dokumen aktual.

| Tipe Test | Tujuan | Tools |
|---|---|---|
| Smoke Test | Pastikan pipeline tidak error end-to-end | pytest |
| Benchmark Test | Ukur akurasi OCR terhadap dokumen nyata | pytest + rapidfuzz |
| Pre-processing Test | Ukur dampak pre-processing terhadap akurasi | pytest + OpenCV |
| Zone Matching Test | Pastikan field extraction akurat | pytest |
| Converter Test | Validasi semua format konversi | pytest |
| Compressor Test | Validasi hasil kompresi + quality check | pytest |
| API Test | Validasi semua endpoint dan response structure | pytest + httpx |

### 8.2 Metrik Keberhasilan OCR

| Metrik | Target MVP | Cara Ukur |
|---|---|---|
| Akurasi teks (scan bersih) | > 95% | Character accuracy dengan rapidfuzz |
| Akurasi teks (foto HP) | > 85% | Character accuracy dengan rapidfuzz |
| Akurasi zone matching | > 90% | Field hit rate |
| Waktu proses per halaman | < 30 detik | Timer di setiap tahap pipeline |
| False positive field | < 5% | Manual review hasil ekstraksi |

### 8.3 Sample Dataset untuk Testing

Minimal 20 dokumen sample yang beragam harus disiapkan sebelum integrasi OCR ke sistem:

- 5 dokumen — scan scanner fisik, form bersih
- 5 dokumen — foto HP, kondisi cahaya baik
- 5 dokumen — foto HP, kondisi miring atau shadow
- 5 dokumen — PDF scan dari berbagai sumber

> Semakin beragam sample dokumen yang digunakan untuk testing, semakin akurat gambaran performa sistem di kondisi nyata.

---

## 9. Roadmap Pengembangan

### 9.1 MVP — Fokus Saat Ini

| Fitur | Prioritas | Status |
|---|---|---|
| Setup project (Docker, FE, BE, DB) | P0 | Belum mulai |
| File Compressor (semua format, otomatis) | P0 | Belum mulai |
| Document Converter (semua format) | P0 | Belum mulai |
| Template Management (admin zone editor) | P0 | Belum mulai |
| OCR Pipeline + Zone Field Extraction | P0 | Belum mulai |
| Preview & Koreksi Manual Hasil OCR | P0 | Belum mulai |
| Output `.docx` + `.pdf` Otomatis | P0 | Belum mulai |
| History & Download Dokumen | P0 | Belum mulai |
| Job Status Polling | P0 | Belum mulai |
| Error Handling & Validasi File | P0 | Belum mulai |
| Logging (Loguru) | P1 | Belum mulai |
| Preview Dokumen Sebelum Download | P1 | Belum mulai |
| Rename File Output | P1 | Belum mulai |
| Notifikasi Browser Saat Job Selesai | P2 | Belum mulai |

### 9.2 v1.1 — Setelah MVP Stabil

| Fitur | Keterangan |
|---|---|
| Keyword-based OCR Extraction | Support dokumen semi-bebas (surat, laporan) |
| Folder & Organisasi Dokumen | User bisa kategorikan dokumen dalam folder |
| Search by Filename/Template | Pencarian dokumen di riwayat |
| Batch Processing | Upload dan proses banyak file sekaligus |
| File Size Limit per Format | Limit berbeda per tipe file |
| Template Versioning UI | Admin bisa lihat history versi template |

### 9.3 v2.0 — Enterprise Features

| Fitur | Keterangan |
|---|---|
| NLP/NER Free-form Extraction | OCR untuk dokumen bebas tanpa struktur fix |
| Multi-user & Autentikasi Penuh | NextAuth.js + JWT + refresh token |
| Role & Permission | Admin, User, Viewer dengan hak akses berbeda |
| Audit Log | Riwayat semua aktivitas untuk compliance |
| Cloud Storage Migration | Migrasi dari local filesystem ke S3/Cloudflare R2 |
| Task Queue Migration | Migrasi dari BackgroundTasks ke Celery + Redis |

---

## 10. Konfigurasi & Environment

### 10.1 Environment Variables

| Variable | Default | Keterangan |
|---|---|---|
| APP_ENV | development | Environment: development/production |
| DATABASE_URL | — | PostgreSQL connection string |
| SECRET_KEY | — | Secret key aplikasi |
| STORAGE_PATH | ./storage | Path root penyimpanan file |
| MAX_FILE_SIZE_MB | 50 | Batas ukuran file dalam MB |
| TEMP_FILE_TTL_HOURS | 24 | TTL file temporary dalam jam |
| MAX_PDF_PAGES | 50 | Batas jumlah halaman PDF |
| JOB_TIMEOUT_SECONDS | 300 | Timeout proses (5 menit) |
| COMPRESSION_IMAGE_QUALITY | 85 | Kualitas kompresi gambar (0-100) |
| COMPRESSION_IMAGE_DPI | 150 | DPI untuk gambar dalam PDF terkompresi |
| OCR_CONFIDENCE_THRESHOLD | 70 | Minimum confidence score OCR (%) |
| NEXT_PUBLIC_API_URL | http://backend:8000 | URL backend dari frontend |

### 10.2 Docker Compose Services

| Service | Image | Port | Depends On |
|---|---|---|---|
| frontend | Build dari ./smartdoc-frontend | 3000 | backend |
| backend | Build dari ./smartdoc-backend | 8000 | db |
| db | postgres:16-alpine | 5432 | — |

### 10.3 System Dependencies (Backend Dockerfile)

| Dependency | Fungsi |
|---|---|
| libreoffice | Konversi dokumen Office ke PDF dan sebaliknya |
| ghostscript | Kompresi PDF dan manipulasi PDF tingkat lanjut |
| poppler-utils | Dibutuhkan oleh pdf2image untuk konversi PDF ke gambar |
| libgl1-mesa-glx | Dibutuhkan oleh OpenCV untuk image processing |

> **PENTING:** Semua system dependencies di atas harus ada di Dockerfile backend. Ketiadaan salah satu akan menyebabkan fitur terkait gagal berjalan.
