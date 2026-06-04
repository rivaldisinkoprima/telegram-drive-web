from sqlmodel import SQLModel, Field, create_engine, Session
from typing import Optional
from datetime import datetime
import uuid
from config import settings

# --- Tabel Share Links ---
class ShareLink(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    token: str = Field(default_factory=lambda: uuid.uuid4().hex, unique=True, index=True)
    message_id: int
    folder_id: Optional[int] = None
    file_name: str
    file_size: int = 0
    mime_type: str = "application/octet-stream"
    password_hash: Optional[str] = None
    expires_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    download_count: int = 0


# --- Tabel Folder Cache ---
class FolderCache(SQLModel, table=True):
    id: int = Field(primary_key=True)
    name: str
    username: Optional[str] = None
    is_public: bool = False


# --- Database Engine ---
engine = create_engine(
    f"sqlite:///{settings.db_path}",
    echo=False,
    connect_args={"check_same_thread": False},
)


def create_db_and_tables():
    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session
