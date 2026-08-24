# SmartDoc — Product Requirements Document

| | |
|---|---|
| **Versi** | 1.2.0 |
| **Status** | Active / Implemented |
| **Tanggal Terakhir Diperbarui** | 24 Agustus 2026 |
| **Fase** | MVP & Enhanced Document Suite |
| **Tech Stack** | Next.js 14 · FastAPI (Python 3.11) · PostgreSQL 16 · Docker Compose |

> Dokumen ini merupakan panduan spesifikasi teknis dan fungsional produk **SmartDoc** terkini yang merefleksikan seluruh fitur, arsitektur, skema database, dan aturan validasi yang telah terimplementasi di dalam codebase.

---

## 1. Gambaran Umum Produk

### 1.1 Visi
**SmartDoc** adalah sistem manajemen dan pemrosesan dokumen terpadu berbasis web yang dirancang untuk memudahkan konversi antar-format, kompresi cerdas, penggabungan (*merge*), pemisahan (*split*), pemberian tanda air (*watermark*), dan digitalisasi dokumen fisik (*template-based OCR*). Sistem dibangun dengan performa tinggi, keamanan biner berkas, serta antarmuka visual modern dan responsif.

### 1.2 Pernyataan Masalah & Solusi
| Masalah Lapangan | Solusi SmartDoc |
|---|---|
| Konversi format dokumen manual dan terpisah-pisah | **Document Converter** terpadu untuk Office, PDF, Gambar, serta Multi-Image to PDF |
| Ukuran file dokumen terlalu besar untuk lampiran email/portal | **File Compressor** cerdas dengan 3 tingkat preset optimasi |
| Penggabungan dan pemotongan halaman PDF butuh tools berbayar | **Document Merger & Splitter** visual interaktif per-halaman |
| Dokumen rahasia/draft mudah disalahgunakan tanpa identitas | **Watermark & Protection** teks dan logo gambar fleksibel |
| Dokumen fisik hasil scan/kamera sulit diedit manual | **OCR Template-Based** dengan ekstraksi zona ternormalisasi ke Word (.docx) & PDF |
| Dokumen berserakan tanpa riwayat pemrosesan | **Riwayat Dokumen** terpusat dengan pratinjau instan, rename, dan manajemen unduhan |

---

## 2. Fitur Lengkap Produk

### 2.1 Document Converter
Fitur konversi dokumen otomatis dengan deteksi MIME type dan integritas biner (*magic bytes*).
- **Single Document Conversion**:
  - Word (`.docx`) $\rightarrow$ PDF (LibreOffice headless)
  - Excel (`.xlsx`) $\rightarrow$ PDF (semua sheet)
  - PowerPoint (`.pptx`) $\rightarrow$ PDF (semua slide)
  - PDF Text-based $\rightarrow$ Word (`.docx`) dengan format dan layout terjaga
  - PDF $\rightarrow$ Image (`.jpg` / `.png`) multi-halaman beresolusi tinggi (dikemas dalam format `.zip` per halaman)
- **Multi-Image to PDF Conversion**:
  - Mengunggah banyak gambar sekaligus (`.jpg`, `.jpeg`, `.png`) hingga 50 gambar (maks. 12 MB/file, total maks. 35 MB).
  - Tampilan daftar berkas interaktif dengan **thumbnail pratinjau nyata (*live preview*)**, nomor urut (`#1`, `#2`), tombol ubah urutan halaman (`↑` / `↓`), dan tombol tambah gambar.
  - Menggabungkan seluruh gambar secara berurutan menjadi 1 file PDF utuh.
- **Deteksi PDF Scan Fisik**:
  - Jika berkas PDF terdeteksi sebagai pindaian fisik murni tanpa lapisan teks, sistem menampilkan banner cerdas untuk mengarahkan pengguna ke fitur **OCR Template-Based**.
- **Pembersihan Metadata DOCX**:
  - Menghapus artefak thumbnail dummy OpenXML pada berkas `.docx` agar Windows File Explorer menampilkan logo resmi Microsoft Word standar.

### 2.2 File Compressor
Fitur kompresi ukuran berkas dokumen dan gambar dengan 3 mode preset:
- **Preset Tingkat Kompresi**:
  - **Ekstrem**: Penghematan ukuran maksimal (hingga 70%), resolusi disesuaikan untuk kebutuhan web/lampiran ringan.
  - **Direkomendasikan (Default)**: Keseimbangan optimal antara kejernihan teks/gambar dan penghematan ukuran (hingga 50%).
  - **Rendah**: Preservasi kualitas tertinggi dengan kompresi ringan (hingga 30%).
