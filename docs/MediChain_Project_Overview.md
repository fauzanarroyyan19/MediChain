# MediChain — Dokumentasi Proyek

> **Blockchain-Based Medical Record Management System**
> Dokumentasi gambaran proyek, fitur, struktur, keamanan, dan arah pengembangan.

## 1. Ringkasan Proyek

MediChain adalah aplikasi manajemen rekam medis digital yang menggabungkan aplikasi web, blockchain, dan penyimpanan berkas terenkripsi. Pasien mengelola izin akses terhadap rekam medisnya, dokter yang berwenang dapat mengunggah dan membaca catatan, sedangkan administrator memantau verifikasi dan aktivitas platform.

Informasi kesehatan lengkap **tidak disimpan langsung di blockchain**. Berkas medis dienkripsi sebelum disimpan ke IPFS melalui Pinata. Blockchain mencatat commitment/hash dan aktivitas yang diperlukan untuk verifikasi. Basis data MySQL menyimpan akun, metadata aplikasi, ekstraksi OCR yang sudah ditinjau, dan data operasional lainnya.

MediChain saat ini ditujukan sebagai proyek pengembangan dan demonstrasi. Jaringan Hardhat lokal bukan jaringan produksi; data chain lokal dapat hilang ketika node dihentikan.

## 2. Tujuan dan Prinsip

- Menempatkan pasien sebagai pengendali pemberian dan pencabutan akses dokter.
- Menjaga kerahasiaan berkas dengan enkripsi sebelum unggah.
- Menyediakan pemeriksaan integritas dengan hash/commitment.
- Membuat aktivitas penting dapat ditelusuri melalui event blockchain dan Audit Trail aplikasi.
- Memisahkan data medis dari informasi publik blockchain.
- Memakai AI sebagai alat bantu administrasi informasi, bukan pengganti tenaga medis.

## 3. Teknologi

| Lapisan | Teknologi |
|---|---|
| Frontend | React, Vite, Tailwind CSS, Ethers.js, MetaMask |
| Backend | Node.js, Express, MySQL, JWT |
| Smart contract | Solidity, Hardhat, OpenZeppelin |
| Penyimpanan dokumen | IPFS melalui Pinata |
| Keamanan dokumen | AES-256-GCM, PBKDF2-SHA-256, Keccak-256 |
| OCR lokal | Python, FastAPI, Tesseract OCR, Pillow, pdf2image, Poppler |

## 4. Peran dan Fitur

### 4.1 Pasien

- Membuat akun, masuk, menghubungkan wallet, dan mengelola identitas akun.
- Melihat timeline rekam medis, metadata blockchain, status tanda tangan, serta dokumen yang tersedia.
- Mengunduh dokumen dengan passphrase record; sistem mendekripsi dan memeriksa hash setelah unduhan.
- Memberi, membatasi durasi, atau mencabut izin dokter sesuai dukungan kontrak dan alur aplikasi.
- Meninjau permintaan akses yang diajukan melalui QR.
- Mengelola profil kesehatan seperti golongan darah, alergi, riwayat, penyakit kronis, dan obat rutin.
- Melihat resep digital, janji temu, notifikasi, Audit Trail yang tersedia bagi pasien, dan hasil OCR dokter pada detail record.
- Mengajukan peninjauan/penonaktifan record. Persetujuan permintaan tidak menghapus histori blockchain atau salinan IPFS.
- Memakai AI Health Assistant untuk penjelasan istilah umum dan pencarian sumber record.

### 4.2 Dokter

- Menghubungkan wallet serta menjalani registrasi dan verifikasi on-chain oleh admin.
- Melihat pasien yang memberikan akses aktif.
- Mengunggah berkas rekam medis terenkripsi dan metadata pemeriksaan.
- Menandatangani record dengan wallet dan menambahkan versi baru beserta alasan perubahan.
- Mengakses profil dan record pasien sesuai izin blockchain yang masih aktif.
- Mengelola appointment dan menerbitkan resep digital.
- Mengajukan penonaktifan record sesuai alur persetujuan.
- Memakai AI Medical Document Scanner untuk membuat draf ekstraksi, kemudian meninjau dan mengoreksi hasil sebelum penyimpanan.
- Melihat ringkasan terstruktur dan sumber data pasien selama izin akses berlaku.

### 4.3 Admin

- Memantau ringkasan sistem dan pengguna.
- Meninjau serta memverifikasi dokter melalui mekanisme blockchain.
- Memproses permintaan penonaktifan record dan meninjau permintaan emergency access sesuai implementasi aplikasi.
- Melihat Audit Trail dan notifikasi administrasi.

