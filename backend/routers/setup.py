"""
Setup Router — Konfigurasi awal Telegram API (publik, tanpa auth)
"""
import json
import os
from fastapi import APIRouter, HTTPException
from models.schemas import TelegramConfig, TelegramConfigStatus

router = APIRouter(prefix="/api/setup", tags=["Setup"])

SETTINGS_FILE = "./db/settings.json"


def _load_settings() -> dict:
    if os.path.exists(SETTINGS_FILE):
        with open(SETTINGS_FILE) as f:
            return json.load(f)
    return {}


def _save_settings(data: dict):
    os.makedirs(os.path.dirname(SETTINGS_FILE), exist_ok=True)
    with open(SETTINGS_FILE, "w") as f:
        json.dump(data, f, indent=2)


def get_stored_telegram_config() -> dict | None:
    """Ambil API ID & Hash dari storage. Digunakan oleh auth router."""
    data = _load_settings()
    cfg = data.get("telegram_config")
    if cfg and cfg.get("api_id") and cfg.get("api_hash"):
        return cfg
    return None


@router.get("/telegram-config", response_model=TelegramConfigStatus)
async def check_config():
    """
    Cek apakah Telegram API credentials sudah dikonfigurasi.
    Endpoint PUBLIK — tidak perlu login.
    """
    cfg = get_stored_telegram_config()
    if cfg:
        return TelegramConfigStatus(
            configured=True,
            api_id=cfg["api_id"],
            app_name=cfg.get("app_name", "Telegram Drive Web"),
        )
    return TelegramConfigStatus(configured=False)


@router.post("/telegram-config", response_model=TelegramConfigStatus)
async def save_config(body: TelegramConfig):
    """
    Simpan Telegram API credentials ke storage lokal.
    Endpoint PUBLIK — digunakan saat pertama kali setup.
    """
    if body.api_id <= 0:
        raise HTTPException(status_code=400, detail="API ID tidak valid.")
    if len(body.api_hash) < 10:
        raise HTTPException(status_code=400, detail="API Hash tidak valid (terlalu pendek).")

    data = _load_settings()
    data["telegram_config"] = {
        "api_id": body.api_id,
        "api_hash": body.api_hash,
        "app_name": body.app_name or "Telegram Drive Web",
    }
    _save_settings(data)

    return TelegramConfigStatus(
        configured=True,
        api_id=body.api_id,
        app_name=body.app_name,
    )


@router.delete("/telegram-config")
async def delete_config():
    """
    Hapus konfigurasi Telegram API (reset ke setup awal).
    Endpoint PUBLIK.
    """
    data = _load_settings()
    data.pop("telegram_config", None)
    _save_settings(data)
    return {"success": True, "message": "Konfigurasi Telegram dihapus."}
