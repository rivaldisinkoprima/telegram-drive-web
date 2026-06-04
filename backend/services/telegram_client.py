"""
TelegramClientManager — Singleton manager untuk Telethon Client.

Tanggung jawab:
- Menyimpan instance Telethon Client yang aktif
- Mengelola login state (OTP token, Password token, QR token)
- Reconnect jika koneksi terputus
"""

import asyncio
import os
from telethon import TelegramClient
from typing import Optional
from config import settings


class TelegramClientManager:
    _instance: Optional["TelegramClientManager"] = None

    def __init__(self):
        self.client: Optional[TelegramClient] = None
        self.api_id: Optional[int] = None
        self.api_hash: Optional[str] = None

        # State untuk alur autentikasi
        self._phone_code_hash: Optional[str] = None
        self._phone: Optional[str] = None
        self._qr_login_task = None
        self._qr_authorized = False

        # Settings
        self._proxy: Optional[dict] = None

    @classmethod
    def get_instance(cls) -> "TelegramClientManager":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def _get_session_path(self) -> str:
        return os.path.join(settings.session_dir, "user.session")

    async def initialize(self, api_id: int, api_hash: str) -> TelegramClient:
        """Inisialisasi atau ambil kembali client yang sudah ada."""
        if self.client and self.client.is_connected():
            return self.client

        self.api_id = api_id
        self.api_hash = api_hash

        session_path = self._get_session_path()

        proxy_kwargs = {}
        if self._proxy and self._proxy.get("enabled"):
            import socks
            proxy_type = socks.SOCKS5 if self._proxy.get("proxy_type") == "socks5" else socks.HTTP
            proxy_kwargs["proxy"] = (
                proxy_type,
                self._proxy["host"],
                self._proxy["port"],
                True,
                self._proxy.get("username") or None,
                self._proxy.get("password") or None,
            )

        self.client = TelegramClient(
            session_path,
            api_id,
            api_hash,
            **proxy_kwargs,
        )

        await self.client.connect()
        return self.client

    async def get_client(self) -> TelegramClient:
        """Ambil client yang aktif. Raise jika belum terautentikasi."""
        if not self.client or not self.client.is_connected():
            raise RuntimeError("Telegram client belum terhubung. Silakan login terlebih dahulu.")
        return self.client

    async def is_authorized(self) -> bool:
        """Cek apakah pengguna sudah login."""
        if not self.client or not self.client.is_connected():
            return False
        try:
            return await self.client.is_user_authorized()
        except Exception:
            return False

    async def request_code(self, phone: str, api_id: int, api_hash: str) -> str:
        """Kirim OTP ke nomor telepon. Mengembalikan 'code_sent'."""
        client = await self.initialize(api_id, api_hash)
        self._phone = phone

        result = await client.send_code_request(phone)
        self._phone_code_hash = result.phone_code_hash
        return "code_sent"

    async def sign_in(self, code: str) -> dict:
        """
        Login menggunakan kode OTP.
        Returns: {"success": bool, "next_step": "dashboard" | "password"}
        """
        client = await self.get_client()
        try:
            await client.sign_in(
                phone=self._phone,
                code=code,
                phone_code_hash=self._phone_code_hash,
            )
            return {"success": True, "next_step": "dashboard"}
        except Exception as e:
            err = str(e)
            if "SessionPasswordNeededError" in err or "password" in err.lower():
                return {"success": False, "next_step": "password"}
            raise

    async def check_password(self, password: str) -> dict:
        """Login menggunakan 2FA password."""
        client = await self.get_client()
        await client.sign_in(password=password)
        return {"success": True, "next_step": "dashboard"}

    async def get_qr_token(self, api_id: int, api_hash: str) -> str:
        """Ambil QR Login token URL."""
        from telethon.errors import SessionPasswordNeededError

        client = await self.initialize(api_id, api_hash)

        # Jalankan QR login flow
        qr_login = await client.qr_login()
        self._qr_login_task = qr_login
        self._qr_authorized = False

        # Set callback saat QR berhasil discan
        async def _on_qr_done():
            try:
                await qr_login.wait()
                self._qr_authorized = True
            except SessionPasswordNeededError:
                # 2FA diperlukan setelah scan QR
                self._qr_authorized = "password"
            except Exception:
                self._qr_authorized = False

        asyncio.create_task(_on_qr_done())

        # qr_login.url berisi string tg://login?token=...
        return qr_login.url

    async def poll_qr(self) -> dict:
        """Cek apakah QR code sudah discan."""
        if self._qr_authorized is True:
            return {"success": True, "next_step": "dashboard"}
        if self._qr_authorized == "password":
            return {"success": False, "next_step": "password"}
        return {"success": False, "next_step": "waiting"}

    async def logout(self) -> bool:
        """Logout dan hapus session file."""
        if self.client:
            try:
                await self.client.log_out()
            except Exception:
                pass
            await self.client.disconnect()
            self.client = None

        self.api_id = None
        self.api_hash = None
        self._phone_code_hash = None
        self._phone = None
        self._qr_authorized = False

        # Hapus file sesi
        session_path = self._get_session_path() + ".session"
        if os.path.exists(session_path):
            os.remove(session_path)

        return True

    def set_proxy(self, proxy_config: dict):
        """Simpan konfigurasi proxy (diterapkan saat reconnect berikutnya)."""
        self._proxy = proxy_config


# Global singleton
telegram_manager = TelegramClientManager.get_instance()