## 5. Fitur Keamanan dan Blockchain

### 5.1 Akses pasien-dokter

Izin disimpan pada smart contract berdasarkan pasangan wallet pasien dan dokter. Backend memeriksa status dokter serta izin on-chain sebelum memberikan data sensitif. Kontrak mendukung masa berlaku izin pada implementasi yang digunakan; setiap pemanggil aplikasi tetap perlu memastikan izin belum kedaluwarsa.

### 5.2 Record dan versi

Record direpresentasikan di blockchain dengan commitment dan event. Metadata seperti CID, kategori, deskripsi, signature, dan relasi versi disimpan di MySQL. Revisi membuat versi baru dan menjaga histori versi sebelumnya. Penonaktifan menggunakan status/revocation, bukan menghapus transaksi lama.

### 5.3 Tanda tangan digital

Wallet dokter menandatangani pesan yang mengikat identitas transaksi dan commitment. Sistem memverifikasi signature terhadap wallet dokter yang tercatat. Ini adalah signature kriptografis wallet; **bukan pernyataan bahwa signature tersebut merupakan tanda tangan elektronik tersertifikasi**.

### 5.4 Audit Trail

Event blockchain menyediakan jejak transaksi on-chain. Tabel `audit_logs` mencatat aktivitas aplikasi seperti akses record, pembukaan ringkasan, pemindaian OCR, peninjauan hasil OCR, pemberian/pencabutan akses, dan alur keamanan lainnya jika event tersebut telah terhubung pada controller terkait.

### 5.5 Emergency access

Alur emergency access mensyaratkan permintaan, alasan, persetujuan sesuai mekanisme yang dibangun, batas waktu, serta pencatatan aktivitas. Emergency access merupakan pengecualian dengan konsekuensi privasi dan perlu ditinjau admin.

## 6. Tiga Fitur AI

### 6.1 AI Medical Document Scanner

1. Dokter memilih pasien yang memiliki izin akses aktif.
2. Dokter mengunggah PDF atau gambar ke backend.
3. Backend memeriksa role dan izin blockchain, lalu meneruskan berkas ke layanan OCR lokal.
4. Tesseract mengekstrak teks; parser membuat draf hasil pemeriksaan yang dikenali.
5. Dokter memeriksa dan mengoreksi nama tes, nilai, satuan, serta rentang rujukan.
6. Dokter memilih record blockchain yang sesuai dan menyimpan ekstraksi yang telah ditinjau.
7. Pasien dapat melihat hasil tersebut pada **Timeline Rekam Medis → Lihat detail**.

Parser memiliki dukungan label laboratorium umum, termasuk parameter CBC dan beberapa pemeriksaan kimia/lipid. Hasil tetap bergantung pada kualitas dokumen dan data bahasa Tesseract yang terpasang (`eng`, dan `ind` jika tersedia). Tabel atau istilah yang tidak dikenali harus dikoreksi atau dilengkapi dokter.

### 6.2 AI Medical Summary

Dokter dapat menyaring ringkasan berdasarkan tanggal. Ringkasan menampilkan hitungan kategori, diagnosis yang tercatat, timeline record, hasil ekstraksi yang telah ditinjau, profil kesehatan, resep, dan referensi transaksi. Record yang dicabut tidak dimasukkan.

Ringkasan ini merupakan penyajian data terstruktur dari database dan blockchain, bukan interpretasi klinis atau model prediksi.

### 6.3 AI Health Assistant

Pasien dapat bertanya tentang beberapa istilah kesehatan umum atau meminta pencarian record. Assistant memeriksa record pasien yang tidak dicabut, menampilkan nilai sumber yang relevan jika ditemukan, dan menyertakan referensi transaksi. Riwayat percakapan disimpan per akun pasien.

**Batas implementasi saat ini:** assistant menggunakan kamus istilah dan pencarian lokal berbasis teks. Ini belum memakai LLM/model generatif, belum memahami percakapan seperti dokter, dan tidak boleh digunakan untuk diagnosis, rekomendasi pengobatan, atau keputusan dosis.

### 6.4 Batas privasi AI

- OCR berjalan pada service lokal dan tidak mengirim dokumen ke penyedia AI eksternal.
- Upload diproses di memori layanan; aplikasi tidak sengaja menyimpan file mentah OCR di disk layanan.
- Hasil OCR disimpan di MySQL setelah dokter meninjau; bukan isi medis mentah yang dicatat di blockchain.
- Pastikan host OCR hanya dapat diakses dari jaringan tepercaya dan lindungi `AI_SERVICE_TOKEN`.

