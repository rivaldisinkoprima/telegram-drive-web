# 🚀 Telegram Drive Web

Aplikasi web untuk menyimpan file di Telegram sebagai cloud storage gratis dan tanpa batas.

**Tech Stack**: FastAPI (Python) + React + Vite + TailwindCSS

---

## ⚡ Cara Menjalankan (Development)

### 1. Setup Backend (Python + FastAPI)

```bash
cd backend

# Buat virtual environment
python -m venv venv

# Aktifkan (Windows)
venv\Scripts\activate

# Aktifkan (Mac/Linux)
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# (Opsional) Atur SECRET_KEY di .env agar JWT lebih aman
# Generate: python -c "import secrets; print(secrets.token_hex(32))"
# Salin dari template: copy .env.example .env  (lalu edit SECRET_KEY)

# Jalankan server
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Backend API akan tersedia di: **http://localhost:8000**  
Dokumentasi API (Swagger): **http://localhost:8000/api/docs**

### 2. Setup Frontend (React + Vite)

```bash
cd frontend

# Install dependencies
npm install

# Jalankan dev server
npm run dev
```

Frontend akan tersedia di: **http://localhost:5173**

### 3. Konfigurasi Awal via Browser (Pertama Kali)

Buka **http://localhost:5173** di browser — aplikasi akan otomatis mengarahkan ke halaman **Setup**.

1. **Halaman Setup** → Masukkan `API ID` dan `API Hash` dari [my.telegram.org/apps](https://my.telegram.org/apps) → Klik **Simpan & Lanjutkan**
2. **Halaman Login** → Masukkan nomor telepon Telegram → Kirim OTP → Masukkan kode
3. **Dashboard** → Siap digunakan! 🎉

> **Catatan:** API ID & API Hash **tidak perlu diisi di `.env`** — semuanya dikonfigurasi langsung lewat antarmuka web saat pertama kali membuka aplikasi.

---

## 📁 Struktur Proyek

```
telegram-drive-web/
├── backend/
│   ├── main.py              # FastAPI entry point
│   ├── config.py            # Konfigurasi server & JWT
│   ├── .env.example         # Template environment variables
│   ├── routers/
│   │   ├── setup.py         # ★ Konfigurasi Telegram API (publik)
│   │   ├── auth.py          # Login, OTP, QR, Logout
│   │   ├── folders.py       # Buat/hapus/rename folder
│   │   ├── files.py         # Upload/download/delete file
│   │   ├── streaming.py     # Stream video/audio (Range Request)
│   │   ├── sharing.py       # Share links publik
│   │   └── settings.py      # Proxy, network, API key
│   ├── services/
│   │   ├── telegram_client.py  # Telethon client manager (singleton)
│   │   └── auth_service.py     # JWT utilities
│   └── models/
│       ├── schemas.py       # Pydantic request/response types
│       └── database.py      # SQLite (share links)
│
└── frontend/
    └── src/
        ├── App.tsx               # Router utama + auto-detect setup state
        ├── api/index.ts          # API client (axios)
        ├── stores/index.ts       # State global (Zustand)
        ├── pages/
        │   ├── SetupPage.tsx     # ★ Halaman setup API credentials
        │   ├── AuthPage.tsx      # Login (OTP & QR Code)
        │   ├── DashboardPage.tsx # File manager utama
        │   └── SettingsPage.tsx  # Pengaturan (Telegram API, Proxy, dll)
        └── components/files/
            ├── FileCard.tsx         # Tampilan grid
            ├── FileRow.tsx          # Tampilan list
            ├── UploadQueue.tsx      # Panel progress upload real-time
            └── CreateFolderDialog.tsx
```

---

## 🗺️ Alur Pengguna

```
Buka Aplikasi
      │
      ▼
Sudah dikonfigurasi?
  ├── Tidak → /setup  (Isi API ID & API Hash)
  │                 │
  │                 ▼
  └── Ya   → /login  (Nomor Telepon → OTP / QR)
                    │
                    ▼
              / Dashboard
