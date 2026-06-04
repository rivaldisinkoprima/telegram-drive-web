"""
Folders Router — CRUD untuk folder (Telegram Channels)
"""
from fastapi import APIRouter, HTTPException, Depends
from telethon.tl.functions.channels import (
    CreateChannelRequest, DeleteChannelRequest, EditTitleRequest,
)
from telethon.tl.functions.messages import SetHistoryTTLRequest
from telethon.tl.types import InputPeerChannel
from models.schemas import FolderCreate, FolderRename, FolderInfo
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
async def list_folders(_user=Depends(get_current_user)):
    """Ambil semua folder (channel privat yang dibuat oleh aplikasi ini)."""
    try:
        client = await telegram_manager.get_client()
        folders = []

        async for dialog in client.iter_dialogs():
            if dialog.is_channel and not dialog.is_group:
                entity = dialog.entity
                if _is_td_folder(entity):
                    name = entity.title.replace(" [TD]", "").strip()
                    folders.append(FolderInfo(
                        id=entity.id,
                        name=name,
                        username=getattr(entity, "username", None),
                        is_public=bool(getattr(entity, "username", None)),
                    ))

        return folders
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("", response_model=FolderInfo)
async def create_folder(body: FolderCreate, _user=Depends(get_current_user)):
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

        return FolderInfo(
            id=channel.id,
            name=body.name,
            username=None,
            is_public=False,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{folder_id}")
async def delete_folder(folder_id: int, _user=Depends(get_current_user)):
    """Hapus folder (channel) beserta semua isinya."""
    try:
        client = await telegram_manager.get_client()
        entity = await client.get_entity(folder_id)

        await client(DeleteChannelRequest(channel=entity))
        return {"success": True, "message": f"Folder {folder_id} berhasil dihapus."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{folder_id}", response_model=FolderInfo)
async def rename_folder(
    folder_id: int,
    body: FolderRename,
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

        return FolderInfo(
            id=folder_id,
            name=body.new_name,
            username=getattr(entity, "username", None),
            is_public=bool(getattr(entity, "username", None)),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