## 7. Alur Data Utama

### Unggah record

```text
Dokter → autentikasi JWT → pemeriksaan izin blockchain
       → enkripsi file di frontend → Pinata/IPFS
       → commitment + transaksi blockchain
       → metadata transaksi di MySQL
```

### Akses dan unduh oleh pasien

```text
Pasien → membuka timeline → mengambil metadata dan event blockchain
       → memasukkan passphrase → mengambil ciphertext IPFS
       → dekripsi AES-GCM → verifikasi Keccak-256 → unduh file asli
```

### OCR dan ekstraksi

```text
Dokter berizin → unggah dokumen → backend memeriksa izin on-chain
              → FastAPI/Tesseract lokal → draf OCR
              → dokter meninjau → ekstraksi terkait transaction hash di MySQL
              → pasien membuka detail record
```

## 8. Struktur Direktori

```text
MediChain/
├── ai-service/                 # FastAPI OCR lokal
│   ├── main.py                 # Endpoint OCR dan parser hasil
│   ├── requirements.txt        # Dependensi Python
│   └── README.md               # Setup service OCR
├── backend/
│   ├── src/
│   │   ├── config/             # Koneksi MySQL
│   │   ├── controllers/        # Auth, record, appointment, AI, dll.
│   │   ├── middleware/         # JWT dan otorisasi role
│   │   ├── routes/             # Endpoint API
│   │   └── services/           # Blockchain, audit, dan utilitas
│   ├── .env                    # Konfigurasi lokal, jangan dibagikan
│   └── createAdmin.js          # Membuat admin awal
├── blockchain/
│   ├── contracts/              # MedicalRecord.sol
│   ├── scripts/deploy.js       # Deploy ke Hardhat localhost
│   ├── test/                   # Pengujian smart contract
│   └── hardhat.config.js
├── docs/                       # Dokumentasi proyek dan setup
└── frontend/
    ├── src/components/         # UI fitur dan komponen
    ├── src/pages/              # Halaman aplikasi, termasuk Dashboard
    ├── src/services/           # API, wallet, dan blockchain client
    └── .env                    # Konfigurasi Vite lokal
```

## 9. Cara Menjalankan untuk Pengembangan Lokal

Jalankan service pada terminal terpisah dan biarkan terminal server tetap terbuka.

1. Start **MySQL** dari XAMPP dan pastikan database serta skema akun MediChain telah dibuat.
2. Jalankan node lokal:

   ```cmd
   cd C:\xampp\htdocs\MediChain
   npm run dev:blockchain
   ```

3. Di terminal lain, deploy kontrak:

   ```cmd
   cd C:\xampp\htdocs\MediChain\blockchain
   npm run deploy
   ```

   Salin alamat kontrak hasil deploy ke `MEDICAL_RECORD_CONTRACT_ADDRESS` pada `backend/.env` dan `VITE_MEDICAL_RECORD_CONTRACT_ADDRESS` pada `frontend/.env`. Backend memakai `BLOCKCHAIN_RPC_URL=http://127.0.0.1:8545`.

4. Jalankan backend:

   ```cmd
   cd C:\xampp\htdocs\MediChain\backend
   npm run dev
   ```

5. Jalankan frontend:

   ```cmd
   cd C:\xampp\htdocs\MediChain\frontend
   npm run dev
   ```

6. Untuk OCR, aktifkan virtual environment di `ai-service`, atur `TESSERACT_CMD`, `POPPLER_PATH`, dan `AI_SERVICE_TOKEN`, lalu jalankan:

   ```cmd
   cd /d C:\xampp\htdocs\MediChain\ai-service
   .venv\Scripts\activate
   uvicorn main:app --host 127.0.0.1 --port 8001
   ```

   `AI_SERVICE_TOKEN` pada service OCR harus sama dengan yang ada di `backend/.env`. Setelah mengubah `.env`, restart backend. Detail OCR tersedia di [AI_FEATURES.md](AI_FEATURES.md), detail IPFS di [IPFS_SETUP.md](IPFS_SETUP.md).

> Hardhat localhost menyimpan state sementara. Jika node dihentikan, data chain hilang dan kontrak perlu di-deploy ulang. Setelah redeploy, perbarui alamat kontrak di kedua `.env` dan restart backend/frontend.

## 10. Konfigurasi Penting

### Backend `.env`

