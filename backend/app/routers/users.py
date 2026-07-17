import uuid
import re
import os
import shutil
import logging
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Request, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func
from pydantic import BaseModel

from app.db.session import get_db
from app.models.user import User
from app.models.document import Document
from app.models.chat import Chat
from app.models.message import Message
from app.models.invoice import Invoice
from app.schemas.user import OnboardingUpdate, OnboardingStatusResponse, UsernameCheckResponse, UserDeleteRequest
from app.auth.utils import verify_password
from app.storage.r2_client import delete_file
from app.config import settings
from app.cache import cache

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/users", tags=["users"])

# ─── Schemas ───

class UserProfileResponse(BaseModel):
    id: uuid.UUID
    email: str
    username: Optional[str] = None
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    role: Optional[str] = None
    onboarding_completed: bool = False
    onboarding_skipped_at: Optional[datetime] = None
    created_at: datetime
    last_login: Optional[datetime] = None
    total_queries: int
    total_documents: int
    storage_used_mb: float
    plan: str = "free"

    class Config:
        from_attributes = True

class UserProfileUpdate(BaseModel):
    display_name: Optional[str] = None
    username: Optional[str] = None
    avatar_url: Optional[str] = None
    role: Optional[str] = None

class UserSettings(BaseModel):
    default_model: str = "gemini-1.5-flash"
    temperature: float = 0.7
    max_tokens: int = 2048
    top_p: float = 0.9
    top_k: int = 40
    response_style: str = "balanced"
    citation_mode: str = "inline"
    chunk_size: int = 512
    chunk_overlap: int = 128
    embedding_model: str = "text-embedding-3-small"
    auto_index: bool = True
    email_notifications: bool = True
    theme: str = "system"
    font_size: str = "medium"
    density: str = "comfortable"

class UsageStats(BaseModel):
    queries_used: int
    queries_limit: float
    documents_used: int
    documents_limit: float
    storage_used_mb: float
    storage_limit_mb: float
    plan: str

class InvoiceItem(BaseModel):
    id: str
    date: datetime
    description: str
    amount: str
    status: str

# ─── Onboarding & Username Endpoints ───

USERNAME_REGEX = re.compile(r"^[a-zA-Z0-9_]{3,30}$")

