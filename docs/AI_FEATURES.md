# Fitur AI MediChain

Implementasi ini menambahkan OCR dokumen medis, ringkasan terstruktur pasien, dan asisten kesehatan berbasis istilah/sumber record.

## Menjalankan OCR lokal

1. Pasang Python 3.10+, Tesseract OCR, dan Poppler (dibutuhkan untuk PDF). Pastikan `tesseract` dan `pdftoppm` tersedia di `PATH`.
2. Di `ai-service`, buat virtual environment lalu pasang dependensi dan jalankan layanan:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:AI_SERVICE_TOKEN = "secret-random-panjang-yang-sama-dengan-backend"
uvicorn main:app --host 127.0.0.1 --port 8001
```

3. Tambahkan pengaturan berikut di `backend/.env` (gunakan nilai secret acak yang sama):

```env
AI_SERVICE_URL=http://127.0.0.1:8001
AI_SERVICE_TOKEN=secret-random-panjang-yang-sama-dengan-ai-service
```

Untuk PDF di Windows, jalankan layanan OCR dengan `POPPLER_PATH` menunjuk ke folder yang berisi `pdftoppm.exe`, misalnya `C:\poppler-26.09.0\Library\bin`. Jika Python tidak menemukan Tesseract, set `TESSERACT_CMD` ke path lengkap `tesseract.exe`, misalnya `C:\Program Files\Tesseract-OCR\tesseract.exe`.

4. Jalankan MediChain seperti biasa. Menu AI tersedia bagi dokter dan pasien. Jika AI service tidak berjalan, fitur OCR memberi pesan layanan tidak tersedia; halaman ringkasan dan assistant masih dapat digunakan.

## Batas dan perlindungan

- OCR hanya membuat draf. Dokter harus memeriksa setiap nilai dan menghubungkannya ke record pasien sebelum penyimpanan.
- File OCR dikirim ke layanan lokal dan diproses di memori; layanan OCR tidak menulis file ke disk atau mengirim isi dokumen ke penyedia AI eksternal.
- Ringkasan bersifat terstruktur dari metadata, profil, resep dan hasil OCR yang telah ditinjau. Ringkasan bukan interpretasi klinis.
- Assistant saat ini memakai penjelasan istilah umum dan pencarian lokal pada record yang tidak dicabut. Ini bukan model generatif dan tidak memberi diagnosis, rekomendasi pengobatan, atau dosis.
- Akses dokter diperiksa kembali terhadap izin aktif di blockchain. Aktivitas pemindaian, peninjauan dan pembukaan ringkasan dicatat ke Audit Trail.
- Hasil OCR tersimpan di MySQL, bukan blockchain. Blockchain tetap menyimpan commitment dan histori record sesuai mekanisme MediChain.
- Fitur ini perlu diuji dengan format hasil laboratorium yang dipakai institusi sebelum digunakan untuk proses klinis.
