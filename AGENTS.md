# Instruksi Agent SmartDoc

## Prinsip kerja

Proyek ini menggunakan **spec-driven development**. Urutan kerja adalah membaca konteks, memperbarui spec yang terdampak, menyusun task, mengimplementasikan, lalu memverifikasi hasil. Spec menjadi acuan sebelum perubahan perilaku dilakukan pada kode.

Gunakan bahasa Indonesia untuk komunikasi dan dokumentasi. Pertahankan istilah teknis, identifier, nama API, dan perintah dalam bahasa Inggris bila relevan.

Instruksi dalam berkas ini menjadi satu acuan untuk seluruh repository, termasuk backend dan frontend. Jangan membuat salinan AGENTS.md di subdirektori. Instruksi eksplisit pengguna menjadi acuan scope pekerjaan; jangan menganggap permintaan review atau penyusunan dokumen sebagai izin otomatis untuk mengimplementasikan fitur.

## Aturan khusus frontend Next.js

Versi Next.js yang terpasang dapat memiliki breaking changes pada API, convention, dan struktur berkas. Sebelum menulis kode frontend, baca panduan yang relevan di `smartdoc-frontend/node_modules/next/dist/docs/` dari root repository. Jika bekerja dari direktori frontend, path-nya adalah `node_modules/next/dist/docs/`. Perhatikan deprecation notices dan gunakan dokumentasi yang sesuai versi terpasang.

Pembuatan aturan agent otomatis Next.js dinonaktifkan melalui `agentRules: false` pada `smartdoc-frontend/next.config.ts` agar instruksi tetap terpusat di berkas ini. `smartdoc-frontend/CLAUDE.md` hanya menunjuk ke berkas root ini, tanpa menyimpan aturan tambahan.

## Dokumen acuan

| Dokumen | Tanggung jawab |
| --- | --- |
| [spec/README.md](spec/README.md) | Pengantar proyek, indeks dokumentasi, setup, konfigurasi, dan perintah operasional |
| [spec/PRD.md](spec/PRD.md) | Problem Statement, Goals, Target Users, User Stories, Functional Requirements, Non-Functional Requirements, dan Scope |
| [spec/DESIGN.md](spec/DESIGN.md) | Pedoman UI/UX, design tokens, interaction states, dan referensi visual |
| [spec/ARCHITECTURE.md](spec/ARCHITECTURE.md) | Komponen sistem, kontrak API, data, lifecycle, dan keputusan teknis |
| [spec/security.md](spec/security.md) | Batas kepercayaan, autentikasi, otorisasi, privacy, dan kontrol keamanan |
| [spec/task.md](spec/task.md) | Pemecahan pekerjaan, dependensi, status implementasi, dan catatan verifikasi |

Setiap detail memiliki dokumen acuan sesuai fungsinya. Gunakan tautan untuk merujuk detail, bukan menyalin uraian lengkap ke beberapa dokumen. Jangan membuat dokumen frontend, audit, atau validation terpisah tanpa permintaan pengguna. Catatan verifikasi singkat ditempatkan pada task terkait.

## Workflow wajib

### 1. Baca sebelum mengubah

- Baca README, bagian PRD yang relevan, dan task terkait sebelum mulai bekerja. Baca DESIGN, ARCHITECTURE, dan security sesuai dampak perubahan.
- Periksa kode, konfigurasi, dan tests terkait untuk memahami kondisi aktual. Inspeksi read-only boleh dilakukan sebelum spec diperbarui.
- Periksa perubahan lokal yang sudah ada. Pertahankan pekerjaan pengguna dan jangan melakukan reset, overwrite, atau cleanup di luar scope.
- Bedakan kebutuhan yang diinginkan, implementasi yang tersedia, dan hasil yang sudah diverifikasi. Checklist selesai tidak otomatis membuktikan semua alur telah diuji.
- Saat menyelaraskan seluruh spec, cocokkan route dan payload API, schema ORM dan migrations, batas input, lokasi storage, konfigurasi native/Docker, UI states, serta klaim hasil tests. Tuliskan keterbatasan pemeriksaan live secara eksplisit dan hindari mempertahankan contoh referensi yang bertentangan dengan implementasi aktif tanpa penjelasan.

### 2. Tentukan scope dan acceptance criteria

Identifikasi perilaku yang berubah, pengguna terdampak, input/output, batasan, error states, dan bagian yang di luar scope. Gunakan acceptance criteria yang dapat diperiksa; jangan membuat target performa, SLA, atau klaim keberhasilan tanpa dasar.

Jika ada konflik antara permintaan, spec, dan implementasi, jelaskan perbedaannya. Minta klarifikasi hanya untuk keputusan yang memengaruhi hasil secara material dan tidak dapat disimpulkan dari konteks. Lanjutkan pekerjaan independen yang sudah jelas. Perubahan rutin dalam scope yang telah diizinkan tidak memerlukan persetujuan berulang.