@router.get("/check-username", response_model=UsernameCheckResponse)
async def check_username(
    username: str,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    cleaned = username.strip()
    if not USERNAME_REGEX.match(cleaned):
        return UsernameCheckResponse(
            available=False,
            username=cleaned,
            reason="Username must be 3-30 characters long and contain only letters, numbers, and underscores."
        )

    # Check database availability
    user_id = getattr(request.state, "user_id", None)
    stmt = select(User).where(User.username == cleaned)
    if user_id:
        stmt = stmt.where(User.id != user_id)
        
    res = await db.execute(stmt)
    existing = res.scalars().first()

    if existing:
        return UsernameCheckResponse(
            available=False,
            username=cleaned,
            reason="This username is already taken."
        )

    return UsernameCheckResponse(available=True, username=cleaned)

@router.get("/me/onboarding-status", response_model=OnboardingStatusResponse)
async def get_onboarding_status(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    user_id = request.state.user_id
    user_result = await db.execute(select(User).where(User.id == user_id))
    current_user = user_result.scalars().first()
    if not current_user:
        raise HTTPException(status_code=404, detail="User not found")

    return OnboardingStatusResponse(
        onboarding_completed=current_user.onboarding_completed,
        onboarding_skipped_at=current_user.onboarding_skipped_at,
        username=current_user.username,
        display_name=current_user.display_name,
        avatar_url=current_user.avatar_url,
        role=current_user.role
    )

@router.patch("/me/onboarding", response_model=UserProfileResponse)
async def update_onboarding(
    payload: OnboardingUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    user_id = request.state.user_id
    user_result = await db.execute(select(User).where(User.id == user_id))
    current_user = user_result.scalars().first()
    if not current_user:
        raise HTTPException(status_code=404, detail="User not found")

    if payload.skip:
        current_user.onboarding_skipped_at = datetime.now(timezone.utc)
        current_user.onboarding_completed = False
    else:
        if not payload.username:
            raise HTTPException(status_code=400, detail="Username is required to complete onboarding")
        
        username_clean = payload.username.strip()
        if not USERNAME_REGEX.match(username_clean):
            raise HTTPException(status_code=400, detail="Invalid username format")
            
        # Check uniqueness
        check_stmt = select(User).where(User.username == username_clean, User.id != user_id)
        check_res = await db.execute(check_stmt)
        if check_res.scalars().first():
            raise HTTPException(status_code=409, detail="Username is already taken")

        current_user.username = username_clean
        current_user.display_name = payload.display_name.strip() if payload.display_name else username_clean
        if payload.avatar_url is not None:
            current_user.avatar_url = payload.avatar_url
        if payload.role is not None:
            current_user.role = payload.role
            
        current_user.onboarding_completed = True
        current_user.onboarding_skipped_at = None

    await db.commit()
    await db.refresh(current_user)
    return await get_profile(request, db)

@router.post("/me/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    request: Request = None,
    db: AsyncSession = Depends(get_db)
):
    user_id = request.state.user_id
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    # Limit file size to 2MB max
    contents = await file.read()
    if len(contents) > 2 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image size exceeds 2MB limit")

    ext = os.path.splitext(file.filename)[1] or ".png"
    filename = f"{user_id}{ext}"
    static_avatars_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "static", "avatars")
    os.makedirs(static_avatars_dir, exist_ok=True)
    filepath = os.path.join(static_avatars_dir, filename)

    with open(filepath, "wb") as f:
        f.write(contents)

    avatar_url = f"/static/avatars/{filename}"
    
    user_result = await db.execute(select(User).where(User.id == user_id))
    current_user = user_result.scalars().first()
    if current_user:
        current_user.avatar_url = avatar_url
        await db.commit()

    return {"avatar_url": avatar_url}

# ─── Profile Endpoints ───

@router.get("/me", response_model=UserProfileResponse)
async def get_profile(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    user_id = request.state.user_id
    cache_key = f"user:{user_id}:profile"
    cached_profile = await cache.get(cache_key)
    if cached_profile:
        return UserProfileResponse(**cached_profile)

    user_result = await db.execute(select(User).where(User.id == user_id))
    current_user = user_result.scalars().first()
    if not current_user:
        raise HTTPException(status_code=404, detail="User not found")

    # Count queries (user messages)
    queries_res = await db.execute(
        select(func.count(Message.id)).join(Chat).where(Chat.user_id == user_id, Message.role == "user")
    )
    total_queries = queries_res.scalar() or 0

    # Count documents
    docs_res = await db.execute(
        select(func.count(Document.id)).where(Document.user_id == user_id)
    )
    total_documents = docs_res.scalar() or 0

    # Calculate storage
    size_res = await db.execute(
        select(func.sum(Document.size_bytes)).where(Document.user_id == user_id)
    )
    bytes_sum = size_res.scalar() or 0
    storage_used_mb = round(bytes_sum / (1024 * 1024), 2)

    profile = UserProfileResponse(
        id=current_user.id,
        email=current_user.email,
        username=current_user.username,
        display_name=current_user.display_name,
        avatar_url=current_user.avatar_url,
        role=current_user.role,
        onboarding_completed=current_user.onboarding_completed,
        onboarding_skipped_at=current_user.onboarding_skipped_at,
        created_at=current_user.created_at,
        last_login=current_user.last_login,
        total_queries=total_queries,
        total_documents=total_documents,
        storage_used_mb=storage_used_mb,
        plan=current_user.plan or "free"
    )

    await cache.set(cache_key, profile.model_dump(mode="json"), ttl=300)
    return profile

@router.patch("/me", response_model=UserProfileResponse)
async def update_profile(
    update: UserProfileUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    user_id = request.state.user_id
    user_result = await db.execute(select(User).where(User.id == user_id))
    current_user = user_result.scalars().first()
    if not current_user:
        raise HTTPException(status_code=404, detail="User not found")

    if update.display_name is not None:
        if len(update.display_name) > 60:
            raise HTTPException(status_code=400, detail="Display name too long")
        current_user.display_name = update.display_name

    if update.username is not None:
        username_clean = update.username.strip()
        if not USERNAME_REGEX.match(username_clean):
            raise HTTPException(status_code=400, detail="Invalid username format")
        current_user.username = username_clean

    if update.avatar_url is not None:
        current_user.avatar_url = update.avatar_url

    if update.role is not None:
        current_user.role = update.role

    await db.commit()
    await db.refresh(current_user)
    await cache.delete(f"user:{user_id}:profile")

    return await get_profile(request, db)


@router.delete("/me")
async def delete_account(
    payload: UserDeleteRequest,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    user_id = request.state.user_id
    user_result = await db.execute(select(User).where(User.id == user_id))
    current_user = user_result.scalars().first()
    if not current_user:
        raise HTTPException(status_code=404, detail="User not found")

    # 1. Verify user password
    if not verify_password(payload.password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password. Account deletion denied."
        )

    # 2. Collect all document S3/Tigris keys prior to DB row deletion
    docs_result = await db.execute(select(Document).where(Document.user_id == user_id))
    user_docs = docs_result.scalars().all()
    r2_keys = [doc.r2_key for doc in user_docs if doc.r2_key]
    avatar_url = current_user.avatar_url

    # 3. Perform database deletion first (as instructed by user)
    # SQLAlchemy cascade will delete chats, messages, citations, documents, notifications, etc.
    await db.delete(current_user)
    await db.commit()

    # 4. Clean up Tigris/S3 object storage for all uploaded documents
    for key in r2_keys:
        try:
            delete_file(key)
        except Exception as e:
            logger.warning(f"Initial Tigris deletion failed for key '{key}': {e}. Retrying...")
            try:
                delete_file(key)
            except Exception as retry_err:
                logger.error(f"Failed second attempt to delete Tigris key '{key}': {retry_err}")

    # 5. Clean up local persistent index files
    user_index_dir = os.path.join(settings.STORAGE_INDICES_DIR, str(user_id))
    if os.path.exists(user_index_dir):
        try:
            shutil.rmtree(user_index_dir)
        except Exception as idx_err:
            logger.error(f"Failed to remove user vector index directory '{user_index_dir}': {idx_err}")

    # 6. Clean up custom avatar file from static directory if applicable
    if avatar_url and avatar_url.startswith("/static/avatars/"):
        filename = os.path.basename(avatar_url)
        static_avatar_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
            "static", "avatars", filename
        )
        if os.path.exists(static_avatar_path):
            try:
                os.remove(static_avatar_path)
            except Exception as av_err:
                logger.error(f"Failed to remove avatar file '{static_avatar_path}': {av_err}")

    return {"message": "Account and all associated data permanently deleted"}

# ─── Settings Endpoints ───

@router.get("/me/settings", response_model=UserSettings)
async def get_settings(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    user_id = request.state.user_id
    cache_key = f"user:{user_id}:settings"
    cached_settings = await cache.get(cache_key)
    if cached_settings:
        return UserSettings(**cached_settings)

    user_result = await db.execute(select(User).where(User.id == user_id))
    current_user = user_result.scalars().first()

    settings_obj = UserSettings(**current_user.settings) if (current_user and current_user.settings) else UserSettings()
    await cache.set(cache_key, settings_obj.model_dump(mode="json"), ttl=600)
    return settings_obj

@router.patch("/me/settings", response_model=UserSettings)
async def update_settings(
    settings: UserSettings,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    user_id = request.state.user_id
    user_result = await db.execute(select(User).where(User.id == user_id))
    current_user = user_result.scalars().first()
    if not current_user:
        raise HTTPException(status_code=404, detail="User not found")

    current_user.settings = settings.model_dump()
    await db.commit()
    await db.refresh(current_user)
    await cache.delete(f"user:{user_id}:settings")
    return settings

# ─── Usage & Billing Endpoints ───

@router.get("/me/usage", response_model=UsageStats)
async def get_usage(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    user_id = request.state.user_id
    user_result = await db.execute(select(User).where(User.id == user_id))
    current_user = user_result.scalars().first()
    plan = current_user.plan if current_user and current_user.plan else "free"

    PLAN_LIMITS = {
        "free": {"queries": 100, "documents": 10, "storage_mb": 100},
        "pro": {"queries": 2000, "documents": 100, "storage_mb": 5120},
        "team": {"queries": 999999, "documents": 999999, "storage_mb": 51200}
    }
    limits = PLAN_LIMITS.get(plan, PLAN_LIMITS["free"])

    queries_res = await db.execute(
        select(func.count(Message.id)).join(Chat).where(Chat.user_id == user_id, Message.role == "user")
    )
    queries_used = queries_res.scalar() or 0

    docs_res = await db.execute(
        select(func.count(Document.id)).where(Document.user_id == user_id)
    )
    documents_used = docs_res.scalar() or 0

    size_res = await db.execute(
        select(func.sum(Document.size_bytes)).where(Document.user_id == user_id)
    )
    bytes_sum = size_res.scalar() or 0
    storage_used_mb = round(bytes_sum / (1024 * 1024), 2)

    return UsageStats(
        queries_used=queries_used,
        queries_limit=limits["queries"],
        documents_used=documents_used,
        documents_limit=limits["documents"],
        storage_used_mb=storage_used_mb,
        storage_limit_mb=limits["storage_mb"],
        plan=plan
    )

@router.get("/me/invoices", response_model=List[InvoiceItem])
async def get_invoices(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    user_id = request.state.user_id
    invoices_res = await db.execute(
        select(Invoice).where(Invoice.user_id == user_id).order_by(Invoice.date.desc())
    )
    invoices = invoices_res.scalars().all()
    return [
        InvoiceItem(
            id=inv.id,
            date=inv.date,
            description=inv.description,
            amount=f"${inv.amount:.2f}",
            status=inv.status
        )
        for inv in invoices
    ]
