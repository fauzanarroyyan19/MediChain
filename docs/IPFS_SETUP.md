# Penyimpanan rekam medis terenkripsi

## Konfigurasi

1. Buat API key Pinata yang memiliki izin upload file (`org:files:write`).
2. Tambahkan JWT API key hanya ke `backend/.env`:

   ```env
   PINATA_JWT=isi_jwt_pinata_di_sini
   ```

3. Restart backend. Jangan menaruh JWT di `frontend/.env` atau mengirimkannya ke browser.
4. Opsional, atur gateway di `frontend/.env`:

   ```env
   VITE_IPFS_GATEWAY_URL=https://gateway.pinata.cloud/ipfs/
   ```

Backend membuat tabel `medical_record_files` secara otomatis saat metadata pertama disimpan.

## Alur dan batasan

- Browser mengenkripsi file dengan AES-GCM sebelum mengirimnya ke backend.
- Kunci diturunkan dari passphrase yang dipilih dokter. Passphrase tidak disimpan atau dikirim ke server; dokter harus membagikannya kepada pasien melalui kanal aman terpisah.
- Pinata menerima file ciphertext saja. CID dan relasi ke commitment/transaksi disimpan di MySQL.
- Saat pasien mengunduh, browser mendekripsi file dan mencocokkan hash plaintext terhadap commitment di blockchain.
- Upload saat ini menggunakan IPFS publik; isi ciphertext dapat diambil publik, tetapi tidak dapat dibaca tanpa passphrase yang kuat.
- Ukuran maksimum file terenkripsi adalah 12 MB.
