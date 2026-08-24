<div align="center">

# 📑 SmartDoc
### *All-in-One Intelligent Document Management & Processing Workspace*

[![Next.js](https://img.shields.io/badge/Next.js-16.3-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.2-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat-square&logo=python&logoColor=white)](https://python.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=flat-square&logo=docker&logoColor=white)](https://www.docker.com/)

<p align="center">
  Aplikasi manajemen dan pengolahan dokumen modern berbasis web dengan dukungan konversi lintas format, kompresi cerdas, pemisahan visual halaman, penggabungan & penyisipan dokumen, watermark & proteksi password AES, serta digitalisasi OCR berbasis template.
</p>

</div>

---

## 🌟 Fitur Utama (Core Features)

### 🔄 1. Document Converter
- Konversi multi-format berkualitas tinggi antar berkas: **PDF, Word (.docx), Excel (.xlsx), PowerPoint (.pptx), dan Gambar (.jpg, .png)**.
- Didukung oleh engine headless **LibreOffice** dan library pemrosesan dokumen presisi.

### 🗜️ 2. File Compressor
- Kompresi ukuran dokumen (PDF, Office, Gambar) secara instan tanpa mengorbankan keterbacaan esensial teks maupun gambar.
- Optimalisasi stream berbasis **Ghostscript & PyPDF** dengan verifikasi otomatis (mengembalikan berkas asli jika hasil kompresi tidak lebih kecil).

### ✂️ 3. Document Splitter
- **Pratinjau Visual Interaktif (*Page Preview Gallery*)**: Menampilkan thumbnail visual setiap halaman dokumen menggunakan Poppler.
- **Pilih & Pisahkan**: Klik kartu halaman untuk memilih rentang, ekstrak halaman tertentu ke 1 PDF baru, atau pecah dokumen per interval berkala ke dalam arsip **ZIP**.

### 📑 4. Document Merger
- Satukan berbagai berkas lintas format (PDF, Word, Excel, PPTX, Gambar) menjadi **1 PDF utuh**.
- **Mode Urutan Bebas**: Atur urutan antrean berkas dengan tombol geser naik/turun dan tombol cepat *Paling Awal / Paling Akhir*.
- **Mode Sisipkan Dokumen (*Smart Insertion Mode*)**: Sisipkan berkas lampiran/cover tepat di **Awal Dokumen**, **Akhir Dokumen**, atau **Kustom di Antara Halaman Tertentu** (*setelah halaman ke-X*).

### 🛡️ 5. Watermark & Security
- **Cap Air Teks Kustom**: Sematkan cap air dengan preset cepat (*RAHASIA, CONFIDENTIAL, DRAFT, SALINAN RESMI*), rotasi (0°, 45°, -45°), opasitas transparan (10%–80%), dan palet warna pilihan.
- **Live Visual Canvas**: Pratinjau kanvas interaktif merespons perubahan teks dan rotasi secara *real-time*.
- **Proteksi Kata Sandi (AES-128)**: Kunci berkas PDF dengan enkripsi password kuat sehingga aman didistribusikan.

### 🔍 6. OCR & Digitalisasi Berbasis Template
- Pindai dokumen formulir/surat fisik dan petakan koordinat zona data secara otomatis ke template digital Word (.docx) dan PDF.

### 📜 7. Riwayat Dokumen Terpadu (*Document History*)
- Daftar lengkap seluruh arsip berkas hasil pemrosesan dengan filter tab kategori, pencarian instan, metrik efisiensi kompresi, ganti nama (*rename*), dan unduh langsung.

### 🖼️ 8. Pratinjau Dokumen Layar Penuh (*Full-Screen Ultra-HD Preview*)
- Modal layar penuh berbasis **React Portal** dengan latar belakang *frosted glass blur*.
- Render **Lossless PNG 160 DPI** untuk teks yang tajam, dukungan gulir vertikal multi-halaman (*multi-page scroll*), kontrol **Zoom In (+) / Zoom Out (-)**, serta opsi **Mode Pembaca PDF Asli** berbasis vektor.

---

## 🏗️ Arsitektur & Struktur Proyek

```
smartdoc/
├── smartdoc-frontend/                 # Frontend Next.js 16 (App Router + TypeScript)
│   ├── app/
│   │   ├── (user)/                    # Dashboard, Converter, Compressor, Splitter, Merger, Watermark, Riwayat
│   │   ├── (admin)/                   # Manajemen Template OCR
│   │   ├── layout.tsx                 # Root layout & font optimization
│   │   └── globals.css                # Design tokens, variables & components
│   ├── components/                    # FileUpload (Page 1 preview), Sidebar, JobProgressCard, Toast
│   ├── lib/                           # API client wrapper & useJobPolling hook
│   └── next.config.ts                 # Next.js build configuration
│
├── smartdoc-backend/                  # Backend FastAPI (Python 3.11+ Async)
│   ├── app/
│   │   ├── api/                       # API routes (converter, compressor, splitter, merger, watermark, documents)
│   │   ├── services/                  # Document engines (LibreOffice, Ghostscript, PyPDF, ReportLab, Poppler)
│   │   ├── models/                    # SQLAlchemy ORM Models (Document, Job, Template)
│   │   ├── core/                      # Config, Logger, Response helpers, Validators, Cleanup TTL
│   │   └── main.py                    # FastAPI application setup & lifespan
│   ├── storage/                       # Direktori penyimpanan lokal (originals, outputs, temp)
│   └── requirements.txt               # Dependensi Python
│
├── storage/                           # Shared volume storage untuk Docker
├── docker-compose.yml                 # Orchestrasi multi-container
├── .env.example                       # Contoh variabel lingkungan
└── README.md
```

---

## 🚀 Panduan Memulai (Getting Started)

### Opsi 1: Menggunakan Docker Compose (Direkomendasikan)

Pastikan [Docker Desktop](https://www.docker.com/) sudah terpasang dan berjalan di sistem Anda:

1. **Clone repositori**:
   ```bash
   git clone https://github.com/iyaddhh/smartdoc.git
   cd smartdoc
   ```

2. **Siapkan file `.env`**:
   ```bash
   cp .env.example .env
   ```

3. **Jalankan aplikasi**:
   ```bash
   docker-compose up -d --build
   ```

4. **Akses Layanan**:
   - 🌐 **Frontend**: [http://localhost:3000](http://localhost:3000)
   - ⚡ **Backend API**: [http://localhost:8000](http://localhost:8000)
   - 📖 **Swagger API Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)
   - 🗄️ **Database PostgreSQL**: `localhost:5432`

---

### Opsi 2: Menjalankan Secara Lokal (Manual Development)

#### 1. Backend (FastAPI)
```bash
cd smartdoc-backend

# Buat virtual environment & aktifkan
python -m venv .venv
# Windows:
.venv\Scripts\activate
# Linux/macOS:
source .venv/bin/activate

# Install dependensi
pip install -r requirements.txt

# Jalankan server FastAPI
uvicorn app.main:app --reload --port 8000
```

#### 2. Frontend (Next.js)
```bash
cd smartdoc-frontend

# Install dependensi Node.js
npm install

# Jalankan dev server
npm run dev
```

Buka browser Anda di `http://localhost:3000`.

---

## ⚙️ Variabel Lingkungan (Environment Variables)

Salin `.env.example` menjadi `.env` dan sesuaikan nilainya:

| Variabel | Deskripsi | Default |
| :--- | :--- | :--- |
| `APP_ENV` | Lingkungan aplikasi (`development` / `production`) | `development` |
| `PORT` | Port backend server | `8000` |
| `DATABASE_URL` | URL koneksi database PostgreSQL / SQLite | `postgresql+asyncpg://smartdoc:smartdoc_secret@localhost:5432/smartdoc_db` |
| `STORAGE_PATH` | Path penyimpanan berkas dokumen | `./storage` |
| `MAX_FILE_SIZE_MB` | Batas maksimum ukuran unggah berkas | `50` |
| `TEMP_FILE_TTL_HOURS` | Masa aktif pembersihan berkas temporary (jam) | `24` |
| `NEXT_PUBLIC_API_URL` | URL endpoint backend untuk frontend | `http://localhost:8000` |

---

## 📡 Ringkasan Endpoint REST API

| Modul | Method | Endpoint | Deskripsi |
| :--- | :---: | :--- | :--- |
| **Converter** | `POST` | `/api/converter/process` | Konversi dokumen antar format (PDF, Word, Excel, PPTX, Gambar) |
| **Compressor** | `POST` | `/api/compressor/process` | Kompresi ukuran dokumen |
| **Splitter** | `POST` | `/api/splitter/info` | Ambil total halaman & galeri thumbnail visual |
| **Splitter** | `POST` | `/api/splitter/process` | Ekstrak rentang halaman atau pecah dokumen per chunk |
| **Merger** | `POST` | `/api/merger/info` | Ambil info halaman untuk konfigurasi penyisipan |
| **Merger** | `POST` | `/api/merger/process` | Gabungkan atau sisipkan dokumen di awal/akhir/custom |
| **Watermark** | `POST` | `/api/watermark/process` | Terapkan cap air teks dan enkripsi kata sandi AES-128 |
| **Documents** | `GET` | `/api/documents` | Ambil daftar riwayat dokumen dengan filter kategori & paging |
| **Documents** | `POST` | `/api/documents/first-page-preview` | Hasilkan thumbnail resolusi tinggi untuk pratinjau |
| **Documents** | `GET` | `/api/documents/{id}/download` | Unduh berkas hasil pemrosesan |
| **Documents** | `PATCH` | `/api/documents/{id}` | Ganti nama kustom dokumen (*rename*) |
| **Documents** | `DELETE`| `/api/documents/{id}` | Hapus dokumen dari riwayat dan penyimpanan fisik |
| **Jobs** | `GET` | `/api/jobs/{id}` | Polling status pekerjaan background (*progress tracking*) |
| **Health** | `GET` | `/health` | Pemeriksaan kesehatan server backend |

---

## 🛠️ Tech Stack & Libraries

- **Frontend**: Next.js 16 (App Router, Turbopack), React 19, TypeScript, Lucide Icons, Vanilla CSS Design System.
- **Backend**: FastAPI, Python 3.11+, Pydantic v2, SQLAlchemy 2.0 (Async), Uvicorn.
- **Document Engines**:
  - **LibreOffice Headless**: Konversi Office (Word, Excel, PowerPoint) ke PDF.
  - **Ghostscript**: Kompresi PDF stream & image downsampling.
  - **Poppler (`pdf2image`)**: Rendering halaman PDF ke visual thumbnail beresolusi tinggi.
  - **PyPDF**: Manipulasi struktur halaman, ekstraksi, penyisipan, dan enkripsi password AES.
  - **ReportLab**: Generator vektor canvas watermark dinamis.
- **Database**: PostgreSQL 16 / SQLite (Async Engine via AsyncPG & aiosqlite).
- **Containerization**: Docker & Docker Compose.

---

## 📄 Lisensi
Proyek ini dibuat dan dikembangkan untuk kebutuhan manajemen pengolahan dokumen cerdas. Bebas digunakan dan dimodifikasi untuk pengembangan lebih lanjut.
