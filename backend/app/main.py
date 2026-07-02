from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.auth.middleware import JWTMiddleware
from app.routers.auth import router as auth_router
from app.db import base  # Register all models in SQLAlchemy registry

# Initialize FastAPI application instance
app = FastAPI(
    title="Lexis API",
    description="Backend API for Lexis SaaS RAG Application",
    version="1.0.0"
)

# Register routers
app.include_router(auth_router)


@app.on_event("startup")
async def init_db():
    from sqlalchemy import text
    from app.db.base_class import Base
    from app.db.session import engine
    
    needs_reset = False
    # 1. Perform checking using a separate connection context (will rollback failure automatically)
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT hashed_password FROM users LIMIT 1"))
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
