import os
from pydantic_settings import BaseSettings
from functools import lru_cache


import secrets

class Settings(BaseSettings):
    # JWT
    secret_key: str = os.getenv("SECRET_KEY", secrets.token_hex(32))
    access_token_expire_minutes: int = 10080  # 7 hari

    # Server
    backend_host: str = "0.0.0.0"
    backend_port: int = 8000

    # CORS
    allowed_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # Storage paths
    session_dir: str = "./session"
    db_path: str = "./db/app.db"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",")]


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

# Pastikan direktori tersedia
os.makedirs(settings.session_dir, exist_ok=True)
os.makedirs(os.path.dirname(settings.db_path), exist_ok=True)
