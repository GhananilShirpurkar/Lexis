from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from app.config import settings

# Enforce async driver for SQLAlchemy connection url
database_url = settings.DATABASE_URL
if database_url.startswith("postgresql://"):
    database_url = database_url.replace("postgresql://", "postgresql+asyncpg://", 1)

# Initialize SQLAlchemy async database engine
engine = create_async_engine(
    database_url,
    pool_size=5,
    max_overflow=10,
    pool_pre_ping=True,
    echo=False
)

# Configure asynchronous session lifecycle factory
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False
)