- **Format yang Didukung**:
  - **PDF**: Optimasi stream internal, kompresi gambar embedded via Ghostscript & pypdf.
  - **Gambar (JPG/PNG)**: Re-encoding adaptif via Pillow & quantisasi warna.
  - **Dokumen Office (DOCX/XLSX/PPTX)**: Kompresi gambar embedded dalam struktur XML container.
- **Perlindungan Quality Check**:
  - Jika hasil kompresi ternyata lebih besar dari file asli, sistem secara otomatis mempertahankan file asli dan memberi tahu pengguna bahwa berkas sudah dalam kondisi paling optimal.

### 2.3 Document Merger (Penggabung Dokumen)
Fitur penggabungan beberapa dokumen/gambar menjadi satu kesatuan dokumen PDF:
- **Mode Urutan Berkas (*Sequence Mode*)**:
  - Menggabungkan daftar file (PDF, Word, Excel, PPT, Gambar) secara berurutan.
  - Fitur drag/tombol naik-turun untuk mengatur urutan file sebelum digabung.
- **Mode Sisipkan Dokumen (*Insert Mode*)**:
  - Menyisipkan dokumen/gambar tambahan ke dalam dokumen utama:
    - Di awal dokumen (halaman pertama).
    - Di akhir dokumen (halaman terakhir).
    - Di posisi halaman tertentu (misalnya setelah halaman 3).

### 2.4 Document Splitter (Pemisah Dokumen)
Fitur pemotongan dan pemisahan halaman dokumen (PDF & Word):
- **Galeri Pratinjau Halaman Visual Interaktif**:
  - Menampilkan thumbnail visual untuk setiap halaman dokumen dengan resolusi jernih.
  - Mode klik langsung pada kartu halaman untuk memilih/mengecualikan halaman.
  - Modal perbesar pratinjau (*lightbox zoom*) untuk membaca detail halaman.
  - Indikator pemuatan pratinjau yang tersinkronisasi seirama dengan berkas input.
- **3 Metode Pemisahan**:
  1. **Ekstrak Rentang Halaman**: Mengambil halaman tertentu (misal `1-3, 5, 8-10`) menjadi 1 file PDF atau DOCX.
  2. **Pecah Setiap N Halaman (*Fixed Interval*)**: Memotong dokumen menjadi beberapa berkas PDF per N halaman (dikemas dalam ZIP).
  3. **Pecah Semua Halaman Tunggal**: Memisahkan setiap halaman menjadi 1 PDF terpisah dalam paket ZIP.

### 2.5 Watermark & Protection
Fitur penambahan tanda air pada dokumen PDF untuk perlindungan hak cipta dan label privasi:
- **Tanda Air Teks (*Text Watermark*)**:
  - Kustomisasi teks (misal: "CONFIDENTIAL", "DRAFT", "SALINAN RESMI").
  - Pengaturan ukuran font, rotasi sudut (0° s/d 360°), warna teks, transparansi/opacity (10% s/d 100%).
  - Mode perataan posisi: Tengah, Diagonal, atau Pola Berulang (*Tiled Grid*).
- **Tanda Air Logo / Gambar (*Image Watermark*)**:
  - Unggah logo instansi/perusahaan berformat PNG transparan.
  - Pengaturan skala ukuran logo, transparansi, dan sudut rotasi.

### 2.6 OCR Template-Based (Digitalisasi Dokumen Fisik)
Fitur ekstraksi teks berbasis zona koordinat ternormalisasi dari form berkotak/dokumen fisik:
- **Konsep Koordinat Ternormalisasi (0.0 s/d 1.0)**:
  - Koordinat zona bounding box disimpan dalam rasio `x_norm, y_norm, w_norm, h_norm` sehingga template bersifat *resolution-independent* (kompatibel dengan berbagai resolusi kamera HP, scan scanner, dan ukuran layar).
- **Pre-processing Image Pipeline**:
  - **Deskew**: Meluruskan orientasi dokumen yang miring secara otomatis.
  - **Denoise & Contrast Enhancement**: Membersihkan bintik noise dan meningkatkan kontras teks.
  - **Adaptive Thresholding**: Menyeimbangkan pencahayaan tidak merata pada foto kamera HP.
