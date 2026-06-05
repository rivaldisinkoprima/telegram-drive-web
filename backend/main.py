"""
Main FastAPI Application — Entry Point Backend
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from models.database import create_db_and_tables
from routers import auth, folders, files, streaming, sharing, settings as settings_router, setup

app = FastAPI(
    title="Telegram Drive Web — API",
    description="Backend API untuk Telegram Drive Web. Dibangun dengan FastAPI + Telethon.",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

# ─── CORS Middleware ───────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Database Init ─────────────────────────────────────────
@app.on_event("startup")
async def on_startup():
    create_db_and_tables()
    print("Database siap.")
    print(f"API Docs: http://localhost:{settings.backend_port}/api/docs")

    # ── Auto-reconnect: jika session file ada, konek ulang tanpa login ──
    from routers.setup import get_stored_telegram_config
    from services.telegram_client import telegram_manager
    import os

    cfg = get_stored_telegram_config()
    session_path = os.path.join(settings.session_dir, "user.session")

    if cfg and os.path.exists(session_path):
        try:
            await telegram_manager.initialize(cfg["api_id"], cfg["api_hash"])
            if await telegram_manager.is_authorized():
                print("🔄 Session Telegram dipulihkan otomatis.")
            else:
                print("⚠️  Session file ada tapi tidak authorized. Perlu login ulang.")
        except Exception as e:
            print(f"⚠️  Gagal auto-reconnect Telegram: {e}")

# ─── Routers ──────────────────────────────────────────────
app.include_router(setup.router)           # /api/setup (publik)
app.include_router(auth.router, prefix="/api")
app.include_router(folders.router, prefix="/api")
app.include_router(files.router, prefix="/api")
app.include_router(streaming.router, prefix="/api")
app.include_router(sharing.router)         # /api/share & /s/{token} (publik)
app.include_router(settings_router.router) # /api/settings

# ─── Health Check ─────────────────────────────────────────
@app.get("/api/health", tags=["Health"])
async def health():
    return {"status": "ok", "service": "Telegram Drive Web API"}
