# FaceCount — Aplikasi Website Presensi & People Counting Menggunakan Wajah (MongoDB)

Aplikasi web untuk **presensi wajah (face recognition attendance)** dan **counting orang (terdaftar vs tidak terdaftar / bablas)** dengan database **MongoDB**.

## Fitur Utama

1. **Registrasi & Verifikasi Wajah Sebelum Masuk MongoDB**:
   - Ambil wajah dari **Kamera Live** atau **Upload Foto**.
   - Sistem mengekstrak descriptor wajah 128-dimensi lalu mengecek ke MongoDB (`POST /api/users/verify-face`) untuk memastikan wajah jelas dan belum terdaftar atas nama lain sebelum disimpan (`POST /api/users`).
2. **Live Presensi & People Counting**:
   - **Wajah Dikenali**: Nama, divisi, dan tingkat kemiripan (%) tampil di layar, lalu otomatis tercatat hadir ke MongoDB (`REGISTERED`) dengan cooldown agar tidak double-count saat berdiri diam.
   - **Wajah Tidak Dikenal**: Muncul peringatan **"Wajah Tidak Dikenal — Wajib Registrasi Terlebih Dahulu"** lengkap dengan tombol cepat **"Wajib Regis — Daftar Wajah Ini"**.
   - **Jika Tetap Bablas (Lewat Tanpa Regis)**:
     - Otomatis terhitung sebagai **`Tidak Terdaftar (Bablas)`** (`UNREGISTERED`) saat orang tak dikenal keluar dari frame kamera (bisa diatur on/off), atau bisa diuji langsung lewat tombol **"Tetap Bablas (Hitung Tanpa Regis)"**.
3. **Admin Dashboard (CRUD)**:
   - Tambah, cari, filter, edit data pengguna, tambah sampel foto wajah untuk akurasi lebih baik, toggle aktif/nonaktif, hapus pengguna, serta kelola/hapus log masuk.
4. **Log Masuk, Summary Harian & Export CSV**:
   - Ringkasan harian: Total Masuk, Terdaftar (total masuk & orang unik), Tidak Terdaftar (Bablas), grafik per jam, dan ringkasan per pengguna.
   - Export langsung ke **CSV** (`Export Summary Harian (.csv)` dan `Export Log Masuk (.csv)`).

## Konfigurasi MongoDB

Edit file `.env` di root project:
```env
PORT=5001
MONGODB_URI=mongodb://127.0.0.1:27017/presensi_wajah
ALLOW_EMBEDDED_MONGO_FALLBACK=true
FACE_MATCH_THRESHOLD=0.52
```

- Jika Anda sudah memiliki MongoDB lokal (`mongodb-community`) atau **MongoDB Atlas**, isi `MONGODB_URI` dan ubah `ALLOW_EMBEDDED_MONGO_FALLBACK=false` agar data tersimpan permanen di server MongoDB Anda.
- Jika MongoDB lokal belum terpasang dan `ALLOW_EMBEDDED_MONGO_FALLBACK=true`, server otomatis menjalankan `mongodb-memory-server` untuk keperluan testing cepat (data di mode fallback memory tidak tersimpan setelah server dimatikan).

## Menjalankan Aplikasi

Mode development (API Express + Vite React):
```bash
npm run dev
```
- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:5001`

Mode production (build React + jalankan lewat Express):
```bash
npm run build
npm start
```
Buka `http://localhost:5001`.

## Menjalankan Pengujian API & MongoDB

```bash
npm test
```
