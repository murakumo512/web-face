# Dokumentasi Teknis & Panduan Deployment — FaceCount (`presensi-wajah`)

Aplikasi website **Presensi Wajah** dan **People Counting (Terdaftar vs Tidak Terdaftar / Bablas)** berbasis **React + `@vladmandic/face-api` (WebGL)** di sisi client, dan **Node.js (Express) + MongoDB (Mongoose) + PDFKit** di sisi server.

---

## 1. Arsitektur & Alur Kerja Sistem

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ BROWSER CLIENT (React + Vite + @vladmandic/face-api WebGL)              │
│                                                                         │
│  1. Buka /live atau /file  --> FullScreenLive.jsx (Kamera penuh)        │
│  2. Buka /admin            --> Admin Portal (CRUD, Regis, Report, Test) │
│                                                                         │
│  [Kamera / Foto]                                                        │
│     ├─ Stage 1 (~80ms): detectFaceBoxesFast (TinyFaceDetector 224px)    │
│     │    -> Menggambar kotak deteksi wajah secara real-time (tanpa lag) │
│     └─ Stage 2 (~600ms): detectAllFacesWithDescriptors                  │
│          -> Ekstrak 68 landmarks + vektor wajah 128-dimensi             │
│          -> matchDescriptor() bandingkan dengan descriptor dari MongoDB │
│             ├─ Cocok (distance <= 0.52) -> POST /api/logs (REGISTERED)  │
│             └─ Tidak cocok -> Alert Wajib Regis / Auto-Bablas (>2 dtk)  │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ HTTP / JSON (REST API)
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ BACKEND SERVER (Node.js 20 + Express - server/index.js)                 │
│                                                                         │
│  • /api/health               -> Status server & koneksi MongoDB         │
│  • /api/users/*              -> CRUD User, verify-face, descriptors     │
│  • /api/logs/*               -> Catat masuk / bablas, query log         │
│  • /api/summary/daily        -> Agregasi jumlah harian & per jam        │
│  • /api/summary/export-csv   -> Download CSV (summary / logs)           │
│  • /api/summary/export-pdf   -> Generate PDF via PDFKit                 │
│  • Static files (client/dist)-> SPA React + folder /models              │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ Mongoose ODM
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ DATABASE (MongoDB)                                                      │
│  • Collection `users`           : Profil + array `faceDescriptors` 128d │
│  • Collection `attendancelogs`  : Log masuk REGISTERED / UNREGISTERED   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Struktur File & Penjelasan Kode

### A. Backend (`/server`)

| File | Fungsi Utama | Penjelasan Kode |
|---|---|---|
| `server/index.js` | Entry point server Express | Memuat `dotenv`, mengaktifkan `cors()` & `express.json({ limit: '10mb' })` (limit besar untuk menerima foto crop Base64). Memasang router `/api/health`, `/api/users`, `/api/logs`, `/api/summary`. Jika folder `client/dist` ada (mode production), Express melayani static file React dan mengarahkan semua route non-`/api/*` (seperti `/live`, `/file`, `/admin`) ke `client/dist/index.html` agar SPA routing berjalan normal. |
| `server/config/db.js` | Manajemen koneksi MongoDB | `connectDB()` membaca `MONGODB_URI` (atau `MONGO_URI`). Jika `ALLOW_EMBEDDED_MONGO_FALLBACK=false` (production/Docker), server mencoba koneksi hingga 10 kali (jeda 3 detik tiap percobaan) sebelum gagal. Jika `true` (development lokal), bila MongoDB eksternal tidak aktif maka otomatis menyalakan `mongodb-memory-server`. |
| `server/models/User.js` | Skema data pengguna | Menyimpan `name`, `identifier` (NIM/NIP/ID), `department`, `role`, `photoBase64`, `isActive`, dan `faceDescriptors` (`[[Number]]` — array of arrays berisi tepat **128 angka** valid yang divalidasi oleh validator Mongoose). Indeks dipasang pada `name` dan `isActive`. |
| `server/models/AttendanceLog.js` | Skema log presensi & counting | Menyimpan `userId` (ref `User`, `null` jika bablas), `personName`, `identifier`, `department`, `status` (`'REGISTERED'` \| `'UNREGISTERED'`), `eventType` (`'ENTRY'` \| `'PASS_THROUGH'`), `confidence` (0–100%), `distance` (jarak Euclidean), `snapshotBase64`, `notes`, `dateKey` (`YYYY-MM-DD`), dan `enteredAt`. Indeks gabungan `{ dateKey: 1, status: 1, enteredAt: -1 }` mempercepat query laporan harian. |
| `server/utils/faceMath.js` | Matematika pencocokan wajah di server | `euclideanDistance(descA, descB)` menghitung jarak Euclidean antar vektor 128-d. `distanceToConfidence(distance)` mengonversi jarak ke skor persentase `0–100%`. `findBestFaceMatch(probeDescriptor, users, threshold)` mencari user dengan jarak terkecil di bawah `threshold` (default `0.52`). |
| `server/utils/dateUtils.js` | Utilitas tanggal & format CSV | `toLocalDateKey()` memformat tanggal lokal ke `YYYY-MM-DD`, `formatDateTimeID()` ke `DD/MM/YYYY HH:mm:ss`, dan `escapeCsvCell()` mengamankan karakter koma/kutip agar kompatibel RFC-4180 di Excel. |
| `server/routes/users.js` | REST API pengguna & wajah | - `GET /api/users`: list & cari pengguna (untuk Admin CRUD).<br>- `GET /api/users/descriptors`: kirim daftar descriptor pengguna aktif (`isActive: true`) + `threshold` ke browser.<br>- `POST /api/users/verify-face`: cek apakah wajah 128-d sudah ada di MongoDB sebelum registrasi.<br>- `POST /api/users`: simpan pengguna + descriptor wajah baru (menolak duplikat wajah `409 Conflict` kecuali `allowDuplicate=true`).<br>- `PUT /api/users/:id`: edit profil, toggle aktif, atau tambah sampel descriptor baru (`newDescriptor`).<br>- `DELETE /api/users/:id`: hapus pengguna. |
| `server/routes/logs.js` | REST API pencatatan masuk | - `GET /api/logs`: filter log berdasarkan `date`, rentang `startDate`–`endDate`, `status`, dan `search` dengan pagination.<br>- `POST /api/logs`: mencatat `REGISTERED` (dengan proteksi cooldown server-side agar tidak double-count) atau `UNREGISTERED` (`PASS_THROUGH` / bablas).<br>- `DELETE /api/logs/:id`: hapus log tertentu. |
| `server/routes/summary.js` | Ringkasan harian, CSV & PDF | `buildDailySummary(dateKey)` mengagregasi total orang masuk, terdaftar, unik hadir, bablas, breakdown 24 jam, dan breakdown per orang. Menyediakan:<br>- `GET /api/summary/daily`<br>- `GET /api/summary/export-csv?date=...&mode=summary\|logs`<br>- `GET /api/summary/export-pdf?date=...&mode=summary\|logs\|all` (render tabel & 4 KPI card lanskap A4 memakai `pdfkit`). |

---

### B. Frontend (`/client`)

| File | Fungsi Utama | Penjelasan Kode |
|---|---|---|
| `client/package.json` | Konfigurasi & copy model AI | Script `prebuild` otomatis menyalin bobot model AI (`tiny_face_detector`, `ssd_mobilenetv1`, `face_landmark_68`, `face_recognition`) dari `node_modules/@vladmandic/face-api/model/` ke `public/models/` sebelum `vite build`. |
| `client/vite.config.js` | Dev proxy Vite | Mengarahkan request `/api/*` di mode development (`port 5173`) ke backend Express (`http://localhost:5001`). |
| `client/src/services/api.js` | Client HTTP wrapper | Membungkus `fetch` ke `/api/*` (`getUsers`, `verifyFace`, `createUser`, `updateUser`, `deleteUser`, `getLogs`, `createLog`, `getDailySummary`, `getExportCsvUrl`, `getExportPdfUrl`). |
| `client/src/services/faceService.js` | Engine Face AI di Browser | - `loadFaceModels()`: mengaktifkan backend `webgl` (fallback `cpu`), memuat 4 model dari `/models`, lalu melakukan warmup canvas `128x128` agar frame pertama tidak macet.<br>- `detectFaceBoxesFast()`: deteksi kotak wajah cepat (~10–35ms) dari snapshot video.<br>- `detectAllFacesWithDescriptors()`: deteksi lengkap + 68 landmark + 128-d descriptor dengan fallback detector jika pencahayaan sulit.<br>- `matchDescriptor()`: mencari user terdekat di `FaceMatcher` dan mengembalikan skor `confidence` (%) meskipun belum melewati threshold (untuk tampilan `Sync DB: XX%`).<br>- `drawDetectionsOnCanvas()`: menggambar bounding box hijau/oranye/biru lengkap dengan offset `object-contain` atau `object-cover` yang presisi.<br>- `captureFaceCropBase64()`: crop area wajah + padding ke JPEG Base64. |
| `client/src/App.jsx` | Router & Layout Utama | Menggunakan `window.location.pathname` + `history.pushState`:<br>- Path selain `/admin` (`/`, `/live`, `/file`, `/kiosk`, `/camera`) merender **`<FullScreenLive />`**.<br>- Path `/admin` merender **FaceCount Admin Portal** dengan 4 tab: `Admin Dashboard (CRUD)`, `Registrasi Wajah`, `Log, Summary CSV & PDF`, dan `Live Monitor & Test Foto`. |
| `client/src/components/FullScreenLive.jsx` | Kamera Full-Screen (Kiosk/Live) | Tampilan kamera layar penuh (`object-cover`) tanpa dashboard. Melakukan IoU box tracking lintas frame: setiap track baru dicek descriptornya tiap ~600ms, mencatat presensi otomatis setelah `framesSeen >= 2` (dengan cooldown 15 detik), menampilkan popup alert jika ada wajah tak dikenal, dan otomatis menghitung **`Tidak Terdaftar (Bablas)`** bila wajah tak dikenal keluar frame > 2 detik (`ageSinceLost >= 2000`). |
| `client/src/components/LiveMonitor.jsx` | Live Monitor & Uji Foto di `/admin` | Mirip `FullScreenLive`, namun dilengkapi panel kontrol pengujian di tab Admin (pengaturan mode cepat, durasi cooldown, toggle auto-bablas, upload foto uji statis, serta feed log terbaru). |
| `client/src/components/FaceRegistration.jsx` | Alur Registrasi Wajah 3 Langkah | 1. Ambil wajah dari webcam (atau upload foto) -> ekstrak descriptor 128-d.<br>2. Otomatis memanggil `api.verifyFace()` untuk melihat kemiripan ke DB MongoDB (`Sync DB: XX%`) dan mencegah duplikasi.<br>3. Jika wajah baru, user mengisi Nama, ID/NIM/NIP, Divisi, Role lalu simpan via `api.createUser()`. |
| `client/src/components/AdminDashboard.jsx` | Manajemen User & Log (CRUD) | Pencarian user, filter status aktif/nonaktif, modal edit profil, tambah sampel foto wajah ke user lama (`newDescriptor`) untuk meningkatkan akurasi, toggle aktif/nonaktif, hapus user, dan hapus log. |
| `client/src/components/ReportsSummary.jsx` | Laporan Harian & Export | Pilih tanggal, filter status, lihat 4 kartu KPI, grafik batang trafik 24 jam, tabel breakdown per orang, tabel detail log, serta 5 tombol download export (`Summary .csv`, `Log .csv`, `Summary .pdf`, `Log .pdf`, `Lengkap .pdf`). |

---

## 3. Cara Deploy ke Server Linux

> **PENTING (Syarat Webcam Browser):** Browser modern (Chrome/Edge/Safari/Firefox) **memblokir akses kamera (`navigator.mediaDevices.getUserMedia`) pada origin `http://` selain `localhost`**. Untuk akses dari komputer lain melalui IP atau domain, wajib pasang **Nginx + HTTPS (SSL)** di depan aplikasi.

---

### Opsi A: Deploy ke Linux DENGAN Docker

Cocok jika server Linux sudah terpasang **Docker Engine** dan **Docker Compose** (isolasi rapi, tidak perlu install Node.js & MongoDB langsung di host).

#### 1. Install Docker di Linux (Ubuntu/Debian) jika belum ada
```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# Logout lalu login kembali agar grup docker aktif
```

#### 2. Salin Project ke Server Linux
Misal simpan di `/opt/presensi-wajah`:
```bash
mkdir -p /opt/presensi-wajah
# Copy folder project (tanpa node_modules & dist) via scp/rsync dari laptop:
# rsync -avz --exclude node_modules --exclude client/node_modules --exclude client/dist ./presensi-wajah/ user@IP_SERVER:/opt/presensi-wajah/
cd /opt/presensi-wajah
```

#### 3. Siapkan `docker-compose.yml` untuk Single-Server Linux (Standalone)
*(Catatan: Jika CPU VM server tidak mendukung AVX seperti pada beberapa VM Proxmox/KVM, gunakan `mongo:4.4`. Jika CPU modern dengan AVX/AVX2, boleh pakai `mongo:7`.)*

Buat file `docker-compose.standalone.yml`:
```yaml
version: "3.8"

services:
  presensi_mongodb:
    image: mongo:4.4
    container_name: presensi_mongodb
    restart: unless-stopped
    environment:
      TZ: "Asia/Jakarta"
      MONGO_INITDB_ROOT_USERNAME: "admin"
      MONGO_INITDB_ROOT_PASSWORD: "ganti_password_kuat"
      MONGO_INITDB_DATABASE: "presensi_wajah"
    volumes:
      - mongo_data:/data/db

  presensi_app:
    image: node:20-alpine
    container_name: presensi_app
    working_dir: /app
    restart: unless-stopped
    depends_on:
      - presensi_mongodb
    command: >
      sh -c "
      if [ ! -f client/dist/index.html ] || [ ! -d client/dist/models ]; then
        cd /app/client && npm install --include=dev && npm run build;
      fi &&
      cd /app && npm install --omit=dev && npm start
      "
    environment:
      TZ: "Asia/Jakarta"
      NODE_ENV: "production"
      PORT: "8080"
      MONGODB_URI: "mongodb://admin:ganti_password_kuat@presensi_mongodb:27017/presensi_wajah?authSource=admin"
      ALLOW_EMBEDDED_MONGO_FALLBACK: "false"
      FACE_MATCH_THRESHOLD: "0.52"
    ports:
      - "8090:8080"
    volumes:
      - ./:/app

volumes:
  mongo_data:
```

#### 4. Jalankan & Verifikasi Container
```bash
docker compose -f docker-compose.standalone.yml up -d
docker compose -f docker-compose.standalone.yml logs -f presensi_app
```
Tunggu hingga muncul log:
- `[MongoDB] Connected (external): ...`
- `[API] Server running on http://localhost:8080`

Cek endpoint:
```bash
curl -s http://127.0.0.1:8090/api/health
```

*(Jika menggunakan **Docker Swarm** multi-node seperti server kampus, gunakan `docker-compose.yml` dengan volume NFS + `docker stack deploy -c docker-compose.yml presensi-wajah` — catatan: build `client` dilakukan di `/tmp` container agar tidak lambat menulis ribuan file `node_modules` ke NFS.)*

---

### Opsi B: Deploy ke Linux TANPA Docker (Native Bare-Metal / VM)

Cocok untuk VPS atau server Linux biasa menggunakan **Node.js 20 + MongoDB + PM2 + Nginx**.

#### 1. Update Sistem & Install Node.js 20 LTS (Ubuntu/Debian)
```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs build-essential git
node -v   # pastikan v20.x
npm -v
```

#### 2. Install MongoDB di Linux
Cek apakah CPU mendukung AVX (syarat MongoDB 5+):
```bash
grep -o 'avx[^ ]*' /proc/cpuinfo | head -n 1
```
- **Jika muncul `avx` / `avx2`**, install MongoDB 7.0 resmi Ubuntu 24.04 (noble) / 22.04 (jammy):
  ```bash
  curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | \
    sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
  echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu $(lsb_release -cs)/mongodb-org/7.0 multiverse" | \
    sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
  sudo apt update
  sudo apt install -y mongodb-org
  sudo systemctl enable --now mongod
  sudo systemctl status mongod
  ```
- **Jika output `grep` kosong (non-AVX)**, jangan install MongoDB 5/6/7/8 (akan `Illegal instruction`). Gunakan **MongoDB 4.4** atau database eksternal **MongoDB Atlas**.

#### 3. Upload Source Code, Konfigurasi `.env`, & Build Aplikasi
```bash
sudo mkdir -p /var/www/presensi-wajah
sudo chown -R $USER:$USER /var/www/presensi-wajah
# Copy project ke /var/www/presensi-wajah (tanpa node_modules & dist)
cd /var/www/presensi-wajah

# Buat file .env production
cat << 'EOF' > .env
PORT=5001
NODE_ENV=production
MONGODB_URI=mongodb://127.0.0.1:27017/presensi_wajah
ALLOW_EMBEDDED_MONGO_FALLBACK=false
FACE_MATCH_THRESHOLD=0.52
EOF

# Install dependencies backend & frontend + build React + copy model Face AI
npm install --omit=dev
npm run build
```
Pastikan folder `client/dist/index.html` dan `client/dist/models/` terbentuk setelah `npm run build`.

#### 4. Jalankan Aplikasi Permanen (Pilih PM2 atau Systemd)

**Cara 1 — Pakai PM2 (paling praktis):**
```bash
sudo npm install -g pm2
cd /var/www/presensi-wajah
pm2 start server/index.js --name presensi-wajah
pm2 save
pm2 startup   # jalankan perintah output yang diberikan agar auto-start saat server reboot
```
Cek status & log:
```bash
pm2 status
pm2 logs presensi-wajah
curl -s http://127.0.0.1:5001/api/health
```

**Cara 2 — Pakai `systemd` (bawaan Linux, tanpa PM2):**
Buat file `/etc/systemd/system/presensi-wajah.service`:
```ini
[Unit]
Description=FaceCount Presensi & People Counting Web App
After=network.target mongod.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/presensi-wajah
Environment=NODE_ENV=production
ExecStart=/usr/bin/node /var/www/presensi-wajah/server/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```
Aktifkan service:
```bash
sudo chown -R www-data:www-data /var/www/presensi-wajah
sudo systemctl daemon-reload
sudo systemctl enable --now presensi-wajah
sudo systemctl status presensi-wajah
```

---

### 4. Pasang Nginx Reverse Proxy + HTTPS (Wajib untuk Webcam)

Baik memakai Docker (port `8090`) maupun Tanpa Docker (port `5001`), pasang Nginx agar bisa diakses lewat domain dengan HTTPS:

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

Buat `/etc/nginx/sites-available/presensi-wajah`:
```nginx
server {
    listen 80;
    server_name presensi.domainanda.ac.id;

    client_max_body_size 15M;

    location / {
        # Ganti ke 127.0.0.1:8090 jika pakai Docker, atau 127.0.0.1:5001 jika tanpa Docker
        proxy_pass http://127.0.0.1:5001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Aktifkan config dan pasang sertifikat SSL Let's Encrypt:
```bash
sudo ln -s /etc/nginx/sites-available/presensi-wajah /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d presensi.domainanda.ac.id
```

Setelah SSL aktif, buka:
- **Kamera Live Counting Full-Screen**: `https://presensi.domainanda.ac.id/live` (atau `/file` atau `/`)
- **Admin Portal & Registrasi**: `https://presensi.domainanda.ac.id/admin`
