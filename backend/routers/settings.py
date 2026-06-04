"""
Settings Router — Proxy, network, dan API key management
"""
import json
import os
import secrets
from fastapi import APIRouter, Depends
from models.schemas import ProxySettings, NetworkSettings
from services.auth_service import get_current_user
from services.telegram_client import telegram_manager

router = APIRouter(prefix="/api/settings", tags=["Settings"])

SETTINGS_FILE = "./db/settings.json"


def _load_settings() -> dict:
    if os.path.exists(SETTINGS_FILE):
        with open(SETTINGS_FILE) as f:
            return json.load(f)
    return {
        "proxy": {"enabled": False, "proxy_type": "socks5", "host": "", "port": 1080, "username": "", "password": ""},
        "network": {"download_limit_kbps": 0, "upload_limit_kbps": 0, "retry_attempts": 3, "chunk_size_kb": 512},
        "api_key": None,
    }


def _save_settings(data: dict):
    os.makedirs(os.path.dirname(SETTINGS_FILE), exist_ok=True)
    with open(SETTINGS_FILE, "w") as f:
        json.dump(data, f, indent=2)


@router.get("")
async def get_settings(_user=Depends(get_current_user)):
    """Ambil semua pengaturan."""
    settings = _load_settings()
    # Jangan tampilkan password proxy ke frontend
    if settings.get("proxy", {}).get("password"):
        settings["proxy"]["password"] = "••••••••"
    return settings


@router.post("/proxy")
async def save_proxy(body: ProxySettings, _user=Depends(get_current_user)):
    """Simpan konfigurasi proxy. Akan diterapkan saat reconnect."""
    settings = _load_settings()
    settings["proxy"] = body.model_dump()
    _save_settings(settings)

    # Terapkan ke client manager (akan aktif di koneksi berikutnya)
    telegram_manager.set_proxy(body.model_dump())
    return {"success": True, "message": "Pengaturan proxy disimpan. Reconnect diperlukan."}


@router.post("/network")
async def save_network(body: NetworkSettings, _user=Depends(get_current_user)):
    """Simpan konfigurasi jaringan/bandwidth."""
    settings = _load_settings()
    settings["network"] = body.model_dump()
    _save_settings(settings)
    return {"success": True, "message": "Pengaturan jaringan disimpan."}


@router.get("/api-key")
async def get_api_key(_user=Depends(get_current_user)):
    """Ambil API key untuk integrasi eksternal."""
    settings = _load_settings()
    api_key = settings.get("api_key")
    return {"api_key": api_key, "has_key": bool(api_key)}


@router.post("/api-key/regenerate")
async def regenerate_api_key(_user=Depends(get_current_user)):
    """Buat ulang API key baru."""
    settings = _load_settings()
    new_key = f"tdw_{secrets.token_hex(32)}"
    settings["api_key"] = new_key
    _save_settings(settings)
    return {"api_key": new_key, "message": "API key baru berhasil dibuat."}


@router.delete("/api-key")
async def delete_api_key(_user=Depends(get_current_user)):
    """Hapus API key (menonaktifkan akses API eksternal)."""
    settings = _load_settings()
    settings["api_key"] = None
    _save_settings(settings)
    return {"success": True}
