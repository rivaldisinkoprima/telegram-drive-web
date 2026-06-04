"""
Folders Router — CRUD untuk folder (Telegram Channels)
"""
from fastapi import APIRouter, HTTPException, Depends
from telethon.tl.functions.channels import (
    CreateChannelRequest, DeleteChannelRequest, EditTitleRequest,
)
from telethon.tl.functions.messages import SetHistoryTTLRequest
from telethon.tl.types import InputPeerChannel
from sqlmodel import select, Session
from models.schemas import FolderCreate, FolderRename, FolderInfo
from models.database import FolderCache, get_session
from services.telegram_client import telegram_manager
from services.auth_service import get_current_user

router = APIRouter(prefix="/folders", tags=["Folders"])

TD_MARKER = "[telegram-drive-folder]"


def _is_td_folder(channel) -> bool:
    """Cek apakah channel adalah folder Telegram Drive."""
    about = getattr(channel, "about", "") or ""
    title = getattr(channel, "title", "") or ""
    return TD_MARKER in about or title.endswith("[TD]")


@router.get("", response_model=list[FolderInfo])
async def list_folders(
    sync: bool = False,
    db: Session = Depends(get_session),
    _user=Depends(get_current_user)
):
    """Ambil semua folder (channel privat yang dibuat oleh aplikasi ini)."""
    try:
        # Cek cache lokal dulu (sangat cepat)
        cached_folders = db.exec(select(FolderCache)).all()
        if cached_folders and not sync:
            return [FolderInfo(
                id=f.id, name=f.name, username=f.username, is_public=f.is_public
            ) for f in cached_folders]

        client = await telegram_manager.get_client()
        folders = []

        # Bersihkan cache lama jika kita melakukan sync ulang
        if sync:
            for f in cached_folders:
                db.delete(f)
            db.commit()

        async for dialog in client.iter_dialogs():
            if dialog.is_channel and not dialog.is_group:
                entity = dialog.entity
                if _is_td_folder(entity):
                    name = entity.title.replace(" [TD]", "").strip()
                    username = getattr(entity, "username", None)
                    is_public = bool(username)
                    folders.append(FolderInfo(
                        id=entity.id,
                        name=name,
                        username=username,
                        is_public=is_public,
                    ))
                    # Simpan ke cache
                    if not db.exec(select(FolderCache).where(FolderCache.id == entity.id)).first():
                        db.add(FolderCache(
                            id=entity.id, name=name, username=username, is_public=is_public
                        ))
        
        db.commit()
        return folders
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("", response_model=FolderInfo)
async def create_folder(
    body: FolderCreate, 
    db: Session = Depends(get_session),
    _user=Depends(get_current_user)
):
    """Buat folder baru (channel privat baru di Telegram)."""
    try:
        client = await telegram_manager.get_client()

        result = await client(CreateChannelRequest(
            broadcast=True,
            megagroup=False,
            title=f"{body.name} [TD]",
            about=f"Telegram Drive Storage Folder\n{TD_MARKER}",
        ))

        channel = result.chats[0]

        # Matikan TTL (pesan tidak otomatis terhapus)
        try:
            await client(SetHistoryTTLRequest(
                peer=InputPeerChannel(channel.id, channel.access_hash),
                period=0,
            ))
        except Exception:
            pass

        # Simpan ke cache
        new_folder = FolderCache(
            id=channel.id,
            name=body.name,
            username=None,
            is_public=False,
        )
        db.add(new_folder)
        db.commit()

        return FolderInfo(
            id=channel.id,
            name=body.name,
            username=None,
            is_public=False,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{folder_id}")
async def delete_folder(
    folder_id: int, 
    db: Session = Depends(get_session),
    _user=Depends(get_current_user)
):
    """Hapus folder (channel) beserta semua isinya."""
    try:
        client = await telegram_manager.get_client()
        entity = await client.get_entity(folder_id)

        await client(DeleteChannelRequest(channel=entity))
        
        # Hapus dari cache
        cached = db.exec(select(FolderCache).where(FolderCache.id == folder_id)).first()
        if cached:
            db.delete(cached)
            db.commit()
            
        return {"success": True, "message": f"Folder {folder_id} berhasil dihapus."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{folder_id}", response_model=FolderInfo)
async def rename_folder(
    folder_id: int,
    body: FolderRename,
    db: Session = Depends(get_session),
    _user=Depends(get_current_user),
):
    """Ganti nama folder."""
    try:
        client = await telegram_manager.get_client()
        entity = await client.get_entity(folder_id)

        await client(EditTitleRequest(
            channel=entity,
            title=f"{body.new_name} [TD]",
        ))

        # Update cache
        cached = db.exec(select(FolderCache).where(FolderCache.id == folder_id)).first()
        if cached:
            cached.name = body.new_name
            db.add(cached)
            db.commit()

        return FolderInfo(
            id=folder_id,
            name=body.new_name,
            username=getattr(entity, "username", None),
            is_public=bool(getattr(entity, "username", None)),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
