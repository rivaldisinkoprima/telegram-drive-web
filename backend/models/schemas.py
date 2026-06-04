from pydantic import BaseModel
from typing import Optional
from datetime import datetime


# =====================
# Setup Schemas
# =====================

class TelegramConfig(BaseModel):
    api_id: int
    api_hash: str
    app_name: Optional[str] = "Telegram Drive Web"

class TelegramConfigStatus(BaseModel):
    configured: bool
    api_id: Optional[int] = None
    app_name: Optional[str] = None


# =====================
# Auth Schemas
# =====================

class SendCodeRequest(BaseModel):
    phone: str
    # api_id/api_hash opsional — jika tidak diisi, dibaca dari config storage
    api_id: Optional[int] = None
    api_hash: Optional[str] = None

class SignInRequest(BaseModel):
    code: str

class CheckPasswordRequest(BaseModel):
    password: str

class QRLoginRequest(BaseModel):
    # api_id/api_hash opsional — jika tidak diisi, dibaca dari config storage
    api_id: Optional[int] = None
    api_hash: Optional[str] = None

class AuthResult(BaseModel):
    success: bool
    next_step: Optional[str] = None  # "otp", "password", "dashboard"
    error: Optional[str] = None

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

class UserInfo(BaseModel):
    id: int
    first_name: str
    last_name: Optional[str] = None
    username: Optional[str] = None
    phone: Optional[str] = None


# =====================
# Folder Schemas
# =====================

class FolderCreate(BaseModel):
    name: str

class FolderRename(BaseModel):
    new_name: str

class FolderInfo(BaseModel):
    id: int
    name: str
    username: Optional[str] = None
    is_public: bool = False


# =====================
# File Schemas
# =====================

class FileInfo(BaseModel):
    message_id: int
    folder_id: Optional[int] = None
    file_name: str
    file_size: int
    mime_type: str
    date: datetime
    has_thumbnail: bool = False
    duration: Optional[int] = None   # untuk audio/video (detik)
    width: Optional[int] = None      # untuk gambar/video
    height: Optional[int] = None

class FileListResponse(BaseModel):
    files: list[FileInfo]
    total: int
    has_more: bool

class FileMoveRequest(BaseModel):
    target_folder_id: Optional[int] = None  # None = Saved Messages

class FileRenameRequest(BaseModel):
    new_name: str


# =====================
# Share Link Schemas
# =====================

class ShareCreateRequest(BaseModel):
    message_id: int
    folder_id: Optional[int] = None
    password: Optional[str] = None
    expires_in_hours: Optional[int] = None  # None = tidak ada batas waktu

class ShareInfo(BaseModel):
    token: str
    file_name: str
    file_size: int
    mime_type: str
    has_password: bool
    expires_at: Optional[datetime] = None
    created_at: datetime
    download_count: int
    share_url: str


# =====================
# Settings Schemas
# =====================

class ProxySettings(BaseModel):
    enabled: bool = False
    proxy_type: str = "socks5"  # "socks5" | "mtproto"
    host: str = ""
    port: int = 1080
    username: str = ""
    password: str = ""

class NetworkSettings(BaseModel):
    download_limit_kbps: int = 0   # 0 = tidak terbatas
    upload_limit_kbps: int = 0     # 0 = tidak terbatas
    retry_attempts: int = 3
    chunk_size_kb: int = 512
