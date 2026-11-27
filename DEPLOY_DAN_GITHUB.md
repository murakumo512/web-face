# Panduan Backup, Push ke GitHub, dan Deploy Docker (Tanpa & Pakai Portainer)

Dokumentasi ini khusus untuk proyek **Presensi Wajah** (`https://github.com/murakumo512/web-face`).

---

## 1. Struktur Backup

Backup bersih proyek disimpan di:
- `/Users/brobroriel/Documents/presensi-wajah-backup/`
  - Berisi seluruh source code (`server/`, `client/`, `ai_service/`, `docker-compose.yml`, `docker-compose.standalone.yml`, dokumentasi) tanpa folder cache berat (`node_modules`, `.gradle`, `build/`).
  - File APK siap install ada di `apk/PresensiWajah-debug.apk`.

---

## 2. Cara Push ke Repository GitHub

Remote yang sudah terhubung di proyek ini:
- `origin`: `https://github.com/murakumo512/web-face` (branch `main`)

### A. Push Normal (Pertama Kali / Update Rutin)
Jalankan dari folder proyek utama:

```bash
cd /Users/brobroriel/Documents/presensi-wajah

# 1. Cek file yang berubah (pastikan .env tidak ikut)
git status

# 2. Masukkan semua perubahan
git add .

# 3. Buat commit dengan pesan yang jelas
git commit -m "Update UI natural, pisah DB gereja/piloting/testing, dan build Android"

# 4. Push ke GitHub
git push -u origin main
```

> **Catatan Login GitHub HTTPS**:
> Saat diminta `Password`, **jangan pakai password akun GitHub**. Gunakan **Personal Access Token (PAT)** dari GitHub (`Settings -> Developer settings -> Personal access tokens -> Tokens (classic)` dengan izin `repo`).

### B. Jika Muncul Error `rejected (fetch first / non-fast-forward)`
Artinya di GitHub ada commit yang belum ada di laptop kamu. Tarik dulu lalu push lagi:

```bash
git pull --rebase origin main
git push -u origin main
```

Jika muncul konflik file saat rebase:
1. Buka file yang konflik, pilih kode yang benar, lalu simpan.
2. Jalankan `git add .` lalu `git rebase --continue`.
3. Jalankan `git push -u origin main`.

---

## 3. Deploy di Docker TANPA Portainer (CLI)

Ada dua file compose di proyek ini:
- `docker-compose.standalone.yml` — untuk **VPS / Server / PC biasa** (1 server, tanpa Docker Swarm, tanpa NFS).
- `docker-compose.yml` — untuk **Docker Swarm + NFS** (sesuai setup node `ubuntu-swarm1` & `proxy-net`).

### Opsi A: Server / VPS Biasa (Docker Compose)

```bash
# 1. Clone repo di server
git clone https://github.com/murakumo512/web-face.git presensi-wajah
cd presensi-wajah

# 2. Jalankan semua container di background
docker compose -f docker-compose.standalone.yml up -d

# 3. Cek status container & log
docker compose -f docker-compose.standalone.yml ps
docker compose -f docker-compose.standalone.yml logs -f presensi_app
```

Akses layanan:
- **Aplikasi Web**: `http://<IP-SERVER>:8090` (atau arahkan Reverse Proxy / Nginx / Cloudflare Tunnel ke port `8090`)
- **Mongo Express (GUI DB)**: `http://<IP-SERVER>:8091` (login default: `riel` / `presensipass123`)

**Cara update kode di server (tanpa Portainer):**
```bash
cd presensi-wajah
git pull origin main

# Hapus client/dist agar container otomatis build ulang UI terbaru
rm -rf client/dist

# Restart container aplikasi
docker compose -f docker-compose.standalone.yml restart presensi_app
```

**Cara stop / matikan stack:**
```bash
docker compose -f docker-compose.standalone.yml down
```
*(Data MongoDB tetap aman di volume `presensi_mongo_data` selama tidak memakai flag `-v`.)*

### Opsi B: Docker Swarm + NFS (Pakai `docker-compose.yml`)

Pastikan network `proxy-net` sudah ada dan NFS `192.168.200.2:/home/presensi-wajah/app` sudah berisi repo terbaru:

```bash
docker stack deploy -c docker-compose.yml presensi
docker service ls
docker service logs -f presensi_presensi_app
```

---

## 4. Deploy di Docker PAKAI Portainer

### Cara 1: Deploy Langsung dari GitHub (Direkomendasikan)
1. Login ke dashboard **Portainer**.
2. Pilih environment Docker kamu (misal `local` atau Swarm cluster).
3. Masuk ke menu **Stacks** -> klik **+ Add stack**.
4. Isi **Name**: misalnya `presensi-wajah`.
5. Pada **Build method**, pilih **Repository**.
6. Isi detail Git:
   - **Repository URL**: `https://github.com/murakumo512/web-face`
   - **Repository reference**: `refs/heads/main`
   - **Compose path**:
     - Isi `docker-compose.standalone.yml` jika pakai Docker biasa (1 server).
     - Isi `docker-compose.yml` jika pakai Docker Swarm + NFS.
   - *(Jika repo private, aktifkan **Authentication** lalu isi Username GitHub dan Personal Access Token.)*
7. Klik **Deploy the stack**.
8. Cek tab **Containers** / **Services** untuk melihat log `presensi_app` sampai muncul `[API] Server running on http://localhost:8080`.

**Cara update setelah push ke GitHub (di Portainer):**
- Buka **Stacks** -> klik `presensi-wajah` -> klik **Pull and redeploy**.
- Jika pakai NFS (`docker-compose.yml`), pastikan folder `/home/presensi-wajah/app` di NFS server juga sudah di-`git pull`, lalu hapus `client/dist` agar frontend ter-build ulang saat container restart.

### Cara 2: Deploy via Web Editor (Copy-Paste Compose)
1. Masuk ke **Stacks** -> **+ Add stack**.
2. Isi **Name**: `presensi-wajah`.
3. Pilih **Web editor**, lalu paste isi `docker-compose.yml` (untuk Swarm/NFS) atau `docker-compose.standalone.yml` (untuk server biasa — pastikan folder source code sudah ada di path host yang di-mount di `volumes`).
4. Klik **Deploy the stack**.

---

## 5. Build Ulang APK Android (Opsional)

Jika ada perubahan UI dan ingin membuat APK baru di Mac:

```bash
cd /Users/brobroriel/Documents/presensi-wajah/client
JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home npm run apk
```

Hasil APK ada di:
`client/android/app/build/outputs/apk/debug/app-debug.apk`