### 3. Perbarui spec sebelum kode

| Jenis perubahan | Tindakan pada dokumen |
| --- | --- |
| Fitur atau perubahan perilaku produk | Perbarui PRD dan acceptance criteria; perbarui dokumen pendukung yang terdampak |
| Tampilan atau interaksi | Perbarui DESIGN; perbarui PRD jika alur atau perilaku pengguna berubah |
| API, schema, atau susunan komponen | Perbarui ARCHITECTURE; perbarui PRD jika kontrak produk ikut berubah |
| Akses, sesi, privacy, atau kontrol keamanan | Perbarui security dan dokumen kebutuhan/arsitektur yang terdampak |
| Bug yang menyimpang dari spec | Pertahankan requirement yang benar; catat task perbaikan sebelum mengubah kode |
| Refactor tanpa perubahan perilaku | Catat task; perbarui ARCHITECTURE jika rancangan teknis berubah |
| Setup atau dokumentasi saja | Perbarui dokumen pemilik informasi; tidak perlu membuat task implementasi aplikasi |

Ubah hanya dokumen yang relevan. Jangan melonggarkan requirement agar sesuai bug atau menandai fitur sudah tersedia hanya karena spec telah ditulis. Jika rancangan berubah saat implementasi, kembali perbarui spec dan task sebelum melanjutkan perubahan kode tersebut.

### 4. Pecah pekerjaan dalam task

Sebelum implementasi, tambahkan atau perbarui task dengan ID unik mengikuti urutan yang sudah ada. Pertahankan ID lama agar referensi tetap berlaku. Setiap task harus memiliki:

- Hasil konkret yang akan dibuat dan referensi requirement atau bagian spec terkait.
- Dependensi, jika ada.
- Acceptance criteria atau rujukan ke criteria yang sudah ditulis.
- Cara verifikasi yang sesuai dampak perubahan.

Gunakan `[ ]` untuk pekerjaan belum selesai atau belum terverifikasi dan `[x]` hanya ketika hasil yang disebutkan sudah terpenuhi. Jika implementasi selesai tetapi verifikasi belum selesai, tulis kondisi tersebut secara eksplisit; pisahkan task implementasi dan verifikasi bila diperlukan.

### 5. Implementasikan sesuai spec

Kerjakan scope yang sudah diminta dan dokumentasikan sebelumnya. Ikuti pola kode yang tersedia, pusatkan aturan bersama bila relevan, dan hindari perubahan yang tidak berkaitan. Jangan memperluas scope ke fitur deferred tanpa keputusan pengguna.

Pertahankan ownership checks, batas resource, dan keutuhan dokumen. Jangan menghapus slide atau isi dokumen untuk mencapai target kompresi. Jangan mematikan validasi atau menurunkan keamanan hanya untuk meloloskan input atau tests.

Jangan menjalankan layanan lokal, deployment, atau perubahan data aplikasi hanya untuk pekerjaan dokumentasi. Untuk implementasi, gunakan environment pengujian yang sesuai dan hormati permintaan pengguna mengenai layanan yang harus tetap berhenti.

### 6. Verifikasi dan selesaikan

- Periksa hasil terhadap acceptance criteria, termasuk error states dan batas akses yang relevan.
- Jalankan checks sesuai dampak perubahan. Gunakan panduan perintah pada README; integration tests memakai disposable database/storage, bukan data pengguna.
- Untuk perubahan dokumentasi, periksa tautan, konsistensi istilah, referensi task, dan batas tanggung jawab dokumen. Tidak perlu menjalankan seluruh tests aplikasi.
- Catat hasil verifikasi secara singkat pada task terkait: pemeriksaan yang dijalankan, hasil, dan keterbatasan. Jangan mengklaim tests lulus jika tidak dijalankan atau menjumlahkan run yang overlap sebagai unique tests.
- Periksa diff akhir agar spec, task, dan kode konsisten. Jangan mencentang pekerjaan yang masih gagal atau tertunda.
- Laporkan perubahan, hasil pemeriksaan, dan pekerjaan yang masih terbuka. Bedakan hasil terverifikasi dari asumsi.

## Batas keamanan kerja

Jangan menampilkan secrets, credentials, raw tokens, atau isi dokumen pribadi dalam log, dokumentasi, maupun respons. Gunakan data sintetis untuk reproduksi. Jangan menghapus data pengguna, menulis ulang migration historis, atau menjalankan operasi destruktif di luar izin yang diberikan.

Spec-driven development tidak mewajibkan approval tambahan pada setiap tahap. Minta persetujuan ketika tindakan memang belum diizinkan atau keputusan produk masih diperlukan; selain itu, lanjutkan pekerjaan sampai scope yang diminta selesai.