- **Mesin OCR & Pengisian Template**:
  - Menggunakan PaddleOCR dengan dukungan akurat untuk karakter alfabet, angka, dan Bahasa Indonesia.
  - Mengisi variabel `{{field}}` ke dalam template `.docx` via `python-docx-template`.
  - Mengonversi otomatis output ke format `.docx` (dapat diedit) dan `.pdf` (siap cetak).
- **Review & Koreksi Interaktif**:
  - Tabel inspeksi hasil ekstraksi dilengkapi *Confidence Score* per field dan kemampuan edit manual sebelum konfirmasi akhir.

### 2.7 Riwayat Dokumen & Manajemen Penyimpanan
- Menyimpan seluruh riwayat pemrosesan dokumen di database PostgreSQL.
- Filter berdasarkan jenis fitur (*Converter, Compressor, Splitter, Merger, Watermark, OCR*).
- Pencarian cerdas berdasarkan nama dokumen asli atau nama kustom.
- Pratinjau interaktif dokumen hasil (*PDF viewer modal* & *Image viewer*).
- Fitur ubah nama dokumen (*Rename*) dan penghapusan berkas fisik beserta record data (termasuk *Batch Delete*).

---

## 3. Arsitektur Teknis & Infrastruktur

### 3.1 Diagram Komponen Sistem
```
+-----------------------------------------------------------------------+
|                       Next.js 14 Frontend (App Router)                |
|  - Modern Dark/Light Design Tokens   - ProcessingModal & Guides       |
|  - Interactive Page Gallery Grid    - Synchronized Loading States     |
+-----------------------------------┬-----------------------------------+
                                    │ HTTP / REST API (Port 8000)
+-----------------------------------▼-----------------------------------+
|                        FastAPI Backend Engine                         |
|  - Concurrency Semaphore (max 2)    - 1MB Chunk Streaming Uploads     |
|  - Magic Bytes & Dimension Check    - BackgroundTasks Job Polling     |
+---------┬-------------------┬-------------------┬------------------┬--+
          │                   │                   │                  │
+---------▼---------+ +-------▼---------+ +-------▼---------+ +------▼-------+
|  LibreOffice /    | |   Ghostscript / | |   PaddleOCR /   | |  PostgreSQL  |
|  pdf2docx / PIL   | |   pypdf / PIL   | | OpenCV Pipeline | |   Database   |
|   (Converter)     | |  (Compressor)   | |     (OCR)       | |  (Metadata)  |
+-------------------+ +-----------------+ +-----------------+ +--------------+
```

### 3.2 Batasan & Aturan Validasi Berkas (*System Limits*)

| Kategori Parameter | Batas Maksimum | Keterangan |
|---|---|---|
| **Batas File Dokumen (Word/Excel/PPT)** | **35 MB** | Divalidasi via *streaming chunking* 1 MB di awal request |
| **Batas File Dokumen PDF** | **35 MB** | Berlaku untuk input tunggal & total gabungan multi-image |
| **Batas File Gambar Satuan** | **12 MB** | Maksimum per 1 file gambar (`.jpg`, `.jpeg`, `.png`) |
| **Batas Total Ukuran Multi-Gambar** | **35 MB** | Akumulasi total seluruh gambar pada konversi ke PDF |
| **Dimensi Gambar Maksimum** | **6000 × 6000 px** | Mencegah lonjakan alokasi memori RAM saat dekompresi biner |
| **Batas Halaman PDF & Multi-Gambar**| **50 Halaman / Gambar**| Menjamin stabilitas pemrosesan dan konsumsi CPU |
| **Batas Concurrency Global** | **Maks. 2 Job Bersamaan**| Diatur via `job_semaphore` untuk proteksi server |
| **Timeout Pemrosesan Job** | **300 detik (5 menit)** | Mencegah proses menggantung tak terbatas |

### 3.3 Struktur Respon API Terstandarisasi
Seluruh endpoint API mengembalikan struktur envelope JSON seragam:
```json
{
  "success": true,
  "data": { ... },
  "message": "Deskripsi status pemrosesan berhasil",
  "error": null
}
```

---

## 4. Skema Database PostgreSQL

### 4.1 Tabel `documents`
Menyimpan metadata seluruh dokumen yang diunggah dan dihasilkan sistem.
```sql
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    custom_name VARCHAR(255),
    feature VARCHAR(50) NOT NULL,
    original_file VARCHAR(500) NOT NULL,
    output_file VARCHAR(500),
    output_docx VARCHAR(500),
    output_pdf VARCHAR(500),
    original_size BIGINT,
    output_size BIGINT,
    status VARCHAR(50) DEFAULT 'pending',
    confidence_score FLOAT,
    template_id UUID REFERENCES templates(id) ON DELETE SET NULL,
    template_version INTEGER,
    extracted_fields JSONB,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);
```

