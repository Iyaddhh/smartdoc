# SMARTDOC — Comprehensive System Architecture & Project Documentation

Dokumen ini berisi analisis menyeluruh mengenai arsitektur sistem, alur kerja (workflow), struktur data, relasi basis data (ERD), fungsionalitas modul, mekanisme pemrosesan asinkron, hingga manajemen penyimpanan pada aplikasi **SmartDoc**.

---

## DAFTAR ISI
1. [Ringkasan Eksekutif (Executive Summary)](#1-ringkasan-eksekutif-executive-summary)
2. [Teknologi & Ekosistem (Tech Stack)](#2-teknologi--ekosistem-tech-stack)
3. [Arsitektur Sistem & Alur Global (System Architecture)](#3-arsitektur-sistem--alur-global-system-architecture)
4. [Struktur Data & Relasi Database (Data Model & ERD)](#4-struktur-data--relasi-database-data-model--erd)
5. [Analisis Alur Kerja Fitur (Feature Deep-Dives)](#5-analisis-alur-kerja-fitur-feature-deep-dives)
   - 5.1 [Document Converter](#51-document-converter)
   - 5.2 [File Compressor](#52-file-compressor)
   - 5.3 [Document Splitter](#53-document-splitter)
   - 5.4 [Document Merger](#54-document-merger)
   - 5.5 [Watermark & Security](#55-watermark--security)
   - 5.6 [OCR Template-Based & Template Engine](#56-ocr-template-based--template-engine)
   - 5.7 [Riwayat Dokumen & Operasi Massal (Multi-Select)](#57-riwayat-dokumen--operasi-massal-multi-select)
6. [Mekanisme Pemrosesan Asinkron & Polling (Job Lifecycle)](#6-mekanisme-pemrosesan-asinkron--polling-job-lifecycle)
7. [Manajemen Penyimpanan & File Lifecycle](#7-manajemen-penyimpanan--file-lifecycle)
8. [Katalog Referensi API (API Reference)](#8-katalog-referensi-api-api-reference)
9. [Panduan Instalasi & Eksekusi Lingkungan (Runbook)](#9-panduan-instalasi--eksekusi-lingkungan-runbook)

---

## 1. Ringkasan Eksekutif (Executive Summary)

**SmartDoc** adalah platform manajemen dan transformasi dokumen cerdas yang dirancang untuk mengintegrasikan kebutuhan pengolahan berkas modern dalam satu tempat dengan antarmuka yang elegan, cepat, dan presisi.

### Fitur Utama:
- **Konversi Format Dokumen (Converter)**: Mendukung konversi multi-arah PDF, Word (DOCX), Excel (XLSX), PowerPoint (PPTX), dan Gambar (JPG/PNG). Output kondisional cerdas (1 halaman langsung gambar, multi-halaman menjadi ZIP).
- **Kompresi Dokumen (Compressor)**: Reduksi ukuran file otomatis tanpa mengurangi keterbacaan teks dan struktur grafis.
- **Pemisahan Halaman (Splitter)**: Ekstraksi halaman berdasarkan rentang selektif atau pemecahan interval berkala dengan pratinjau visual resolusi tinggi.
- **Penggabungan Dokumen (Merger)**: Menggabungkan berbagai format file ke dalam 1 file PDF utuh dengan dukungan mode antrean urutan dan mode sisip dokumen.
- **Watermark & Keamanan (Watermark & Security)**: Penyematan cap air teks kustom dan proteksi kata sandi dengan enkripsi PDF standar industri.
- **Digitalisasi Berbasis Template (OCR Template-Based)**: Pemetaan data formulir fisik ke template digital `.docx`.
- **Riwayat Dokumen Terpadu (History)**: Manajemen arsip dengan pencarian langsung, inline rename, serta seleksi massal (Multi-Select) untuk unduh batch ZIP dan hapus batch.

---

## 2. Teknologi & Ekosistem (Tech Stack)

```mermaid
graph TD
    subgraph Client["Frontend Layer (Next.js 14)"]
        UI[User Interface & Layouts]
        UploadComp[FileUpload with Drag & Drop & Realtime Preview]
        ModalComp[ProcessingModal with Dynamic Backdrop]
        HookComp[useJobPolling Hook]
    end

    subgraph Server["Backend Layer (FastAPI)"]
        Router[FastAPI API Routers]
        BGTasks[Background Tasks Engine]
        DBBase[Async SQLAlchemy & AsyncPG]
        CleanEngine[Storage Cleanup Engine]
    end

    subgraph Processing["Processing Engines"]
        LibreOffice[LibreOffice Headless]
        Poppler[Poppler / pdf2image]
        PyPDF[PyPDF & Ghostscript]
        Pillow[Pillow PIL Engine]
        DocxTemplate[python-docx & docxtpl]
    end

    subgraph Database["Data Layer"]
        PG[(PostgreSQL Database)]
        Storage[(Local File Storage System)]
    end

    UI --> Router
    UploadComp --> Router
    HookComp --> Router
    Router --> DBBase
    Router --> BGTasks
    BGTasks --> Processing
    DBBase --> PG
    Processing --> Storage
```

### Detail Komponen Teknologi:
1. **Frontend**:
   - **Framework**: Next.js 14 (App Router Architecture), React 18, TypeScript.
   - **Styling**: Vanilla CSS Design System dengan variabel CSS global (`--color-stone-*`, `--color-cyan-*`, glassmorphism backdrop blur).
   - **Ikonografi**: `lucide-react`.
   - **Komunikasi**: Fetch API Native + Custom Async Client (`/lib/api.ts`).
2. **Backend**:
   - **Framework**: FastAPI (Python 3.11+), ASGI Server (Uvicorn).
   - **Database ORM**: SQLAlchemy 2.0 (Async Session) + `asyncpg` driver.
   - **Konfigurasi & Validasi**: Pydantic Settings (`pydantic-settings`).
   - **Logging**: Loguru dengan rotasi file log harian.
3. **Engine Pemrosesan Berkas**:
   - **LibreOffice (`soffice`)**: Konversi format Office (`.docx`, `.xlsx`, `.pptx`) ke `.pdf`.
   - **Poppler (`pdf2image`)**: Render thumbnail beresolusi tinggi (160 DPI lossless) untuk pratinjau dokumen.
   - **PyPDF**: Manipulasi struktur halaman, pemotongan, penggabungan, kompresi konten stream, dan enkripsi password.
   - **Pillow (PIL)**: Optimasi kompresi gambar, konversi RGB/RGBA, rendering layout visual.
   - **docxtpl & python-docx**: Parsing variabel template dan injeksi data OCR ke dokumen Word.
   - **zipfile**: Pengemasan paket multi-berkas dengan kompresi `ZIP_DEFLATED`.

---

## 3. Arsitektur Sistem & Alur Global (System Architecture)

Sistem menggunakan pola **Asynchronous Job-Worker Architecture** untuk memastikan browser pengguna tidak mengalami freeze/timeout saat memproses file berukuran besar.

```mermaid
sequenceDiagram
    autonumber
    actor User as Pengguna (Browser)
    participant Front as Frontend (Next.js)
    participant Back as Backend (FastAPI)
    participant BG as Background Worker
    participant Disk as Storage Disk
    participant DB as PostgreSQL

    User->>Front: Pilih File & Konfigurasi Parameter
    Front->>Back: POST /api/{feature}/process (Multipart Form)
    Back->>Disk: Simpan file ke storage/documents/originals/
    Back->>DB: Buat record Document (status: pending)
    Back->>DB: Buat record Job (status: pending, progress: 0)
    Back-->>Front: Return 202 Accepted (job_id, document_id)
    
    par Pemrosesan Asinkron
        Back->>BG: Jalankan _run_{feature}_job
        BG->>DB: Update Job (status: processing, progress: 25-50)
        BG->>Disk: Eksekusi Engine Pemrosesan (LibreOffice/PyPDF/Pillow)
        BG->>Disk: Tulis hasil ke storage/documents/outputs/
        BG->>DB: Update Document (status: done, output_size: N)
        BG->>DB: Update Job (status: done, progress: 100)
    and Polling Real-time Frontend
        loop Setiap 1.5 detik
            Front->>Back: GET /api/jobs/{job_id}
            Back->>DB: Query Job Status
            Back-->>Front: Return Status & Progress (%)
            Front->>Front: Update ProcessingModal UI
        end
    end

    Front->>Front: Job Selesai (100%), Tutup Modal Loading
    Front->>User: Tampilkan Panel Hasil & Tombol Unduh
    User->>Back: GET /api/documents/{doc_id}/download
    Back->>Disk: Stream file dari storage/documents/outputs/
    Back-->>User: File Download Response
```

---

## 4. Struktur Data & Relasi Database (Data Model & ERD)

Basis data SmartDoc menggunakan PostgreSQL dengan tiga tabel inti yang saling berelasi: `templates`, `documents`, dan `jobs`.

```mermaid
erDiagram
    TEMPLATES ||--o{ DOCUMENTS : "digunakan oleh"
    DOCUMENTS ||--o{ JOBS : "memiliki antrean"

    TEMPLATES {
        uuid id PK
        varchar name "Nama template formulir"
        text description "Deskripsi opsional"
        integer version "Versi template (default: 1)"
        boolean is_active "Status aktif"
        varchar file_path "Path file template .docx"
        varchar thumbnail "Path thumbnail preview"
        jsonb fields "Daftar zona field [{key, label, type, zone}]"
        timestamp created_at
    }

    DOCUMENTS {
        uuid id PK
        uuid template_id FK "Referensi ke templates.id (opsional)"
        integer template_version "Versi template yang digunakan"
        varchar feature "converter | compressor | splitter | merger | watermark | ocr"
        varchar custom_name "Nama kustom berkas (hasil rename)"
        varchar original_file "Path file asli di storage"
        varchar output_file "Path file hasil di storage"
        varchar output_docx "Path file DOCX (khusus OCR)"
        varchar output_pdf "Path file PDF (khusus OCR)"
        jsonb extracted_fields "Data hasil ekstraksi OCR"
        float confidence_score "Tingkat akurasi OCR (0.0 - 1.0)"
        bigint original_size "Ukuran file asli (bytes)"
        bigint output_size "Ukuran file hasil (bytes)"
        varchar status "pending | processing | done | failed"
        timestamp created_at
    }

    JOBS {
        uuid id PK
        uuid document_id FK "Referensi ke documents.id (CASCADE)"
        varchar feature "Fitur pemrosesan"
        varchar status "pending | processing | done | failed"
        integer progress "Persentase progres (0 - 100)"
        text error "Pesan kendala jika failed"
        timestamp started_at "Waktu mulai pemrosesan"
        timestamp finished_at "Waktu selesai pemrosesan"
        timestamp created_at
    }
```

### Indeks Kinerja Database:
- `idx_documents_created_at` pada `documents(created_at DESC)`: Mempercepat pagination dan sorting riwayat berkas.
- `idx_documents_feature` pada `documents(feature)`: Mempercepat tab filtering per kategori fitur.
- `idx_jobs_document_id` pada `jobs(document_id)`: Mempercepat relasi query job polling.
- `idx_jobs_status` pada `jobs(status)`: Mempercepat monitoring background queue.

---

## 5. Analisis Alur Kerja Fitur (Feature Deep-Dives)

### 5.1 Document Converter
- **Alamat URL**: `/converter`
- **Fungsi**: Mengonversi format dokumen ke format target yang diinginkan pengguna.
- **Matriks Konversi**:
  - `PDF` -> `DOCX`, `XLSX`, `PPTX`, `JPG`, `PNG`.
  - `DOCX` / `XLSX` / `PPTX` -> `PDF`, `JPG`, `PNG`.
  - `JPG` / `PNG` -> `PDF`, `PNG`, `JPG`.
- **Logika Output Gambar Khusus (Directive)**:
  - Jika dokumen PDF memiliki **1 halaman**, output langsung berupa **1 file gambar** (`.jpg` atau `.png`).
  - Jika dokumen PDF memiliki **> 1 halaman**, seluruh halaman dikemas ke dalam **1 file arsip `.zip`**.
- **State UI**: Saat konversi selesai (`status: done`), form input upload disembunyikan dan antarmuka berfokus pada kartu hasil. Tombol *"Konversi File Lain"* memulihkan kembali form pemilihan format.

---

### 5.2 File Compressor
- **Alamat URL**: `/compressor`
- **Fungsi**: Memadatkan ukuran file dokumen dan media.
- **Engine Kompresi**:
  - **PDF**: Ghostscript dengan profil `/ebook` (DPI: 150), fallback otomatis ke `pypdf.PageObject.compress_content_streams()`.
  - **JPG/PNG**: Pillow Image Optimization dengan penyesuaian kualitas adaptive (`quality=82-85`).
  - **DOCX / XLSX / PPTX**: Dekompresi arsip ZIP file Office, downsampling pada seluruh gambar internal yang tersemat (`/media`), dan kompresi ulang arsip.
- **Fitur Khusus**: Jika ukuran hasil kompresi ternyata lebih besar dari file asli, sistem secara otomatis mempertahankan file asli agar kualitas tidak turun sia-sia.

---

### 5.3 Document Splitter
- **Alamat URL**: `/splitter`
- **Fungsi**: Memotong atau mengekstrak halaman dari dokumen PDF/Word.
- **Mode Operasi**:
  1. **Ekstrak Rentang Halaman (`extract_range`)**: Memilih halaman spesifik secara visual melalui thumbnail atau ekspresi rentang (contoh: `1-3, 5, 8-10`).
  2. **Pecah per N Halaman (`split_chunks`)**: Membagi dokumen menjadi beberapa berkas terpisah setiap interval N halaman.
- **Pratinjau Visual**: Server menghasilkan thumbnail resolusi tinggi per halaman secara on-the-fly melalui Poppler untuk mempermudah pemilihan halaman oleh pengguna.

---

### 5.4 Document Merger
- **Alamat URL**: `/merger`
- **Fungsi**: Menggabungkan banyak dokumen lintas format menjadi satu file PDF utuh.
- **Mode Operasi**:
  1. **Mode Antrean (Sequence Mode)**: Pengguna dapat mengunggah banyak berkas sekaligus, lalu mengubah urutan posisi dokumen menggunakan tombol navigasi / drag & drop.
  2. **Mode Sisip Dokumen (Insert Mode)**: Menentukan Dokumen Utama dan Dokumen Sisipan, kemudian memilih posisi penyisipan (Di Halaman Pertama / Di Halaman Terakhir / Setelah Halaman ke-N).
- **Normalisasi Format**: Berkas non-PDF (Word, Excel, PPTX, Gambar) otomatis dikonversi menjadi PDF sementara terlebih dahulu sebelum digabungkan ke berkas akhir.

---

### 5.5 Watermark & Security
- **Alamat URL**: `/watermark`
- **Fungsi**: Menambahkan cap air visual dan mengamankan berkas PDF dengan enkripsi password.
- **Kustomisasi Watermark**:
  - Teks kustom atau preset teks cepat (`RAHASIA`, `CONFIDENTIAL`, `DRAFT`, `SALINAN RESMI`, `SAMPLE`).
  - Rotasi sudut dinamis (-90° hingga +90°).
  - Opasitas transparan (10% hingga 100%).
  - Pilihan warna preset (Slate Gray, Crimson Red, Navy Blue, Forest Green, Amber Gold).
- **Proteksi Kata Sandi**: Menerapkan enkripsi standar AES pada berkas PDF sehingga dokumen terkunci dan memerlukan password untuk dibuka.
- **Live Visual Preview**: Canvas interaktif di sisi frontend yang mensimulasikan penempatan watermark dan status enkripsi dokumen secara real-time sebelum diproses.

---

### 5.6 OCR Template-Based & Template Engine
- **Alamat URL**: `/scan` (User) & `/admin/templates` (Admin)
- **Fungsi**: Mengekstrak data dari formulir fisik terpindai dan memetakannya ke template dokumen Word `.docx`.
- **Manajemen Template (Admin)**:
  - Mengunggah file template `.docx` dengan tag placeholder Jinja `{{nama_field}}`.
  - Mengatur zona koordinat bounding box normalisasi `(x_norm, y_norm, w_norm, h_norm)` untuk setiap field.
- **Ekstraksi OCR**:
  - Membaca area gambar berdasarkan bounding box.
  - Memvalidasi skor kepercayaan (confidence score).
  - Menginjeksi teks hasil pengenalan ke dalam template `.docx` menggunakan `docxtpl`.

---

### 5.7 Riwayat Dokumen & Operasi Massal (Multi-Select)
- **Alamat URL**: `/riwayat-dokumen`
- **Fungsi**: Manajemen arsip seluruh dokumen yang telah diproses di platform SmartDoc.
- **Fitur-Fitur**:
  - **Ringkasan Metrik**: Statistik jumlah total berkas dan rincian per kategori modul.
  - **Live Search & Filter Kategori**: Filter instan berdasarkan nama dokumen atau kategori modul.
  - **Inline Rename**: Mengubah nama dokumen secara langsung tanpa reload halaman.
  - **Multi-Select & Batch Toolbar**:
    - Checkbox seleksi pada setiap baris dan header tabel.
    - Floating sticky action toolbar yang muncul ketika minimal 1 dokumen dipilih.
    - **Unduh Terpilih**: Mengemas seluruh dokumen yang dipilih ke dalam satu file ZIP (`smartdoc_batch_YYYY-MM-DD.zip`) melalui endpoint `POST /api/documents/batch-download`.
    - **Hapus Terpilih**: Menghapus seluruh dokumen terpilih secara massal beserta berkas fisiknya dari disk melalui endpoint `POST /api/documents/batch-delete`.
    - **Tombol Pintar `Pilih Semua (N)` / `Batal Pilih Semua`**: Beralih fungsi secara dinamis.

---

## 6. Mekanisme Pemrosesan Asinkron & Polling (Job Lifecycle)

```mermaid
stateDiagram-v2
    [*] --> Pending: Client submit request
    Pending --> Processing: Background task dimulai
    Processing --> Done: Pemrosesan berkas sukses (100%)
    Processing --> Failed: Error / File corrupt / Timeout
    Done --> [*]: Dokumen siap diunduh
    Failed --> [*]: Tampilkan pesan error & tombol Retry
```

### Komponen Penggerak:
1. **Frontend `useJobPolling.ts`**:
   - Menerima `jobId`.
   - Mengirim request `GET /api/jobs/{jobId}` setiap interval 1.5 detik.
   - Menghentikan interval secara otomatis saat status mencapai `done` atau `failed`.
   - Mengukur durasi waktu pemrosesan (`elapsedSeconds`) secara presisi.
2. **Frontend `ProcessingModal.tsx`**:
   - Merender modal dialog terpusat dengan efek latar belakang frosted glass (`backdrop-filter: blur(8px)`).
   - Menampilkan nama file, badge format target, timer detik berjalan, dan animasi persentase bar progres.

---

## 7. Manajemen Penyimpanan & File Lifecycle

Struktur folder penyimpanan diatur secara sistematis pada direktori `./storage/`:

```
d:\smartdoc\storage\
├── temp\                      # Berkas sementara dalam pemrosesan
│   ├── uploads\               # File upload sementara sebelum dipindah
│   └── processing\            # File antara (intermediate rendering/conversion)
├── templates\                 # Template formulir .docx & thumbnail admin
│   └── {template_uuid}\
│       ├── template_v1.docx
│       └── thumbnail.png
└── documents\                 # Penyimpanan dokumen utama
    ├── originals\             # File sumber asli pengguna ({uuid}.ext)
    └── outputs\               # File hasil pemrosesan ({uuid}_compressed.ext, dst)
```

### Kebijakan Auto-Cleanup:
Modul `app/core/cleanup.py` menjalankan pembersihan otomatis terhadap file-file sementara di direktori `storage/temp/` yang umurnya melebihi ambang batas TTL (`TEMP_FILE_TTL_HOURS = 24 jam`) setiap kali aplikasi dinyalakan.

---

## 8. Katalog Referensi API (API Reference)

| Modul | Method | Endpoint | Deskripsi | Status Code |
| :--- | :--- | :--- | :--- | :--- |
| **System** | `GET` | `/health` | Health check status server | `200 OK` |
| **System** | `GET` | `/` | Root informasi API & versi | `200 OK` |
| **Jobs** | `GET` | `/api/jobs/{job_id}` | Polling status progres job asinkron | `200 OK` |
| **Converter** | `POST` | `/api/converter/process` | Memulai proses konversi dokumen | `202 Accepted` |
| **Compressor** | `POST` | `/api/compressor/process` | Memulai proses kompresi dokumen | `202 Accepted` |
| **Splitter** | `POST` | `/api/splitter/info` | Ekstraksi jumlah & thumbnail halaman | `200 OK` |
| **Splitter** | `POST` | `/api/splitter/process` | Memulai proses pemisahan dokumen | `202 Accepted` |
| **Merger** | `POST` | `/api/merger/process` | Memulai penggabungan banyak dokumen | `202 Accepted` |
| **Watermark** | `POST` | `/api/watermark/process` | Memulai proses watermark & enkripsi | `202 Accepted` |
| **Documents** | `GET` | `/api/documents` | Mendapatkan daftar riwayat dokumen | `200 OK` |
| **Documents** | `GET` | `/api/documents/{doc_id}` | Mendapatkan detail informasi 1 dokumen | `200 OK` |
| **Documents** | `GET` | `/api/documents/{doc_id}/download` | Mengunduh file output dokumen | `200 OK` (Stream) |
| **Documents** | `PATCH`| `/api/documents/{doc_id}` | Mengubah nama dokumen (Rename) | `200 OK` |
| **Documents** | `DELETE`| `/api/documents/{doc_id}` | Menghapus dokumen dari DB & disk | `200 OK` |
| **Documents** | `POST` | `/api/documents/batch-download` | Mengunduh banyak dokumen dalam ZIP | `200 OK` (ZIP) |
| **Documents** | `POST` | `/api/documents/batch-delete` | Menghapus banyak dokumen sekaligus | `200 OK` |
| **Documents** | `POST` | `/api/documents/first-page-preview` | Generate thumbnail cepat halaman 1 | `200 OK` |
| **Templates** | `GET` | `/api/templates` | Mendapatkan daftar template OCR | `200 OK` |
| **Templates** | `GET` | `/api/templates/{id}` | Mendapatkan detail template OCR | `200 OK` |
| **Templates** | `POST` | `/api/templates` | Membuat template OCR baru | `201 Created` |

---

## 9. Panduan Instalasi & Eksekusi Lingkungan (Runbook)

### 9.1 Kebutuhan Sistem & Dependensi Eksternal
1. **Python 3.11+** & **Node.js 18+**.
2. **PostgreSQL Database Server**.
3. **Perangkat Lunak Pendukung (OS level)**:
   - **LibreOffice**: Pastikan command `soffice` terdaftar di sistem PATH untuk konversi Office.
   - **Poppler**: Utilitas `pdftoppm` untuk render thumbnail PDF.
   - **Ghostscript (`gs`)**: Opsional untuk akselerasi kompresi PDF tingkat lanjut.

### 9.2 Konfigurasi Environment (`.env`)
```ini
# Backend (.env)
APP_ENV=development
DATABASE_URL=postgresql+asyncpg://smartdoc:smartdoc_secret@localhost:5432/smartdoc_db
SECRET_KEY=smartdoc_secret_key_production
STORAGE_PATH=./storage
MAX_FILE_SIZE_MB=50
MAX_PDF_PAGES=50
TEMP_FILE_TTL_HOURS=24
COMPRESSION_IMAGE_QUALITY=85
COMPRESSION_IMAGE_DPI=150
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### 9.3 Menjalankan Backend (FastAPI)
```bash
cd smartdoc-backend
# Mengaktifkan Virtual Environment
.\.venv\Scripts\Activate.ps1
# Menjalankan Uvicorn Dev Server
uvicorn app.main:app --reload --port 8000
```

### 9.4 Menjalankan Frontend (Next.js)
```bash
cd smartdoc-frontend
# Menjalankan Development Server
npm run dev
```

Platform dapat diakses pada browser melalui:
- **Frontend App**: `http://localhost:3000`
- **Backend API & Swagger Docs**: `http://localhost:8000/docs`
