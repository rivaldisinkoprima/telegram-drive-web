"""
Files Router — Upload, Download, List, Delete, Rename, Move file
"""
import os
import tempfile
import uuid
from typing import Optional

from fastapi import (
    APIRouter, Depends, HTTPException,
    Query, WebSocket, WebSocketDisconnect,
)
from fastapi.responses import StreamingResponse

from models.schemas import (
    FileInfo, FileListResponse, FileMoveRequest, FileRenameRequest,
)
from services.auth_service import get_current_user
from services.telegram_client import telegram_manager

router = APIRouter(prefix="/files", tags=["Files"])

# Simpan transfer yang sedang berjalan agar bisa dibatalkan
_active_transfers: dict[str, bool] = {}  # transfer_id -> cancelled


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
    _user=Depends(get_current_user),
):
    """Ambil daftar file dalam folder. Gunakan offset_id untuk pagination."""
    try:
        client = await telegram_manager.get_client()
        peer = _get_peer(folder_id)
        files = []

        kwargs = {"limit": limit + 1}
        if offset_id > 0:
            kwargs["offset_id"] = offset_id

        async for msg in client.iter_messages(peer, **kwargs):
            info = _extract_file_info(msg, folder_id)
            if info:
                files.append(info)

        has_more = len(files) > limit
        if has_more:
            files = files[:limit]

        return FileListResponse(files=files, total=len(files), has_more=has_more)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────
# UPLOAD FILE (via WebSocket for progress)
# ─────────────────────────────────────
@router.websocket("/ws/upload")
async def upload_file_ws(websocket: WebSocket):
    """
    WebSocket upload endpoint dengan progress real-time.
    Protokol:
      Client → Server: JSON metadata { "folder_id": int|null, "file_name": str, "file_size": int }
      Client → Server: binary chunks of file data
      Server → Client: JSON progress { "percent": int, "uploaded": int, "total": int, "speed": int }
      Server → Client: JSON done { "done": true, "message_id": int } | { "error": str }
    """
    await websocket.accept()

    try:
        # Terima metadata
        meta = await websocket.receive_json()
        folder_id = meta.get("folder_id")
        file_name = meta.get("file_name", "upload")
        file_size = meta.get("file_size", 0)

        client = await telegram_manager.get_client()

        # Simpan ke temp file
        with tempfile.NamedTemporaryFile(delete=False, suffix=f"_{file_name}") as tmp:
            tmp_path = tmp.name
            received = 0

            while received < file_size:
                chunk = await websocket.receive_bytes()
                tmp.write(chunk)
                received += len(chunk)

                pct = int(received / file_size * 100) if file_size else 0
                await websocket.send_json({
                    "percent": min(pct, 99),
                    "uploaded": received,
                    "total": file_size,
                    "speed": 0,
                })

        # Upload ke Telegram
        uploaded_bytes = 0

        async def progress_cb(current, total):
            nonlocal uploaded_bytes
            uploaded_bytes = current
            pct = int(current / total * 100) if total else 0
            try:
                await websocket.send_json({
                    "percent": min(pct, 99),
                    "uploaded": current,
                    "total": total,
                    "speed": 0,
                })
            except Exception:
                pass

        peer = _get_peer(folder_id)
        msg = await client.send_file(
            peer,
            tmp_path,
            caption="",
            force_document=True,
            progress_callback=progress_cb,
        )

        os.unlink(tmp_path)

        await websocket.send_json({
            "done": True,
            "percent": 100,
            "message_id": msg.id,
            "file_name": file_name,
        })

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({"error": str(e)})
        except Exception:
            pass


# ─────────────────────────────────────
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
    _user=Depends(get_current_user),
):
    """Hapus file (hapus pesan di Telegram)."""
    try:
        client = await telegram_manager.get_client()
        peer = _get_peer(folder_id)
        await client.delete_messages(peer, [message_id])
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
        await client.forward_messages(dst_peer, msg)

        # Hapus dari sumber
        await client.delete_messages(src_peer, [message_id])

        return {"success": True, "message": "File berhasil dipindahkan."}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
