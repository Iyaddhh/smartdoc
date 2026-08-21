# SmartDoc — Web-Based Document Management System

SmartDoc adalah aplikasi manajemen dokumen berbasis web yang mendukung:
- **Document Converter** — Konversi otomatis antar format (PDF, Word, Excel, PowerPoint, Image).
- **File Compressor** — Kompresi otomatis file tanpa penurunan kualitas signifikan.
- **OCR Template-Based** — Digitalisasi dokumen fisik ke template Word/PDF yang bisa diedit.

---

## 🚀 Quick Start (Docker Compose)

### Prasyarat
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (dengan Docker Compose v2+)

### Menjalankan Seluruh Sistem

1. Clone repositori ini:
   ```bash
   git clone <repository-url>
   cd smartdoc
   ```

2. Salin file environment:
   ```bash
   cp .env.example .env
   ```

3. Jalankan service menggunakan Docker Compose:
   ```bash
   docker-compose up -d --build
   ```

4. Layanan akan berjalan di:
   - **Frontend (Next.js):** [http://localhost:3000](http://localhost:3000)
   - **Backend API (FastAPI):** [http://localhost:8000](http://localhost:8000)
   - **Interactive API Docs (Swagger):** [http://localhost:8000/docs](http://localhost:8000/docs)
   - **Database (PostgreSQL 16):** `localhost:5432`

---

## 🏗️ Struktur Project

```
smartdoc/
├── smartdoc-frontend/     # Aplikasi Next.js 14 (App Router)
├── smartdoc-backend/      # Aplikasi FastAPI (Python 3.11)
├── storage/               # Directori penyimpanan file lokal (Docker Volume)
│   ├── temp/              # File sementara upload & processing
│   ├── templates/         # Template Word (.docx)
│   └── documents/         # Dokumen original & output hasil proses
├── docker-compose.yml     # Orchestration Docker
├── .env                   # Environment Variables
├── PRD.md                 # Product Requirements Document
└── README.md
```

---

## 📄 Dokumentasi API

Lihat PRD selengkapnya di [`PRD.md`](file:///d:/smartdoc/PRD.md).