```

---

## ✨ Fitur Utama

Aplikasi ini tidak hanya bertindak sebagai jembatan ke Telegram, tetapi dirancang menyerupai pengalaman *cloud storage* tingkat lanjut (seperti Google Drive, Dropbox, atau Mega). Berikut rincian setiap fiturnya:

### 1. ⚙️ Setup API via Web UI
Anda tidak perlu repot-repot menyentuh atau mengedit file `.env` untuk mengatur API credentials. Saat pertama kali dijalankan, antarmuka web interaktif akan memandu Anda untuk memasukkan `API ID` dan `API Hash` dengan aman. Data ini disimpan lokal dalam bentuk JSON di server.

### 2. 🔐 Autentikasi & Keamanan Ganda
- **Login OTP / QR Code:** Mendukung login standar Telegram tanpa harus mematikan 2FA (Two-Step Verification).
- **Auto-Lock Screen (PIN):** Privasi Anda terjaga secara otomatis. Jika tidak ada aktivitas mouse/keyboard selama 15 menit, layar *dashboard* akan tertutup blur gelap (*AFK Lock*). Anda harus memasukkan 6 digit PIN (diatur via menu Settings) untuk melanjutkannya.

### 3. 📁 Local SQLite File Indexing (Akses Instan)
Berbeda dengan klien Telegram biasa yang lambat saat membaca ribuan file:
- **Virtual Directory Cache:** Aplikasi membuat struktur folder virtual dan mencatat metadatanya di database SQLite lokal. 
- **Kecepatan Lokal:** Navigasi antar folder, pencarian file, dan *loading* halaman terjadi secara instan (tanpa perlu melakukan *request iter_messages* ke Telegram setiap saat).

### 4. ⚡ Resume-able Chunked Uploads & Telegram Premium
Sistem *upload* kami dirancang tahan banting terhadap koneksi internet buruk:
- **Resumable (Anti Gagal):** File diunggah menggunakan arsitektur *Chunked REST API*. Jika di tengah *upload* koneksi internet mati atau tab ter-tutup, Anda bisa melanjutkannya nanti persis di persentase terakhir (tidak mulai dari 0%).
- **Dukungan Telegram Premium:** Sistem secara cerdas mendeteksi status Premium Anda. Memungkinkan pengunggahan file maksimal **4GB** per file untuk pengguna Premium, dan **2GB** untuk pengguna Reguler.

### 5. 🛡️ Client-Side End-to-End Encryption (E2EE) Sejati
Tingkat keamanan privasi setara *Mega.nz*:
- Jika Anda mengaktifkan opsi **E2EE** saat mengunggah, file Anda akan dipotong dan dienkripsi (AES-256-GCM) **sepenuhnya di dalam browser** (menggunakan Web Crypto API).
- Server backend maupun Telegram murni hanya menerima data *gibberish* (acak) yang mustahil didekripsi oleh siapapun tanpa *Master Password* Anda.

### 6. 🎬 Streaming Media Langsung Tanpa Download
Tidak perlu mengunduh file video atau audio bergiga-giga hanya untuk melihat isinya (Hanya berlaku untuk file non-E2EE)!
- **Video & Audio Player:** Backend kami menggunakan fitur HTTP Range Requests untuk melakukan *streaming chunked data* langsung dari server Telegram ke pemutar video di browser Anda.

### 7. 🔗 Shareable Download Links (Link Berbagi Publik)
Punya file besar di Telegram yang ingin dibagikan ke teman yang *tidak punya* Telegram?
- **Publik Link:** Anda bisa men-generate URL unik pendek (`/s/token`) untuk membagikan file tertentu.
- **Proteksi Password & Kedaluwarsa:** Tambahkan opsi kata sandi, atau tentukan kapan link tersebut kedaluwarsa secara otomatis (misal: hangus dalam 24 jam).
- **Statistik:** Pantau berapa kali file tersebut telah diunduh oleh orang lain melalui halaman Pengaturan.

### 8. 🛡️ Pawang Anti-FloodWait & Pembatasan Jaringan
- **Smart FloodWait Handling:** Konfigurasi *Telethon* tingkat rendah memastikan jika Anda menembus limit *request* Telegram, aplikasi **tidak akan crash**. Backend akan mem-pause *task* latar belakang secara elegan dan melanjutkannya setelah penalti waktu usai.
- **SOCKS5 Proxy:** Jika Telegram diblokir di negara/ISP Anda, Anda bisa langsung mengatur Proxy SOCKS5 dari halaman Pengaturan UI.
- **Bandwidth Control:** Atur batas maksimum kecepatan unggah (*upload*) dan unduh (*download*).

### 9. 🎨 Modern Dark Mode UI
- Antarmuka dirancang dengan *Glassmorphism*, transisi halus (Framer Motion), dan *palette* warna *Dark Mode* modern (mirip GitHub/Vercel) sehingga nyaman di mata untuk penggunaan jangka panjang.

---

## 🔒 Privasi Inti

- Sesi web dilindungi dengan **JWT (HTTP-only Cookie)**.
- **API ID & API Hash tersimpan lokal** di `db/settings.json` — tidak dikirim ke mana pun.
- Kunci dekripsi E2EE **tidak pernah** dikirim ke jaringan.
- Aplikasi ini murni bertindak sebagai *client* pribadi di mesin (PC/Server) Anda sendiri.

---

## ⚙️ Environment Variables (Opsional)

File `.env` hanya diperlukan untuk mengustomisasi konfigurasi server. **API Telegram tidak perlu diisi di sini.**

```env
# SECRET_KEY untuk JWT — WAJIB diganti di production!
SECRET_KEY=ganti_dengan_string_acak_yang_panjang

# Durasi token login (menit) — default 7 hari
ACCESS_TOKEN_EXPIRE_MINUTES=10080

# Port server (default 8000)
BACKEND_PORT=8000
```
