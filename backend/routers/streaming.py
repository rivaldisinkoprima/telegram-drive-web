"""
Streaming Router — Stream video/audio/gambar langsung dari Telegram
Mendukung HTTP Range Requests (206 Partial Content) untuk seek video.
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse, Response

from services.auth_service import get_current_user
from services.telegram_client import telegram_manager
from models.database import get_session, FileCache
from sqlmodel import Session, select
from routers.files import _resolve_peer

router = APIRouter(prefix="/stream", tags=["Streaming"])

CHUNK_SIZE = 1024 * 512  # 512 KB per chunk


def _parse_range_header(range_header: str, file_size: int):
    """Parse HTTP Range header. Returns (start, end)."""
    try:
        unit, ranges = range_header.split("=")
        if unit != "bytes":
            return 0, file_size - 1
        start_str, end_str = ranges.split("-")
        start = int(start_str) if start_str else 0
        end = int(end_str) if end_str else file_size - 1
        return max(0, start), min(end, file_size - 1)
    except Exception:
        return 0, file_size - 1


@router.get("/{message_id}")
async def stream_file(
    message_id: int,
    request: Request,
    folder_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_session),
):
    """
    Stream file media (video/audio/gambar) dengan dukungan Range Request.
    Browser HTML5 <video> dan <audio> membutuhkan Range support agar
    fitur seek (lompat ke waktu tertentu) bisa berfungsi.
    """
    try:
        client = await telegram_manager.get_client()
        peer = await _resolve_peer(client, folder_id, db=db)

        messages = await client.get_messages(peer, ids=message_id)
        msg = messages if not isinstance(messages, list) else (messages[0] if messages else None)

        if not msg or not msg.media:
            raise HTTPException(status_code=404, detail="File tidak ditemukan.")

        # Ambil info ukuran dan MIME type
        doc = getattr(msg.media, "document", None)
        photo = getattr(msg.media, "photo", None)

        if doc:
            file_size = doc.size
            mime_type = doc.mime_type or "application/octet-stream"
        elif photo:
            file_size = 0  # Foto tidak diketahui ukurannya sebelum download
            mime_type = "image/jpeg"
        else:
            raise HTTPException(status_code=400, detail="Media tidak didukung untuk streaming.")

        # Parse Range header
        range_header = request.headers.get("Range")

        # Get file name and override mime_type from cache if available
        cached_file = db.exec(select(FileCache).where(FileCache.message_id == message_id)).first()
        file_name = cached_file.file_name if cached_file else "file"
        if cached_file and cached_file.mime_type:
            mime_type = cached_file.mime_type

        import urllib.parse
        encoded_name = urllib.parse.quote(file_name, safe='')
        disposition = f"inline; filename*=UTF-8''{encoded_name}"

        if range_header and file_size > 0:
            start, end = _parse_range_header(range_header, file_size)
            content_length = end - start + 1

            async def partial_generator():
                offset = start
                remaining = content_length
                async for chunk in client.iter_download(
                    msg.media,
                    offset=offset,
                    chunk_size=CHUNK_SIZE,
                ):
                    if remaining <= 0:
                        break
                    data = chunk[:remaining]
                    yield data
                    remaining -= len(data)

            return StreamingResponse(
                partial_generator(),
                status_code=206,
                media_type=mime_type,
                headers={
                    "Content-Range": f"bytes {start}-{end}/{file_size}",
                    "Accept-Ranges": "bytes",
                    "Content-Length": str(content_length),
                    "Cache-Control": "no-cache",
                    "Content-Disposition": disposition,
                },
            )
        else:
            # Streaming penuh tanpa Range
            async def full_generator():
                async for chunk in client.iter_download(msg.media, chunk_size=CHUNK_SIZE):
                    yield chunk

            headers = {
                "Accept-Ranges": "bytes",
                "Cache-Control": "no-cache",
                "Content-Disposition": disposition,
            }
            if file_size > 0:
                headers["Content-Length"] = str(file_size)

            return StreamingResponse(
                full_generator(),
                status_code=200,
                media_type=mime_type,
                headers=headers,
            )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/preview/{message_id}")
async def preview_file(
    message_id: int,
    folder_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_session),
):
    """
    Ambil thumbnail/preview gambar dari file.
    Digunakan untuk menampilkan thumbnail di grid view.
    """
    try:
        client = await telegram_manager.get_client()
        peer = await _resolve_peer(client, folder_id, db=db)

        messages = await client.get_messages(peer, ids=message_id)
        msg = messages if not isinstance(messages, list) else (messages[0] if messages else None)

        if not msg or not msg.media:
            raise HTTPException(status_code=404, detail="File tidak ditemukan.")

        # Unduh thumbnail (versi kecil)
        thumb_bytes = await client.download_media(msg, bytes, thumb=-1)

        if not thumb_bytes:
            raise HTTPException(status_code=404, detail="Thumbnail tidak tersedia.")

        return Response(
            content=thumb_bytes,
            media_type="image/jpeg",
            headers={"Cache-Control": "max-age=3600"},
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/pdf-thumbnail/{message_id}")
async def get_pdf_thumbnail(
    message_id: int,
    folder_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_session),
):
    """
    Menghasilkan thumbnail dari halaman pertama PDF menggunakan PyMuPDF.
    Hasilnya akan di-cache di disk agar tidak perlu dirender ulang.
    """
    import os
    import fitz
    from fastapi.responses import FileResponse
    
    THUMB_DIR = "data/thumbnails"
    os.makedirs(THUMB_DIR, exist_ok=True)
    thumb_path = os.path.join(THUMB_DIR, f"{message_id}.webp")

    # Return cached thumbnail if exists
    if os.path.exists(thumb_path):
        return FileResponse(thumb_path, media_type="image/webp", headers={"Cache-Control": "max-age=86400"})

    try:
        client = await telegram_manager.get_client()
        peer = await _resolve_peer(client, folder_id, db=db)
        messages = await client.get_messages(peer, ids=message_id)
        msg = messages if not isinstance(messages, list) else (messages[0] if messages else None)

        if not msg or not msg.media:
            raise HTTPException(status_code=404, detail="File tidak ditemukan.")

        # Download PDF ke memory
        pdf_bytes = await client.download_media(msg, bytes)
        if not pdf_bytes:
            raise HTTPException(status_code=404, detail="Gagal mengunduh PDF.")

        # Buka PDF dengan PyMuPDF dari memory
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        if doc.page_count == 0:
            raise HTTPException(status_code=400, detail="PDF kosong.")

        # Render halaman pertama (index 0)
        page = doc.load_page(0)
        # matrix 0.5 (resolusi rendah) sangat cukup untuk Card
        pix = page.get_pixmap(matrix=fitz.Matrix(0.5, 0.5))
        
        # Konversi ke WebP menggunakan Pillow untuk ukuran file yang jauh lebih kecil
        from PIL import Image
        import io
        img = Image.open(io.BytesIO(pix.tobytes("png")))
        img.save(thumb_path, format="WEBP", quality=75)
        
        doc.close()

        return FileResponse(thumb_path, media_type="image/webp", headers={"Cache-Control": "max-age=86400"})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

