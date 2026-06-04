"""
Streaming Router — Stream video/audio/gambar langsung dari Telegram
Mendukung HTTP Range Requests (206 Partial Content) untuk seek video.
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse, Response

from services.auth_service import get_current_user
from services.telegram_client import telegram_manager

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
):
    """
    Stream file media (video/audio/gambar) dengan dukungan Range Request.
    Browser HTML5 <video> dan <audio> membutuhkan Range support agar
    fitur seek (lompat ke waktu tertentu) bisa berfungsi.
    """
    try:
        client = await telegram_manager.get_client()
        peer = folder_id if folder_id else "me"

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
):
    """
    Ambil thumbnail/preview gambar dari file.
    Digunakan untuk menampilkan thumbnail di grid view.
    """
    try:
        client = await telegram_manager.get_client()
        peer = folder_id if folder_id else "me"

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
