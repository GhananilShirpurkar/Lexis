from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.config import settings

# Enforce async driver for SQLAlchemy connection url
database_url = settings.DATABASE_URL
if database_url.startswith("postgresql://"):
    database_url = database_url.replace("postgresql://", "postgresql+asyncpg://", 1)

# Handle query parameters for asyncpg (strip query string and enforce SSL if requested)
connect_args = {}
if "?" in database_url:
    import urllib.parse as urlparse
    parsed = urlparse.urlparse(database_url)
    query = urlparse.parse_qs(parsed.query)
    sslmode = query.get("sslmode", [None])[0]
    if sslmode in ["require", "prefer", "allow", "verify-ca", "verify-full"] or "ssl=true" in database_url.lower():
        connect_args["ssl"] = True
    parsed = parsed._replace(query="")
    database_url = urlparse.urlunparse(parsed)

# Initialize SQLAlchemy async database engine
engine = create_async_engine(
    database_url,
    pool_size=5,
    max_overflow=10,
    pool_pre_ping=True,
    echo=False,
    connect_args=connect_args
)

# Configure asynchronous session lifecycle factory
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False
)

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI database dependency provider.
    Yields an active database session, ensuring rollback on exception and auto-close.
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
