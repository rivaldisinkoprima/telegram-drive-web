"""
Sharing Router — Buat dan kelola shareable download links
"""
from datetime import datetime, timedelta, timezone
from typing import Optional
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
    if not share:
        return HTMLResponse("<h2>Link tidak ditemukan atau sudah kadaluwarsa.</h2>", status_code=404)

    # Cek kedaluwarsa
    if share.expires_at and datetime.now(timezone.utc) > share.expires_at.replace(tzinfo=timezone.utc):
        return HTMLResponse("<h2>Link ini sudah kadaluwarsa.</h2>", status_code=410)

    size_mb = f"{share.file_size / 1024 / 1024:.2f} MB" if share.file_size else "Unknown"
    download_url = f"/s/{token}/download"
    password_form = ""
    if share.password_hash:
        password_form = f"""
        <form method="get" action="{download_url}">
            <label>Password: <input type="password" name="password" required></label>
            <button type="submit">Download</button>
        </form>"""
    else:
        password_form = f'<a href="{download_url}"><button>⬇️ Download</button></a>'

    return HTMLResponse(f"""
    <html><head><title>Download: {share.file_name}</title></head>
    <body style="font-family:sans-serif;max-width:500px;margin:50px auto;text-align:center">
        <h2>📁 {share.file_name}</h2>
        <p>Ukuran: {size_mb}</p>
        <p>Diunduh: {share.download_count}x</p>
        {password_form}
    </body></html>
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
