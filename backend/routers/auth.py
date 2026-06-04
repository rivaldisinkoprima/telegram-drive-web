"""
Auth Router — Endpoint autentikasi Telegram
"""
from fastapi import APIRouter, HTTPException, Response, Depends
from models.schemas import (
    SendCodeRequest, SignInRequest, CheckPasswordRequest,
    QRLoginRequest, AuthResult, UserInfo,
)
from services.telegram_client import telegram_manager
from services.auth_service import create_access_token, get_current_user, set_auth_cookie
from routers.setup import get_stored_telegram_config

router = APIRouter(prefix="/auth", tags=["Authentication"])


def _resolve_credentials(api_id: int | None, api_hash: str | None) -> tuple[int, str]:
    """
    Ambil API ID & Hash dari request body, atau fallback ke config yang tersimpan.
    Raise 400 jika tidak tersedia di keduanya.
    """
    if api_id and api_hash:
        return api_id, api_hash
    cfg = get_stored_telegram_config()
    if cfg:
        return cfg["api_id"], cfg["api_hash"]
    raise HTTPException(
        status_code=400,
        detail="Telegram API belum dikonfigurasi. Silakan buka halaman Setup terlebih dahulu.",
    )


@router.post("/send-code")
async def send_code(body: SendCodeRequest):
    """Langkah 1 Login: Kirim OTP ke nomor telepon."""
    try:
        api_id, api_hash = _resolve_credentials(body.api_id, body.api_hash)
        await telegram_manager.request_code(body.phone, api_id, api_hash)
        return {"status": "code_sent", "message": "Kode OTP sudah dikirim ke nomor telepon Anda."}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/sign-in")
async def sign_in(body: SignInRequest, response: Response):
    """Langkah 2 Login: Submit kode OTP."""
    try:
        result = await telegram_manager.sign_in(body.code)
        if result["success"]:
            token = create_access_token({"sub": "telegram_user"})
            set_auth_cookie(response, token)
        return AuthResult(**result)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/check-password")
async def check_password(body: CheckPasswordRequest, response: Response):
    """Langkah 2FA: Submit password verifikasi dua langkah."""
    try:
        result = await telegram_manager.check_password(body.password)
        if result["success"]:
            token = create_access_token({"sub": "telegram_user"})
            set_auth_cookie(response, token)
        return AuthResult(**result)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/qr-token")
async def get_qr_token(body: QRLoginRequest):
    """QR Login Langkah 1: Ambil URL token untuk dirender sebagai QR Code."""
    try:
        api_id, api_hash = _resolve_credentials(body.api_id, body.api_hash)
        url = await telegram_manager.get_qr_token(api_id, api_hash)
        return {"url": url}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/qr-poll")
async def poll_qr(response: Response):
    """QR Login Langkah 2: Cek apakah QR sudah discan."""
    result = await telegram_manager.poll_qr()
    if result["success"]:
        token = create_access_token({"sub": "telegram_user"})
        set_auth_cookie(response, token)
    return AuthResult(**result)


@router.get("/status")
async def check_status():
    """Cek apakah pengguna sudah terautentikasi dengan Telegram."""
    authorized = await telegram_manager.is_authorized()
    return {"authorized": authorized}


@router.get("/me", response_model=UserInfo)
async def get_me(_user=Depends(get_current_user)):
    """Ambil informasi profil pengguna yang sedang login."""
    try:
        client = await telegram_manager.get_client()
        me = await client.get_me()
        return UserInfo(
            id=me.id,
            first_name=me.first_name or "",
            last_name=me.last_name,
            username=me.username,
            phone=me.phone,
            is_premium=getattr(me, 'premium', False),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/logout")
async def logout(response: Response, _user=Depends(get_current_user)):
    """Logout dari Telegram dan hapus sesi lokal."""
    try:
        await telegram_manager.logout()
        response.delete_cookie("access_token")
        return {"success": True, "message": "Berhasil logout."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
