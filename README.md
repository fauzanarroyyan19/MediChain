# MediChain

### Blockchain-Based Medical Record Management System

MediChain adalah prototipe aplikasi manajemen rekam medis digital yang menggabungkan kontrol akses pasien, enkripsi berkas, penyimpanan IPFS, dan pencatatan bukti integritas pada blockchain. Aplikasi menyediakan dashboard berbeda untuk **Pasien**, **Dokter**, dan **Admin**, serta tiga fitur AI pendukung: OCR dokumen medis, ringkasan data pasien, dan assistant kesehatan berbasis pencarian lokal.

> **Status proyek:** untuk pengembangan dan demonstrasi lokal. Ini belum merupakan sistem klinis siap produksi. AI tidak memberikan diagnosis, keputusan terapi, atau dosis.

## Daftar Isi

- [Latar Belakang](#latar-belakang)
- [Tujuan dan Prinsip](#tujuan-dan-prinsip)
- [Galeri Aplikasi](#galeri-aplikasi)
- [Fitur](#fitur)
- [Alur Penggunaan](#alur-penggunaan)
- [Arsitektur dan Struktur Proyek](#arsitektur-dan-struktur-proyek)
- [Cara Kerja Blockchain](#cara-kerja-blockchain)
- [Penyimpanan dan Keamanan Dokumen](#penyimpanan-dan-keamanan-dokumen)
- [Menjalankan Secara Lokal](#menjalankan-secara-lokal)
- [Konfigurasi Environment](#konfigurasi-environment)
- [Keterbatasan dan Roadmap](#keterbatasan-dan-roadmap)
- [Dokumentasi Tambahan](#dokumentasi-tambahan)

## Latar Belakang

Rekam medis sering tersimpan dalam sistem dan format yang berbeda. Hal ini dapat menyulitkan pasien mengelola dokumen kesehatannya dan menyulitkan penelusuran perubahan atau izin akses. Sistem digital juga perlu menjaga kerahasiaan data karena isi rekam medis sangat sensitif.

MediChain mengeksplorasi pendekatan gabungan: isi dokumen disimpan terenkripsi di luar blockchain, sementara blockchain digunakan untuk bukti integritas, identitas wallet, izin akses, dan jejak transaksi tertentu. Dengan demikian, blockchain tidak dipakai sebagai tempat menyimpan diagnosis atau berkas medis mentah.

## Tujuan dan Prinsip

- Pasien menjadi pihak yang mengatur pemberian dan pencabutan izin dokter.
- Dokumen dienkripsi sebelum dikirim ke penyimpanan IPFS.
- Commitment/hash membantu memeriksa apakah dokumen yang diterima sesuai dengan dokumen yang dicatat.
- Aktivitas penting dapat ditelusuri melalui event blockchain dan Audit Trail aplikasi.
- AI membantu ekstraksi dan pencarian informasi; hasilnya harus diperiksa manusia.
- Data pribadi dan isi medis tidak ditulis sebagai teks terbuka di blockchain.

## Galeri Aplikasi

Screenshot berada di [`docs/screenshots`](docs/screenshots/). Klik gambar untuk melihat ukuran penuh di GitHub.

### Tampilan umum

| Login | Registrasi |
|---|---|
| ![Halaman login MediChain](docs/screenshots/general/login.png) | ![Halaman registrasi MediChain](docs/screenshots/general/register.png) |

### Dashboard Pasien

| Ringkasan pasien | Timeline rekam medis | Akses dokter |
|---|---|---|
| ![Dashboard pasien](docs/screenshots/pasien/dashboardpasien.png) | ![Pemeriksaan rekam medis](docs/screenshots/pasien/fiturcekrekammedispasien.png) | ![Pengelolaan akses dokter pasien](docs/screenshots/pasien/fituraksesdokterolehpasien.png) |

| Janji temu | Profil kesehatan | Resep digital |
|---|---|---|
| ![Janji temu pasien](docs/screenshots/pasien/fiturjanjitemupasien.png) | ![Profil kesehatan pasien](docs/screenshots/pasien/fiturprofilkesehatanpasien.png) | ![Resep pasien](docs/screenshots/pasien/fiturreseppasien.png) |

| QR berbagi akses | AI Health Assistant |
|---|---|
| ![QR akses pasien](docs/screenshots/pasien/fiturQRpasien.png) | ![AI Health Assistant pasien](docs/screenshots/pasien/fituraihealth.png) |

### Dashboard Dokter

| Ringkasan dokter | Pasien berizin | AI Document Scanner |
|---|---|---|
| ![Dashboard dokter](docs/screenshots/dokter/dashboarddokter.png) | ![Akses pasien dokter](docs/screenshots/dokter/fituraksespasiendaridokter.png) | ![AI scanner dokter](docs/screenshots/dokter/fiturAIscannerdokter.png) |

| Jadwal konsultasi | Resep digital | Profil pasien |
|---|---|---|
| ![Janji temu dokter](docs/screenshots/dokter/fiturjanjidokter.png) | ![Resep dokter](docs/screenshots/dokter/fiturresepdokter.png) | ![Profil pasien untuk dokter](docs/screenshots/dokter/fiturprofilpasiendidokter.png) |

| Pindai QR | Emergency Access |
|---|---|
| ![Pindai QR oleh dokter](docs/screenshots/dokter/fiturpindaiQRpasienolehdokter.png) | ![Emergency access dokter](docs/screenshots/dokter/fituremergencydokter.png) |

### Dashboard Admin

| Dashboard admin | Verifikasi dokter | Audit Trail |
|---|---|---|
| ![Dashboard admin](docs/screenshots/admin/dashboardadmin.png) | ![Verifikasi dokter](docs/screenshots/admin/verifdokterolehadmin.png) | ![Audit Trail admin](docs/screenshots/admin/fiturauditadmin.png) |

| Emergency Access | Permintaan penghapusan record | Notifikasi admin |
|---|---|---|
| ![Emergency access admin](docs/screenshots/admin/fituremergencyadmin.png) | ![Penghapusan record admin](docs/screenshots/admin/fiturhapusrecordolehadmin.png) | ![Notifikasi admin](docs/screenshots/admin/fiturnotifikasiadmin.png) |

## Fitur

### Rekam medis dan kontrol akses

- Dokter yang terverifikasi dapat mengunggah record untuk pasien yang memberi izin.
- Pasien melihat timeline, detail transaksi, status tanda tangan, metadata, dan versi record.
- Izin akses dokter tersimpan on-chain; kontrak mendukung izin berbatas waktu.
- Permintaan akses QR tetap membutuhkan persetujuan pasien sebelum izin diberikan.
- Pasien dapat mengajukan peninjauan/penonaktifan record. Status revoked tidak menghapus transaksi lama atau ciphertext IPFS.

### Manajemen kesehatan

- Appointment antara pasien dan dokter dengan status seperti Pending, Accepted, Rejected, Rescheduled, Cancelled, dan Completed.
- Resep digital dibuat dokter untuk pasien berizin dan dapat dilihat pasien.
- Health Profile menyimpan golongan darah, alergi, riwayat, kondisi kronis, obat rutin, kontak darurat, dan catatan.
- Notification Center menampilkan notifikasi aplikasi sesuai pengguna.
- Audit Trail mencatat aktivitas tertentu dengan waktu, pelaku, wallet, dan hash transaksi jika tersedia.

### Tiga fitur AI

1. **AI Medical Document Scanner:** layanan Python lokal menggunakan Tesseract untuk membaca PDF/gambar. OCR menghasilkan draf; dokter memeriksa, mengoreksi, mengaitkan hasil ke record, lalu menyimpan hasil ekstraksi yang sudah ditinjau.
2. **AI Medical Summary:** dokter melihat ringkasan terstruktur dari record, hasil OCR yang sudah ditinjau, profil kesehatan, resep, dan referensi transaksi. Ringkasan mendukung filter tanggal dan bukan interpretasi klinis.
3. **AI Health Assistant:** pasien mencari record serta memperoleh penjelasan beberapa istilah umum. Implementasi saat ini menggunakan kamus istilah dan pencarian lokal, **bukan model generatif/LLM**.

AI tidak menetapkan diagnosis, tidak menentukan pengobatan/dosis, dan tidak menggantikan konsultasi dokter. Detail implementasi ada di [`docs/AI_FEATURES.md`](docs/AI_FEATURES.md).

## Alur Penggunaan

### Dokter mengunggah record

```text
Dokter login dan menghubungkan wallet
        ↓
Dokter terdaftar serta diverifikasi admin di blockchain
        ↓
Pasien memberikan izin kepada wallet dokter
        ↓
Dokter memilih pasien dan berkas
        ↓
Frontend mengenkripsi berkas → Pinata/IPFS menyimpan ciphertext
        ↓
Blockchain mencatat commitment dan event record
        ↓
Backend menyimpan metadata/CID/transaksi ke MySQL
```

### Pasien mengakses dokumen

```text
Pasien membuka timeline dan memilih record
        ↓
Memasukkan passphrase untuk record tersebut
        ↓
Frontend mengambil ciphertext dari IPFS
        ↓
Dekripsi AES-GCM → menghitung Keccak-256 → membandingkan commitment
        ↓
Jika verifikasi cocok, berkas asli dapat diunduh
```

### Pasien membuat izin akses

Pasien memilih dokter, menentukan durasi yang tersedia, lalu mengonfirmasi transaksi lewat wallet. Kontrak memeriksa status verifikasi dokter dan menyimpan izin serta expiry. Ketika dokter mencoba mengakses data, backend memeriksa izin blockchain kembali.

## Arsitektur dan Struktur Proyek

```text
MediChain/
├── ai-service/                 # FastAPI OCR lokal (Python)
│   ├── main.py                 # Endpoint scan dan parser laboratorium
│   └── requirements.txt
├── backend/                    # REST API Express + MySQL
│   ├── src/config/             # Koneksi database
│   ├── src/controllers/        # Logika API per fitur
│   ├── src/middleware/         # JWT dan pembatasan role
│   ├── src/routes/             # Pemetaan endpoint API
│   ├── src/services/           # Blockchain, audit, dan layanan bersama
│   ├── .env.example            # Contoh konfigurasi (tanpa secret)
│   └── createAdmin.js           # Bootstrap admin pengembangan
├── blockchain/
│   ├── contracts/MedicalRecord.sol
│   ├── scripts/deploy.js
│   ├── test/
│   └── hardhat.config.js
├── docs/                       # Dokumentasi dan screenshot
├── frontend/                   # React + Vite
│   └── src/
│       ├── components/         # Workspace dan komponen UI
│       ├── context/             # State autentikasi
│       ├── pages/               # Login, register, dashboard
│       └── services/            # API, wallet, dan blockchain client
├── package.json                # Script pengembangan root
└── README.md
```

### Komunikasi antarkomponen

```mermaid
flowchart LR
  P[Pasien / Dokter / Admin] --> F[React Frontend]
  F -->|REST + JWT| B[Express Backend]
  F -->|Transaksi / baca chain| M[MetaMask]
  M --> H[Hardhat JSON-RPC :8545]
  B -->|RPC provider| H
  H --> S[MedicalRecord.sol]
  B --> D[(MySQL)]
  F -->|Ciphertext upload/download| I[Pinata / IPFS]
  B -->|OCR lokal + service token| O[FastAPI :8001]
  O --> T[Tesseract + Poppler]
```

## Cara Kerja Blockchain

### Peran blockchain di MediChain

Smart contract `MedicalRecord.sol` mengatur dan mencatat hal yang perlu diverifikasi bersama:

- Registrasi dan verifikasi wallet dokter.
- Permission pasien-dokter serta waktu kedaluwarsa jika izin sementara digunakan.
- Pencatatan commitment record, dokter pengunggah, waktu, dan event transaksi.
- Histori versi dan status penonaktifan/revocation sesuai versi contract yang digunakan.
- Emergency access dengan batasan waktu/alasan pada implementasi kontrak.

Database menyimpan metadata aplikasi dan IPFS menyimpan berkas terenkripsi. Alamat wallet bertindak sebagai identitas transaksi; backend tetap mengaitkannya dengan akun pengguna dan memeriksa role/izin.

### Commitment dan integritas

Saat record disiapkan, frontend menghitung commitment berbasis hash untuk isi berkas. Kontrak mencatat commitment tersebut, bukan dokumen medisnya. Saat unduh, aplikasi mengambil ciphertext, mendekripsi menggunakan passphrase pasien, lalu menghitung ulang hash. Ketidakcocokan berarti file tidak boleh dipercaya sebagai salinan yang sesuai dengan commitment.

### Transaksi dan event

Perubahan status—misalnya registrasi dokter, pemberian izin, pencabutan izin, penambahan record, dan revocation—dilakukan sebagai transaksi wallet. Transaksi masuk ke blok dan menghasilkan hash. Event membantu backend/frontend membangun histori aktivitas. Baca status kontrak dapat dilakukan sebagai pemanggilan view tanpa transaksi.

### Izin berbatas waktu

Izin biasa dan izin sementara berbeda berdasarkan nilai expiry yang disimpan kontrak. `0` biasanya menandakan izin tanpa batas waktu; nilai timestamp masa depan menandakan izin berakhir pada waktu tersebut. Mengubah pilihan durasi di UI tidak memperbarui izin lama; izin lama perlu dicabut dan diberikan kembali dengan durasi yang diinginkan.

### Jaringan pengembangan

Hardhat localhost memakai Chain ID `31337` dan RPC `http://127.0.0.1:8545`. Akun yang dicetak Hardhat adalah akun uji lokal. Node Hardhat menyimpan state di memori; menghentikannya dapat menghapus state dan deployment. Deploy ulang kontrak, perbarui address di backend/frontend, dan gunakan data lokal hanya untuk demonstrasi.

## Penyimpanan dan Keamanan Dokumen

- Berkas dienkripsi di sisi aplikasi sebelum dikirim ke Pinata/IPFS.
- AES-256-GCM memberikan enkripsi dan autentikasi ciphertext.
- PBKDF2-SHA-256 menurunkan kunci dari passphrase.
- Keccak-256 dipakai untuk commitment/verifikasi integritas.
- Blockchain menyimpan hash/commitment dan status yang diperlukan, bukan plaintext rekam medis.
- Backend memakai JWT untuk sesi dan otorisasi role; pemeriksaan izin pasien-dokter dilakukan terhadap blockchain pada jalur akses terkait.
- Tanda tangan wallet atas record adalah signature kriptografis dan tidak otomatis merupakan tanda tangan elektronik tersertifikasi.

**Penting:** mencabut akses di blockchain tidak menghapus salinan yang sudah diunduh atau otomatis menghapus ciphertext/CID dari IPFS. Jangan masukkan data medis plaintext ke transaksi, log publik, QR code, atau source code.

## Menjalankan Secara Lokal

### Prasyarat

- Node.js/npm (disarankan Node.js 22 untuk toolchain Vite saat ini).
- XAMPP MySQL dan database MediChain dengan tabel dasar `users` sudah disiapkan.
- MetaMask untuk jaringan Hardhat lokal.
- Python 3.10+ untuk OCR.
- Tesseract OCR dan Poppler diperlukan jika ingin membaca gambar/PDF; OCR dapat dinonaktifkan dengan tidak menjalankan service-nya.
- Akun Pinata/JWT diperlukan untuk upload file IPFS.

### Instal dependensi

Di root proyek:

```cmd
cd C:\xampp\htdocs\MediChain
npm install
npm --prefix blockchain install
npm --prefix backend install
npm --prefix frontend install
```

### Atur konfigurasi lokal

Salin contoh backend jika belum ada:

```cmd
copy backend\.env.example backend\.env
```

Lengkapi nilai MySQL dan tambahkan variabel blockchain, frontend, Pinata, serta OCR. Jangan commit `.env`.

`backend/.env` setidaknya memerlukan:

```env
PORT=5000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=medichain_db
FRONTEND_URL=http://localhost:5173
JWT_SECRET=ganti-dengan-secret-acak-panjang
BLOCKCHAIN_RPC_URL=http://127.0.0.1:8545
MEDICAL_RECORD_CONTRACT_ADDRESS=alamat-kontrak-setelah-deploy
PINATA_JWT=token-pinata-jika-menggunakan-IPFS
AI_SERVICE_URL=http://127.0.0.1:8001
AI_SERVICE_TOKEN=secret-yang-sama-dengan-service-OCR
```

`frontend/.env`:

```env
VITE_API_URL=http://localhost:5000/api
VITE_MEDICAL_RECORD_CONTRACT_ADDRESS=alamat-kontrak-setelah-deploy
```

### Jalankan service

Buka terminal terpisah untuk setiap proses.

**Terminal 1 — MySQL:** Start MySQL di XAMPP Control Panel.

**Terminal 2 — Hardhat node:**

```cmd
cd C:\xampp\htdocs\MediChain
npm run dev:blockchain
```

**Terminal 3 — deploy kontrak:**

```cmd
cd C:\xampp\htdocs\MediChain\blockchain
npm run deploy
```

Salin `Contract Address` dari output deploy ke kedua file `.env`. Jika node Hardhat dimulai ulang, deploy ulang dan perbarui address.

**Terminal 4 — backend:**

```cmd
cd C:\xampp\htdocs\MediChain\backend
npm run dev
```

API berjalan di `http://localhost:5000`; status database: `http://localhost:5000/api/health`; status blockchain: `http://localhost:5000/api/blockchain/status`.

Untuk database pengembangan yang sudah memiliki tabel dasar `users`, akun admin demo (jika belum ada) dapat dibuat dari terminal backend:

```cmd
node createAdmin.js
```

Script saat ini memakai kredensial demo yang tertulis di source. **Gunakan hanya di mesin lokal, jangan gunakan kredensial default untuk server publik**, dan ubah script/akun sesuai kebijakan proyek sebelum deployment.

**Terminal 5 — frontend:**

```cmd
cd C:\xampp\htdocs\MediChain\frontend
npm run dev
```

Buka alamat Vite yang ditampilkan terminal, biasanya `http://localhost:5173`.

**Terminal 6 — OCR (opsional):**

```cmd
cd /d C:\xampp\htdocs\MediChain\ai-service
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
set "TESSERACT_CMD=C:\Program Files\Tesseract-OCR\tesseract.exe"
set "POPPLER_PATH=C:\poppler-26.09.0\Library\bin"
set "AI_SERVICE_TOKEN=nilai-yang-sama-dengan-backend-env"
uvicorn main:app --host 127.0.0.1 --port 8001
```

Sesuaikan lokasi Tesseract dan Poppler dengan lokasi instalasimu. Setelah mengubah `AI_SERVICE_TOKEN` di backend, restart backend dan service OCR. Panduan lengkap ada di [`docs/AI_FEATURES.md`](docs/AI_FEATURES.md).

### MetaMask untuk Hardhat

Tambahkan jaringan lokal bila belum ada:

- Network name: Hardhat Local
- RPC URL: `http://127.0.0.1:8545`
- Chain ID: `31337`
- Currency: ETH

Untuk uji lokal, import akun dari output Hardhat ke MetaMask. Gunakan hanya private key uji Hardhat, jangan pernah import wallet pribadi bernilai asli ke development chain. Script deploy menggunakan signer index 2 sebagai contract owner/admin; ikuti akun hasil output Hardhat yang sesuai.

## Keterbatasan dan Roadmap

### Keterbatasan saat ini

- Hardhat lokal bersifat sementara; MySQL tetap menyimpan metadata dan chat setelah server restart. Jika chain di-reset, deployment dan state transaksi hilang sementara beberapa baris MySQL dapat tertinggal.
- OCR bergantung pada kualitas scan, bahasa Tesseract, tata letak tabel, dan parser parameter yang didukung. Dokter harus mengoreksi hasil.
- AI Health Assistant adalah pencarian lokal/kamus istilah, bukan LLM.
- Data medis memerlukan kebijakan retensi, backup, pengelolaan kunci, dan kontrol akses sesuai kebutuhan institusi sebelum penerapan produksi.
- IPFS bersifat content-addressed; pencabutan permission bukan mekanisme penghapusan salinan.

### Arah pengembangan

1. **Mutu dan pengujian:** uji OCR pada variasi dokumen, tambah evaluasi parser dan API, dan ukur akurasi per kolom.
2. **Interoperabilitas:** impor/ekspor standar FHIR/HL7 serta pemetaan Patient, Encounter, Observation, MedicationRequest, dan DocumentReference.
3. **AI kontekstual dengan privasi:** retrieval Indonesia/Inggris yang lebih baik, kutipan sumber terstruktur, dan opsi model lokal/terkendali dengan persetujuan eksplisit.
4. **Analitik kesehatan:** grafik tren hasil lab yang telah diverifikasi, tanpa menyajikannya sebagai diagnosis otomatis.
5. **Keselamatan resep:** referensi obat terkurasi dan pemeriksaan interaksi yang dapat diaudit serta tetap membutuhkan penilaian klinisi.
6. **Siap produksi:** jaringan blockchain persisten, deployment aman, monitoring, backup, disaster recovery, threat modeling, dan evaluasi kepatuhan.

## Dokumentasi Tambahan

- [Dokumentasi lengkap MediChain](docs/MediChain_Project_Overview.md)
- [Setup fitur AI dan OCR](docs/AI_FEATURES.md)
- [Setup IPFS/Pinata](docs/IPFS_SETUP.md)

---

Dibuat sebagai proyek pengembangan MediChain. Tinjau ulang konfigurasi, kontrol keamanan, privasi, dan kebijakan retensi sebelum memakai sistem dengan data kesehatan nyata.