### 4.2 Tabel `jobs`
Melacak progres pemrosesan asinkron (*BackgroundTasks*) untuk kebutuhan polling frontend.
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
```

### 4.3 Tabel `templates`
Menyimpan definisi template form OCR beserta koordinat zona ternormalisasi.
```sql
CREATE TABLE templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    version INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    file_path VARCHAR(500) NOT NULL,
    thumbnail VARCHAR(500),
    fields JSONB NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);
```

---

## 5. Ringkasan Endpoint API Utama

| Fitur | Method & Path | Fungsi Utama |
|---|---|---|
| **Converter** | `POST /api/converter/process` | Konversi dokumen tunggal atau gabungan multi-image ke PDF |
| **Compressor** | `POST /api/compressor/process` | Kompresi berkas dengan preset *extreme*, *recommended*, *low* |
| **Merger** | `POST /api/merger/process` | Penggabungan berkas berurutan atau sisip halaman |
| **Merger Info** | `POST /api/merger/info` | Ekstraksi info total halaman dokumen sebelum digabung |
| **Splitter** | `POST /api/splitter/process` | Pemotongan rentang halaman, interval tetap, atau single pages |
| **Splitter Info**| `POST /api/splitter/info` | Ekstraksi jumlah halaman dan render thumbnail galeri visual |
| **Watermark** | `POST /api/watermark/process` | Pembubuhan teks atau logo gambar tanda air pada PDF |
| **OCR Scan** | `POST /api/ocr/process` | Ekstraksi form berbasis zona dan generate `.docx` + `.pdf` |
| **Templates** | `GET, POST, PUT, DELETE /api/templates` | Manajemen CRUD template admin & konfigurasi zona koordinat |
| **Jobs** | `GET /api/jobs/{job_id}` | Polling status progres pemrosesan background (0–100%) |
| **Documents** | `GET /api/documents` | Riwayat dokumen dengan pencarian, filter, dan pagination |
| **Doc Actions**| `GET /api/documents/{id}/preview` | Pratinjau langsung berkas output (PDF / Gambar) |
| **Doc Actions**| `GET /api/documents/{id}/download`| Unduh berkas hasil pemrosesan |
| **Doc Actions**| `PATCH, DELETE /api/documents/{id}` | Ubah nama berkas (*rename*) dan hapus berkas fisik |

---

## 6. Status Pengembangan & Roadmap

### 6.1 Status Saat Ini (Fase MVP — Lengkap & Terverifikasi)
- [x] Konfigurasi Docker & Docker Compose terintegrasi (Next.js, FastAPI, PostgreSQL).
- [x] Document Converter (Office $\leftrightarrow$ PDF, PDF $\rightarrow$ JPG/PNG ZIP, Image $\rightarrow$ PDF).
- [x] **Multi-Image to PDF** dengan live preview thumbnail, reordering, dan validasi limit 35 MB.
- [x] File Compressor cerdas dengan 3 mode preset (*extreme, recommended, low*).
- [x] Document Merger (Mode Urutan & Mode Sisipkan Dokumen).
- [x] Document Splitter dengan galeri thumbnail interaktif dan loading terpadu seirama.
- [x] Watermark & Protection (Teks kustom & Logo PNG).
- [x] OCR Template-Based dengan OpenCV preprocessor, PaddleOCR, dan koordinat ternormalisasi.
- [x] Riwayat Dokumen lengkap (Search, Filter, Rename, Preview Modal, Batch Delete).
- [x] Manajemen background job terpadu via `ProcessingModal` tunggal.
- [x] Database migration framework menggunakan Alembic async.
- [x] Test suite komprehensif (21/21 Unit & Integration Test Passed).

### 6.2 Roadmap Masa Depan (v1.5 & v2.0)
- **v1.5**:
  - Manajemen folder / kategori dokumen di halaman Riwayat.
  - Dukungan OCR keyword-based untuk dokumen non-form (surat dinas, memo).
  - Webhook notifikasi browser native saat background job selesai.
- **v2.0 (Enterprise)**:
  - Multi-user authentication & Role-Based Access Control (RBAC: Admin, Operator, Viewer).
  - Migrasi storage ke Object Storage (AWS S3 / MinIO / Cloudflare R2).
  - Migrasi antrean tugas (*Task Queue*) ke Celery + Redis untuk konkurensi skala besar.
