"""
Files Router — Upload, Download, List, Delete, Rename, Move file
"""
import os
import tempfile
import uuid
import hashlib
from typing import Optional

from fastapi import (
    APIRouter, Depends, HTTPException,
    Query, Request,
)
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlmodel import Session, select

from models.schemas import (
    FileInfo, FileListResponse, FileMoveRequest, FileRenameRequest,
)
from models.database import FileCache, get_session
from services.auth_service import get_current_user
from services.telegram_client import telegram_manager

router = APIRouter(prefix="/files", tags=["Files"])

# Simpan transfer yang sedang berjalan agar bisa dibatalkan
_active_transfers: dict[str, bool] = {}  # transfer_id -> cancelled

# ─────────────────────────────────────
# RESUME-ABLE CHUNKED UPLOAD API
# ─────────────────────────────────────
UPLOAD_DIR = os.path.join(tempfile.gettempdir(), "telegram_drive_uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

class UploadInitRequest(BaseModel):
    file_name: str
    file_size: int
    folder_id: Optional[int] = None

@router.post("/upload/init")
async def init_upload(body: UploadInitRequest, _user=Depends(get_current_user)):
    """Inisialisasi upload dan kembalikan byte yang sudah terunggah (jika ada)."""
    file_id = hashlib.md5(f"{body.file_name}_{body.file_size}_{_user.id}".encode()).hexdigest()
    file_path = os.path.join(UPLOAD_DIR, f"{file_id}.part")
    
    uploaded_bytes = 0
    if os.path.exists(file_path):
        uploaded_bytes = os.path.getsize(file_path)
        if uploaded_bytes > body.file_size:
            os.remove(file_path)
            uploaded_bytes = 0
            
    return {"upload_id": file_id, "uploaded_bytes": uploaded_bytes}

@router.post("/upload/{upload_id}/chunk")
async def upload_chunk(upload_id: str, request: Request, _user=Depends(get_current_user)):
    """Terima potongan byte dari frontend dan append ke file part."""
    file_path = os.path.join(UPLOAD_DIR, f"{upload_id}.part")
    chunk_data = await request.body()
    
    with open(file_path, "ab") as f:
        f.write(chunk_data)
        
    return {"success": True, "uploaded_bytes": os.path.getsize(file_path)}

@router.post("/upload/{upload_id}/finish")
async def finish_upload(
    upload_id: str, 
    body: UploadInitRequest, 
    db: Session = Depends(get_session), 
    _user=Depends(get_current_user)
):
    """Picu pengunggahan ke Telegram setelah semua chunk diterima."""
    file_path = os.path.join(UPLOAD_DIR, f"{upload_id}.part")
    if not os.path.exists(file_path):
        raise HTTPException(404, "File part tidak ditemukan. Mulai ulang upload.")
        
    try:
        client = await telegram_manager.get_client()
        peer = _get_peer(body.folder_id)
        
        # Telethon otomatis menangani upload file besar
        msg = await client.send_file(
            peer,
            file_path,
            caption="",
            force_document=True,
        )
        
        os.remove(file_path)
        
        # Simpan ke FileCache
        fc = FileCache(
            message_id=msg.id,
            folder_id=body.folder_id,
            file_name=body.file_name,
            file_size=body.file_size,
            mime_type="application/octet-stream", 
            date=msg.date
        )
        db.add(fc)
        db.commit()

        return {
            "done": True,
            "message_id": msg.id,
            "file_name": body.file_name,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _get_peer(folder_id: Optional[int]):
    """Konversi folder_id ke peer Telethon. None = Saved Messages."""
    return folder_id if folder_id else "me"


def _extract_file_info(message, folder_id: Optional[int]) -> Optional[FileInfo]:
    """Ekstrak metadata file dari sebuah pesan Telegram."""
    if not message.media:
        return None

    doc = getattr(message.media, "document", None)
    photo = getattr(message.media, "photo", None)

    if doc:
        file_name = "unknown"
        mime_type = doc.mime_type or "application/octet-stream"
        for attr in doc.attributes:
            from telethon.tl.types import DocumentAttributeFilename, DocumentAttributeVideo, DocumentAttributeAudio
            if isinstance(attr, DocumentAttributeFilename):
                file_name = attr.file_name
            elif isinstance(attr, DocumentAttributeVideo):
                return FileInfo(
                    message_id=message.id,
                    folder_id=folder_id,
                    file_name=file_name,
                    file_size=doc.size,
                    mime_type=mime_type,
                    date=message.date,
                    has_thumbnail=bool(doc.thumbs),
                    duration=getattr(attr, "duration", None),
                    width=getattr(attr, "w", None),
                    height=getattr(attr, "h", None),
                )
            elif isinstance(attr, DocumentAttributeAudio):
                return FileInfo(
                    message_id=message.id,
                    folder_id=folder_id,
                    file_name=file_name,
                    file_size=doc.size,
                    mime_type=mime_type,
                    date=message.date,
                    has_thumbnail=False,
                    duration=getattr(attr, "duration", None),
                )
        return FileInfo(
            message_id=message.id,
            folder_id=folder_id,
            file_name=file_name,
            file_size=doc.size,
            mime_type=mime_type,
            date=message.date,
            has_thumbnail=bool(doc.thumbs),
        )

    elif photo:
        return FileInfo(
            message_id=message.id,
            folder_id=folder_id,
            file_name=f"photo_{message.id}.jpg",
            file_size=0,
            mime_type="image/jpeg",
            date=message.date,
            has_thumbnail=True,
        )

    return None


# ─────────────────────────────────────
# LIST FILES
# ─────────────────────────────────────
@router.get("", response_model=FileListResponse)
async def list_files(
    folder_id: Optional[int] = Query(default=None),
    limit: int = Query(default=50, le=200),
    offset_id: int = Query(default=0),
    sync: bool = Query(default=False),
    db: Session = Depends(get_session),
    _user=Depends(get_current_user),
):
    """Ambil daftar file dalam folder. Gunakan offset_id untuk pagination."""
    try:
        # Cek cache lokal
        if not sync:
            query = select(FileCache).where(FileCache.folder_id == folder_id).order_by(FileCache.date.desc())
            if offset_id > 0:
                query = query.where(FileCache.message_id < offset_id)
            query = query.limit(limit + 1)
            
            cached = db.exec(query).all()
            if cached:
                has_more = len(cached) > limit
                files = cached[:limit]
                # Convert FileCache to FileInfo
                file_infos = [
                    FileInfo(
                        message_id=f.message_id, folder_id=f.folder_id, file_name=f.file_name,
                        file_size=f.file_size, mime_type=f.mime_type, date=f.date,
                        has_thumbnail=f.has_thumbnail, duration=f.duration, width=f.width, height=f.height
                    ) for f in files
                ]
                return FileListResponse(files=file_infos, total=len(file_infos), has_more=has_more)

        # Jika cache kosong atau sync=True, ambil dari Telegram
        client = await telegram_manager.get_client()
        peer = _get_peer(folder_id)
        files = []

        # Bersihkan cache untuk folder ini jika sync
        if sync:
            db.exec(select(FileCache).where(FileCache.folder_id == folder_id)).all()
            old_files = db.exec(select(FileCache).where(FileCache.folder_id == folder_id)).all()
            for old_file in old_files:
                db.delete(old_file)
            db.commit()

        kwargs = {"limit": limit + 1}
        if offset_id > 0:
            kwargs["offset_id"] = offset_id

        async for msg in client.iter_messages(peer, **kwargs):
            info = _extract_file_info(msg, folder_id)
            if info:
                files.append(info)
                # Simpan ke DB (gunakan merge agar tidak error duplikat)
                fc = FileCache(
                    message_id=info.message_id, folder_id=info.folder_id, file_name=info.file_name,
                    file_size=info.file_size, mime_type=info.mime_type, date=info.date,
                    has_thumbnail=info.has_thumbnail, duration=info.duration, width=info.width, height=info.height
                )
                existing = db.exec(select(FileCache).where(FileCache.message_id == fc.message_id)).first()
                if not existing:
                    db.add(fc)
                
        db.commit()

        has_more = len(files) > limit
        if has_more:
            files = files[:limit]

        return FileListResponse(files=files, total=len(files), has_more=has_more)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



# DOWNLOAD FILE
# ─────────────────────────────────────
@router.get("/{message_id}/download")
async def download_file(
    message_id: int,
    folder_id: Optional[int] = Query(default=None),
    _user=Depends(get_current_user),
):
    """Download file langsung dari Telegram ke browser."""
    try:
        client = await telegram_manager.get_client()
        peer = _get_peer(folder_id)

        messages = await client.get_messages(peer, ids=message_id)
        msg = messages if not isinstance(messages, list) else (messages[0] if messages else None)

        if not msg or not msg.media:
            raise HTTPException(status_code=404, detail="File tidak ditemukan.")

        # Dapatkan nama dan MIME type file
        file_name = f"file_{message_id}"
        mime_type = "application/octet-stream"

        doc = getattr(msg.media, "document", None)
        if doc:
            mime_type = doc.mime_type or mime_type
            for attr in doc.attributes:
                from telethon.tl.types import DocumentAttributeFilename
                if isinstance(attr, DocumentAttributeFilename):
                    file_name = attr.file_name
                    break

        async def stream_generator():
            async for chunk in client.iter_download(msg.media):
                yield chunk

        return StreamingResponse(
            stream_generator(),
            media_type=mime_type,
            headers={
                "Content-Disposition": f'attachment; filename="{file_name}"',
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────
# DELETE FILE
# ─────────────────────────────────────
@router.delete("/{message_id}")
async def delete_file(
    message_id: int,
    folder_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_session),
    _user=Depends(get_current_user),
):
    """Hapus file (hapus pesan di Telegram)."""
    try:
        client = await telegram_manager.get_client()
        peer = _get_peer(folder_id)
        await client.delete_messages(peer, [message_id])
        
        # Hapus dari cache
        cached = db.exec(select(FileCache).where(FileCache.message_id == message_id)).first()
        if cached:
            db.delete(cached)
            db.commit()
            
        return {"success": True, "message": "File berhasil dihapus."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────
# RENAME FILE (edit caption pesan)
# ─────────────────────────────────────
@router.patch("/{message_id}")
async def rename_file(
    message_id: int,
    body: FileRenameRequest,
    folder_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_session),
    _user=Depends(get_current_user),
):
    """
    Rename file dengan mengedit caption pesan.
    Catatan: Telegram tidak mendukung rename dokumen asli,
    jadi nama baru disimpan di caption pesan.
    """
    try:
        client = await telegram_manager.get_client()
        peer = _get_peer(folder_id)

        await client.edit_message(peer, message_id, text=f"📄 {body.new_name}")
        
        # Update cache
        cached = db.exec(select(FileCache).where(FileCache.message_id == message_id)).first()
        if cached:
            cached.file_name = body.new_name
            db.add(cached)
            db.commit()
            
        return {"success": True, "new_name": body.new_name}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────
# MOVE FILE (forward ke folder lain, hapus dari asli)
# ─────────────────────────────────────
@router.post("/{message_id}/move")
async def move_file(
    message_id: int,
    body: FileMoveRequest,
    folder_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_session),
    _user=Depends(get_current_user),
):
    """Pindahkan file ke folder lain dengan cara forward + delete."""
    try:
        client = await telegram_manager.get_client()
        src_peer = _get_peer(folder_id)
        dst_peer = _get_peer(body.target_folder_id)

        messages = await client.get_messages(src_peer, ids=message_id)
        msg = messages if not isinstance(messages, list) else (messages[0] if messages else None)
        if not msg:
            raise HTTPException(status_code=404, detail="Pesan tidak ditemukan.")

        # Forward ke tujuan
        fwd_msg = await client.forward_messages(dst_peer, msg)
        new_msg_id = fwd_msg[0].id if isinstance(fwd_msg, list) else fwd_msg.id

        # Hapus dari sumber
        await client.delete_messages(src_peer, [message_id])
        
        # Update cache (hapus yang lama, buat yang baru)
        cached = db.exec(select(FileCache).where(FileCache.message_id == message_id)).first()
        if cached:
            new_cache = FileCache(
                message_id=new_msg_id,
                folder_id=body.target_folder_id,
                file_name=cached.file_name,
                file_size=cached.file_size,
                mime_type=cached.mime_type,
                date=cached.date,
                has_thumbnail=cached.has_thumbnail,
                duration=cached.duration,
                width=cached.width,
                height=cached.height
            )
            db.delete(cached)
            db.add(new_cache)
            db.commit()

        return {"success": True, "message": "File berhasil dipindahkan."}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
