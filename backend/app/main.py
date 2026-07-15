from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.auth.middleware import JWTMiddleware
from app.routers.auth import router as auth_router
from app.routers.documents import router as documents_router
from app.routers.chats import router as chats_router
from app.routers.projects import router as projects_router
from app.routers.notifications import router as notifications_router
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


from apscheduler.schedulers.asyncio import AsyncIOScheduler
from app.expiry.service import run_expiry_scan

scheduler = AsyncIOScheduler()

@app.on_event("startup")
async def start_scheduler():
    import sys
    if "pytest" in sys.modules:
        return
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

@app.on_event("startup")
async def init_db():
    import sys
    if "pytest" in sys.modules:
        return

    from sqlalchemy import text
    from app.db.base_class import Base
    from app.db.session import engine
    
    needs_reset = False
    # 1. Perform checking using a separate connection context (will rollback failure automatically)
    try:
        async with engine.connect() as conn:
            # Check both users and chats tables to ensure all new fields/tables exist
            await conn.execute(text("SELECT hashed_password FROM users LIMIT 1"))
            await conn.execute(text("SELECT is_unified FROM chats LIMIT 1"))
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


# Configure CORS origins
# React + Vite development server usually runs on http://localhost:5173
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

# Add Auth and CORS Middleware
app.add_middleware(JWTMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["Health Check"])
async def health_check():
    """
    Health check endpoint returning system status.
    """
    return {
        "status": "healthy",
        "app": "Lexis RAG API",
        "version": "1.0.0"
    }

@app.get("/", tags=["Root"])
async def root():
    """
    Root route welcoming users.
    """
    return {
        "message": "Welcome to Lexis RAG API. Please visit /docs for API documentation."
    }
