"""
Sharing Router — Buat dan kelola shareable download links
"""
from datetime import datetime, timedelta, timezone
from typing import Optional
import html
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse, HTMLResponse
from sqlmodel import Session, select
from passlib.context import CryptContext

from models.schemas import ShareCreateRequest, ShareInfo
from models.database import ShareLink, get_session
from services.auth_service import get_current_user
from services.telegram_client import telegram_manager

router = APIRouter(tags=["Sharing"])

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

CHUNK_SIZE = 1024 * 512  # 512 KB


def _make_share_url(request: Request, token: str) -> str:
    base = str(request.base_url).rstrip("/")
    return f"{base}/s/{token}"


# ─────────────────────────────────────
# (Protected) Buat link baru
# ─────────────────────────────────────
@router.post("/api/share", response_model=ShareInfo)
async def create_share(
    body: ShareCreateRequest,
    request: Request,
    db: Session = Depends(get_session),
    _user=Depends(get_current_user),
):
    """Buat shareable download link untuk sebuah file."""
    try:
        client = await telegram_manager.get_client()
        peer = body.folder_id if body.folder_id else "me"

        messages = await client.get_messages(peer, ids=body.message_id)
        msg = messages if not isinstance(messages, list) else (messages[0] if messages else None)

        if not msg or not msg.media:
            raise HTTPException(status_code=404, detail="File tidak ditemukan.")

        # Ekstrak info file
        file_name = f"file_{body.message_id}"
        mime_type = "application/octet-stream"
        file_size = 0

        doc = getattr(msg.media, "document", None)
        if doc:
            file_size = doc.size
            mime_type = doc.mime_type or mime_type
            from telethon.tl.types import DocumentAttributeFilename
            for attr in doc.attributes:
                if isinstance(attr, DocumentAttributeFilename):
                    file_name = attr.file_name
                    break

        # Hitung waktu kedaluwarsa
        expires_at = None
        if body.expires_in_hours:
            expires_at = datetime.now(timezone.utc) + timedelta(hours=body.expires_in_hours)

        # Hash password jika ada
        pw_hash = None
        if body.password:
            pw_hash = pwd_context.hash(body.password)

        share = ShareLink(
            message_id=body.message_id,
            folder_id=body.folder_id,
            file_name=file_name,
            file_size=file_size,
            mime_type=mime_type,
            password_hash=pw_hash,
            expires_at=expires_at,
        )
        db.add(share)
        db.commit()
        db.refresh(share)

        return ShareInfo(
            token=share.token,
            file_name=share.file_name,
            file_size=share.file_size,
            mime_type=share.mime_type,
            has_password=bool(share.password_hash),
            expires_at=share.expires_at,
            created_at=share.created_at,
            download_count=share.download_count,
            share_url=_make_share_url(request, share.token),
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────
# (Protected) List semua link aktif
# ─────────────────────────────────────
@router.get("/api/share", response_model=list[ShareInfo])
async def list_shares(
    request: Request,
    db: Session = Depends(get_session),
    _user=Depends(get_current_user),
):
    shares = db.exec(select(ShareLink)).all()
    return [
        ShareInfo(
            token=s.token,
            file_name=s.file_name,
            file_size=s.file_size,
            mime_type=s.mime_type,
            has_password=bool(s.password_hash),
            expires_at=s.expires_at,
            created_at=s.created_at,
            download_count=s.download_count,
            share_url=_make_share_url(request, s.token),
        )
        for s in shares
    ]


# ─────────────────────────────────────
# (Protected) Hapus link
# ─────────────────────────────────────
@router.delete("/api/share/{token}")
async def delete_share(
    token: str,
    db: Session = Depends(get_session),
    _user=Depends(get_current_user),
):
    share = db.exec(select(ShareLink).where(ShareLink.token == token)).first()
    if not share:
        raise HTTPException(status_code=404, detail="Link tidak ditemukan.")
    db.delete(share)
    db.commit()
    return {"success": True}


# ─────────────────────────────────────
# (Public) Halaman info unduhan
# ─────────────────────────────────────
@router.get("/s/{token}", response_class=HTMLResponse)
async def share_page(token: str, db: Session = Depends(get_session)):
    """Halaman publik untuk link berbagi — tidak perlu login."""
    share = db.exec(select(ShareLink).where(ShareLink.token == token)).first()
    def error_page(title, msg):
        return HTMLResponse(f"""
        <!DOCTYPE html>
        <html><head><title>{title}</title><script src="https://cdn.tailwindcss.com"></script></head>
        <body class="bg-[#0d1117] text-white min-h-screen flex items-center justify-center p-4">
            <div class="w-full max-w-md bg-[#161b22] border border-white/10 rounded-2xl p-8 shadow-2xl text-center">
                <div class="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <svg class="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                </div>
                <h2 class="text-xl font-semibold mb-2">{title}</h2>
                <p class="text-sm text-white/50">{msg}</p>
            </div>
        </body></html>
        """, status_code=404 if title == "Tidak Ditemukan" else 410)

    if not share:
        return error_page("Tidak Ditemukan", "Link berbagi ini tidak ditemukan atau sudah dihapus.")

    # Cek kedaluwarsa
    if share.expires_at and datetime.now(timezone.utc) > share.expires_at.replace(tzinfo=timezone.utc):
        return error_page("Kadaluwarsa", "Link berbagi ini sudah kadaluwarsa.")

    size_mb = f"{share.file_size / 1024 / 1024:.2f} MB" if share.file_size else "Unknown"
    download_url = f"/s/{token}/download"
    if share.password_hash:
        password_form = f"""
        <form method="get" action="{download_url}" class="flex flex-col gap-4 mt-6">
            <input type="password" name="password" placeholder="Masukkan password file..." required 
                class="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-blue-500 transition-colors">
            <button type="submit" 
                class="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-medium transition-all shadow-lg shadow-blue-500/20">
                Buka & Download
            </button>
        </form>"""
    else:
        password_form = f"""
        <div class="mt-6">
            <a href="{download_url}" 
                class="block w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-medium transition-all shadow-lg shadow-blue-500/20">
                Download File
            </a>
        </div>"""

    safe_file_name = html.escape(share.file_name)
    return HTMLResponse(f"""
    <!DOCTYPE html>
    <html lang="id">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Download: {safe_file_name}</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
        <style>body {{ font-family: 'Inter', sans-serif; }}</style>
    </head>
    <body class="bg-[#0d1117] text-white min-h-screen flex items-center justify-center p-4">
        <div class="w-full max-w-md bg-[#161b22] border border-white/10 rounded-2xl p-8 shadow-2xl text-center">
            <div class="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <svg class="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
            </div>
            <h2 class="text-xl font-semibold mb-2 truncate" title="{safe_file_name}">{safe_file_name}</h2>
            <div class="flex items-center justify-center gap-4 text-sm text-white/40">
                <span>{size_mb}</span>
                <span>•</span>
                <span>Diunduh: {share.download_count}x</span>
            </div>
            {password_form}
            
            <div class="mt-8 pt-6 border-t border-white/5">
                <p class="text-xs text-white/20">Powered by Telegram Drive Web</p>
            </div>
        </div>
    </body>
    </html>
    """)


# ─────────────────────────────────────
# (Public) Download dari share link
# ─────────────────────────────────────
@router.get("/s/{token}/download")
async def download_shared_file(
    token: str,
    password: Optional[str] = None,
    db: Session = Depends(get_session),
):
    """Download file dari share link (publik)."""
    share = db.exec(select(ShareLink).where(ShareLink.token == token)).first()
    if not share:
        raise HTTPException(status_code=404, detail="Link tidak ditemukan.")

    if share.expires_at and datetime.now(timezone.utc) > share.expires_at.replace(tzinfo=timezone.utc):
        raise HTTPException(status_code=410, detail="Link sudah kadaluwarsa.")

    if share.password_hash:
        if not password or not pwd_context.verify(password, share.password_hash):
            raise HTTPException(status_code=401, detail="Password salah.")

    try:
        client = await telegram_manager.get_client()
        peer = share.folder_id if share.folder_id else "me"
        messages = await client.get_messages(peer, ids=share.message_id)
        msg = messages if not isinstance(messages, list) else (messages[0] if messages else None)

        if not msg or not msg.media:
            raise HTTPException(status_code=404, detail="File tidak lagi tersedia.")

        # Increment download count
        share.download_count += 1
        db.add(share)
        db.commit()

        async def stream_gen():
            async for chunk in client.iter_download(msg.media, chunk_size=CHUNK_SIZE):
                yield chunk

        return StreamingResponse(
            stream_gen(),
            media_type=share.mime_type,
            headers={"Content-Disposition": f'attachment; filename="{share.file_name}"'},
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
