import uuid
from typing import Optional, List, Dict, Any
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Request
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

router = APIRouter(prefix="/users", tags=["users"])

# ─── Schemas ───

class UserProfileResponse(BaseModel):
    id: uuid.UUID
    email: str
    display_name: Optional[str] = None
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

# ─── Profile Endpoints ───

@router.get("/me", response_model=UserProfileResponse)
async def get_profile(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    user_id = request.state.user_id
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

    return UserProfileResponse(
        id=current_user.id,
        email=current_user.email,
        display_name=current_user.display_name,
        created_at=current_user.created_at,
        last_login=current_user.last_login,
        total_queries=total_queries,
        total_documents=total_documents,
        storage_used_mb=storage_used_mb,
        plan=current_user.plan or "free"
    )

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

    await db.commit()
    await db.refresh(current_user)

    return await get_profile(request, db)

@router.delete("/me")
async def delete_account(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    user_id = request.state.user_id
    user_result = await db.execute(select(User).where(User.id == user_id))
    current_user = user_result.scalars().first()
    if current_user:
        await db.delete(current_user)
        await db.commit()
    return {"message": "Account deleted"}

# ─── Settings Endpoints ───

@router.get("/me/settings", response_model=UserSettings)
async def get_settings(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    user_id = request.state.user_id
    user_result = await db.execute(select(User).where(User.id == user_id))
    current_user = user_result.scalars().first()

    if not current_user or not current_user.settings:
        return UserSettings()
    return UserSettings(**current_user.settings)

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
