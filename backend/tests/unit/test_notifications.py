import pytest
import uuid
from unittest.mock import patch, MagicMock, AsyncMock
from fastapi import HTTPException

from app.models.notification import Notification
from app.schemas.notification import NotificationUpdate
from app.routers.notifications import list_notifications, update_notification


@pytest.mark.asyncio
async def test_list_notifications():
    """Verify list_notifications queries and returns user notifications sorted DESC."""
    db_mock = AsyncMock()
    request_mock = MagicMock()
    user_id = uuid.uuid4()
    request_mock.state.user_id = user_id
    
    mock_notifs = [
        Notification(id=uuid.uuid4(), user_id=user_id, title="Alert 1", message="Msg 1", status="unread"),
        Notification(id=uuid.uuid4(), user_id=user_id, title="Alert 2", message="Msg 2", status="read")
    ]
    
    execute_result = MagicMock()
    execute_result.scalars().all.return_value = mock_notifs
    db_mock.execute.return_value = execute_result
    
    resp = await list_notifications(request=request_mock, db=db_mock)
    
    assert len(resp) == 2
    assert resp[0].title == "Alert 1"
    assert resp[1].status == "read"


@pytest.mark.asyncio
async def test_update_notification_success():
    """Verify update_notification successfully updates and commits state if owner matches."""
    db_mock = AsyncMock()
    request_mock = MagicMock()
    user_id = uuid.uuid4()
    request_mock.state.user_id = user_id
    notif_id = uuid.uuid4()
    
    mock_notif = Notification(
        id=notif_id,
        user_id=user_id,
        title="Alert",
        message="Msg",
        status="unread"
    )
    
    execute_result = MagicMock()
    execute_result.scalars().first.return_value = mock_notif
    db_mock.execute.return_value = execute_result
    
    payload = NotificationUpdate(status="read")
    
    resp = await update_notification(
        request=request_mock,
        notif_id=notif_id,
        payload=payload,
        db=db_mock
    )
    
    assert resp.status == "read"
    db_mock.commit.assert_called_once()


@pytest.mark.asyncio
async def test_update_notification_not_found():
    """Verify update_notification raises 404 Not Found if notification doesn't exist."""
    db_mock = AsyncMock()
    request_mock = MagicMock()
    user_id = uuid.uuid4()
    request_mock.state.user_id = user_id
    notif_id = uuid.uuid4()
    
    execute_result = MagicMock()
    execute_result.scalars().first.return_value = None
    db_mock.execute.return_value = execute_result
    
    payload = NotificationUpdate(status="read")
    
    with pytest.raises(HTTPException) as exc_info:
        await update_notification(
            request=request_mock,
            notif_id=notif_id,
            payload=payload,
            db=db_mock
        )
        
    assert exc_info.value.status_code == 404
    assert exc_info.value.detail["error"]["code"] == "RESOURCE_NOT_FOUND"


@pytest.mark.asyncio
async def test_update_notification_forbidden():
    """Verify update_notification raises 403 Forbidden if user is not the owner."""
    db_mock = AsyncMock()
    request_mock = MagicMock()
    user_id = uuid.uuid4()
    other_user_id = uuid.uuid4()
    request_mock.state.user_id = user_id
    notif_id = uuid.uuid4()
    
    mock_notif = Notification(
        id=notif_id,
        user_id=other_user_id,
        title="Alert",
        message="Msg",
        status="unread"
    )
    
    execute_result = MagicMock()
    execute_result.scalars().first.return_value = mock_notif
    db_mock.execute.return_value = execute_result
    
    payload = NotificationUpdate(status="read")
    
    with pytest.raises(HTTPException) as exc_info:
        await update_notification(
            request=request_mock,
            notif_id=notif_id,
            payload=payload,
            db=db_mock
        )
        
    assert exc_info.value.status_code == 403
    assert exc_info.value.detail["error"]["code"] == "FORBIDDEN"