Contoh variabel yang dibutuhkan; isi berdasarkan konfigurasi lokal:

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
MEDICAL_RECORD_CONTRACT_ADDRESS=alamat-hasil-deploy
PINATA_JWT=token-pinata-jika-upload-IPFS-digunakan
AI_SERVICE_URL=http://127.0.0.1:8001
AI_SERVICE_TOKEN=secret-yang-sama-dengan-service-OCR
```

### Frontend `.env`

```env
VITE_API_URL=http://localhost:5000/api
VITE_MEDICAL_RECORD_CONTRACT_ADDRESS=alamat-hasil-deploy
```

Jangan commit file `.env`, JWT, token Pinata, private key, atau passphrase. Gunakan hanya akun Hardhat untuk pengujian lokal.

## 11. Keterbatasan dan Risiko yang Perlu Dipahami

- Blockchain lokal bukan persistence/backup; state hilang saat node di-reset.
- Pencabutan izin aplikasi tidak menghapus ciphertext IPFS, salinan yang sudah diunduh, atau CID yang telah diketahui pihak lain.
- Keamanan dekripsi bergantung pada passphrase dan pengelolaan kunci di perangkat pengguna.
- Metadata aplikasi di MySQL perlu backup dan kontrol akses yang layak.
- OCR dapat salah membaca angka, tanda koma, unit, label, atau rentang rujukan. Verifikasi dokter wajib.
- Rekam medis dan resep memerlukan kebijakan retensi institusi serta kepatuhan peraturan yang berlaku sebelum penggunaan nyata.
- Konfigurasi Hardhat account, contract address, chain ID, MetaMask, RPC, dan nonce harus konsisten.
- Versi ini adalah prototipe/pengembangan lokal, belum dinyatakan siap untuk produksi klinis.

## 12. Roadmap Inovasi

### Tahap 1 — Stabilitas dan mutu data

- Uji OCR pada kumpulan dokumen sintetis dan format laboratorium yang beragam; ukur precision/recall per kolom.
- Tambahkan koreksi manual yang lebih praktis: tambah/hapus baris, format nilai, deteksi unit, dan jejak siapa yang memvalidasi.
- Buat suite pengujian parser dan API, termasuk tabel multiline, hasil tanpa rentang, koma desimal, dan dokumen buram.
- Lengkapi status fitur dan pesan error/observability untuk Node, MySQL, blockchain, IPFS, dan OCR.

### Tahap 2 — Assistant yang lebih kontekstual dengan kontrol privasi

- Tambahkan retrieval yang memahami sinonim Indonesia/Inggris dan percakapan lanjutan.
- Jika diperlukan model generatif, jadikan provider opsional, minta persetujuan yang jelas, batasi konteks minimum, lindungi PHI, dan sediakan deployment lokal.
- Paksa jawaban menyertakan sumber record; jika data tidak cukup, assistant harus menyatakan tidak tahu.
- Tetapkan evaluasi keselamatan agar model tidak mendiagnosis, meresepkan, atau mengarang hasil.

### Tahap 3 — Interoperabilitas dan kendali akses

- Ekspor/impor standar FHIR untuk Patient, Practitioner, Encounter, Observation, MedicationRequest, dan DocumentReference.
- Perkuat manajemen consent, expiry, audit akses, notifikasi, serta review akses darurat.
- Tambahkan enkripsi envelope dan strategi rotasi/recovery key yang tidak mengirim passphrase ke backend.

### Tahap 4 — Analitik dan layanan klinis pendukung

- Grafik tren hasil laboratorium dari hasil yang telah diverifikasi tenaga medis, dengan referensi rentang laboratorium.
- Pemeriksaan interaksi obat hanya dengan sumber obat yang terkurasi, aturan yang dapat diaudit, dan review profesional.
- Rekomendasi janji temu bersifat administratif, bukan rekomendasi diagnosis atau terapi.
- Uji keamanan, performa, backup, deployment, pemulihan bencana, dan kepatuhan sebelum berpindah dari Hardhat lokal.

## 13. Kesimpulan

MediChain menggabungkan kendali akses pasien, penyimpanan berkas terenkripsi, bukti integritas blockchain, workflow manajemen kesehatan, dan alat bantu AI lokal. Nilai utama sistem adalah privasi, auditabilitas, dan keterhubungan data. Pengembangan berikutnya sebaiknya memprioritaskan mutu OCR dan pengujian, proteksi kunci, interoperability, serta evaluasi keselamatan AI sebelum menambah otomasi klinis.
