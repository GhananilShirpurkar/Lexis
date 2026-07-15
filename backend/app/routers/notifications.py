import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.db.session import get_db
from app.models.notification import Notification
from app.auth.ownership import assert_owns
from app.schemas.notification import NotificationResponse, NotificationUpdate

router = APIRouter(prefix="/notifications", tags=["Notifications"])

@router.get(
    "",
    response_model=List[NotificationResponse],
    status_code=status.HTTP_200_OK,
    summary="Get user notifications",
    description="Retrieves a list of notifications for the authenticated user, ordered by creation time descending."
)
async def list_notifications(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """
    GET /notifications: Retrieves a list of notifications belonging to the authenticated user.
    """
    user_id = request.state.user_id
    
    query = select(Notification).where(
        Notification.user_id == user_id
    ).order_by(Notification.created_at.desc())
    
    result = await db.execute(query)
    notifications = result.scalars().all()
    
    return notifications


@router.patch(
    "/{notif_id}",
    response_model=NotificationResponse,
    status_code=status.HTTP_200_OK,
    summary="Update notification status",
    description="Updates the read/unread status of a notification belonging to the authenticated user."
)
async def update_notification(
    request: Request,
    notif_id: uuid.UUID,
    payload: NotificationUpdate,
    db: AsyncSession = Depends(get_db)
):
    """
    PATCH /notifications/{notif_id}: Marks notification status as 'read' or 'unread'.
    Performs ownership check and returns 403 on mismatch, 404 on missing.
    """
    user_id = request.state.user_id
    
    # 1. Fetch notification
    query = select(Notification).where(Notification.id == notif_id)
    result = await db.execute(query)
    notification = result.scalars().first()
    
    # 2. Assert ownership (raises 404 if None, 403 if unauthorized)
    await assert_owns(user_id, notification)
    
    # 3. Update status
    notification.status = payload.status
    db.add(notification)
    await db.commit()
    await db.refresh(notification)
    
    return notification
