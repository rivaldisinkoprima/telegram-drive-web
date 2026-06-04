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

## ✨ Fitur

| Fitur | Status |
|-------|--------|
| **Setup API via Web UI (tanpa edit .env)** | ✅ |
| Login via OTP (nomor telepon) | ✅ |
| Login via QR Code | ✅ |
| Verifikasi 2FA | ✅ |
| Buat / Hapus / Rename Folder | ✅ |
| List & Cari File | ✅ |
| Upload File (Drag & Drop + Progress Real-time) | ✅ |
| Download File | ✅ |
| Hapus / Rename / Pindah File | ✅ |
| Stream Video & Audio (tanpa download) | ✅ |
| Preview Gambar & Thumbnail | ✅ |
| Shareable Link + Password + Expiry | ✅ |
| Manajemen Proxy SOCKS5 | ✅ |
| Pengaturan Bandwidth | ✅ |
| REST API Key untuk integrasi eksternal | ✅ |
| Grid View & List View | ✅ |
| Dark Mode | ✅ (default) |

---

## 🔒 Keamanan

- Sesi web dilindungi dengan **JWT (HTTP-only Cookie)**
- **API ID & API Hash tersimpan lokal** di `db/settings.json` — tidak dikirim ke mana pun
- File sesi Telegram tersimpan **lokal di server**
- Password share link di-**hash** dengan bcrypt
- Aplikasi ini dirancang untuk penggunaan **pribadi / single user**

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
