from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.auth.middleware import JWTMiddleware
from app.routers.auth import router as auth_router
from app.routers.documents import router as documents_router
from app.routers.chats import router as chats_router
from app.routers.projects import router as projects_router
from app.routers.notifications import router as notifications_router
from app.routers.users import router as users_router
from app.routers.public import router as public_router
from app.routers.workspaces import router as workspaces_router
from app.core.caching import cached_endpoint, health_cache
from app.db import base  # Register all models in SQLAlchemy registry

# Initialize FastAPI application instance
app = FastAPI(
    title="Lexis API",
    description="Backend API for Lexis SaaS RAG Application",
    version="1.0.0"
)

# Register routers
app.include_router(auth_router)
app.include_router(documents_router)
app.include_router(chats_router)
app.include_router(projects_router)
app.include_router(notifications_router)
app.include_router(users_router)
app.include_router(public_router)
app.include_router(workspaces_router)


from apscheduler.schedulers.asyncio import AsyncIOScheduler
from app.expiry.service import run_expiry_scan

scheduler = AsyncIOScheduler()

@app.on_event("startup")
async def start_scheduler():
    import sys
    from app.config import settings
    if "pytest" in sys.modules:
        return
    tavily_loaded = bool(settings.TAVILY_API_KEY)
    masked_key = (settings.TAVILY_API_KEY[:4] + "..." + settings.TAVILY_API_KEY[-4:]) if tavily_loaded and len(settings.TAVILY_API_KEY) > 8 else ("Set" if tavily_loaded else "Not Set")
    print(f"[STARTUP] TAVILY_API_KEY loaded: {tavily_loaded} ({masked_key})")
    scheduler.add_job(run_expiry_scan, "interval", hours=12)
    scheduler.start()
    print("Background scheduler started: run_expiry_scan registered at 12-hour intervals.")

@app.on_event("shutdown")
async def shutdown_scheduler():
    import sys
    if "pytest" in sys.modules:
        return
    scheduler.shutdown()
    print("Background scheduler shut down.")

import os
from fastapi.staticfiles import StaticFiles

# Mount static directory for avatar uploads and public media assets
static_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static")
os.makedirs(os.path.join(static_dir, "avatars"), exist_ok=True)
app.mount("/static", StaticFiles(directory=static_dir), name="static")

@app.on_event("startup")
async def init_db():
    import sys
    if "pytest" in sys.modules:
        return

    from sqlalchemy import text
    from app.db.base_class import Base
    from app.db.session import engine, AsyncSessionLocal
    from app.db.migrate_onboarding import run_onboarding_migration
    
    needs_reset = False
    # 1. Perform checking using a separate connection context
    try:
        async with engine.connect() as conn:
            # Check users, chats, invoices, and new onboarding columns
            await conn.execute(text("SELECT hashed_password, display_name, plan, settings, username, avatar_url, role, onboarding_completed, onboarding_skipped_at FROM users LIMIT 1"))
            await conn.execute(text("SELECT is_unified, is_workspace_chat, user_edited_title, generated_title, generated_summary, summary_status FROM chats LIMIT 1"))
            await conn.execute(text("SELECT id FROM invoices LIMIT 1"))
            await conn.execute(text("SELECT id FROM workspaces LIMIT 1"))
            await conn.execute(text("SELECT id FROM workspace_chats LIMIT 1"))
            await conn.execute(text("SELECT id FROM workspace_chat_metadata LIMIT 1"))
            await conn.execute(text("ALTER TABLE citations ALTER COLUMN excerpt TYPE TEXT"))
            await conn.commit()
    except Exception:
        needs_reset = True
            
    # 2. Perform recreation using a fresh transaction block if needed
    if needs_reset:
        print("Database schema mismatch or missing columns detected. Recreating all tables...")
        async with engine.begin() as conn:
            try:
                await conn.execute(text("DROP TABLE IF EXISTS alembic_version CASCADE"))
            except Exception:
                pass
            await conn.run_sync(Base.metadata.drop_all)
            await conn.run_sync(Base.metadata.create_all)
        print("Database tables recreated successfully.")

    # 3. Run onboarding migration for existing users
    try:
        async with AsyncSessionLocal() as session:
            await run_onboarding_migration(session)
    except Exception as e:
        print(f"Error running onboarding migration: {e}")

    # 4. Apply database performance indexes
    from app.db.create_indexes import apply_indexes
    try:
        await apply_indexes()
    except Exception as idx_err:
        print(f"Error applying database indexes: {idx_err}")

    # 4. Start Neon Compute keep-alive task to prevent cold starts
    import asyncio
    async def neon_keep_alive():
        while True:
            try:
                async with AsyncSessionLocal() as session:
                    await session.execute(text("SELECT 1"))
            except Exception:
                pass
            await asyncio.sleep(60)

    asyncio.create_task(neon_keep_alive())
    print("Neon DB keep-alive background task initiated (60s interval).")



# Configure CORS origins
# React + Vite development server usually runs on http://localhost:5173
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

from app.middleware.compression import SelectiveGZipMiddleware

# Add Auth, GZip, and CORS Middleware
app.add_middleware(JWTMiddleware)
app.add_middleware(SelectiveGZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


from fastapi import Request

@app.get("/health", tags=["Health Check"])
@cached_endpoint(health_cache, "health")
async def health_check(request: Request):
    """
    Health check endpoint returning system status and circuit breaker states (cached for 10s).
    """
    from app.core.circuit_breaker import tavily_breaker, llm_breaker, storage_breaker
    from app.cache import cache

    breakers = [tavily_breaker, llm_breaker, storage_breaker]
    all_open = all(b.state == "OPEN" for b in breakers)
    redis_connected = await cache.ping()
    
    return {
        "status": "degraded" if all_open else "healthy",
        "app": "Lexis RAG API",
        "version": "1.0.0",
        "cache": {
            "redis_connected": redis_connected
        },
        "circuit_breakers": {
            b.name: b.get_status() for b in breakers
        }
    }

@app.get("/", tags=["Root"])
async def root():
    """
    Root route welcoming users.
    """
    return {
        "message": "Welcome to Lexis RAG API. Please visit /docs for API documentation."
    }
