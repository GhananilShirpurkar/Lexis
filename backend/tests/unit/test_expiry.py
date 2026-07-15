import os
import uuid
import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, patch, MagicMock
from hypothesis import given, strategies as st, settings as h_settings

from app.models.document import Document
from app.models.notification import Notification
from app.expiry.service import check_document_expirations, check_expiry_warnings


# =====================================================================
# Property 20 & 24: Document Expiry and Warning Notification Tests
# =====================================================================

@pytest.mark.asyncio
async def test_check_document_expirations_past():
    """
    Verify that check_document_expirations updates the document status to 'expired',
    deletes S3 file, and cleans up the local index.
    """
    db_mock = AsyncMock()
    doc_id = uuid.uuid4()
    user_id = uuid.uuid4()
    
    mock_doc = Document(
        id=doc_id,
        user_id=user_id,
        filename="expiring_doc.pdf",
        r2_key=f"{user_id}/{doc_id}/expiring_doc.pdf",
        status="completed",
        size_bytes=1024,
        expiry_at=datetime.now(timezone.utc) - timedelta(seconds=1)  # already expired
    )
    
    execute_result = MagicMock()
    execute_result.scalars().all.return_value = [mock_doc]
    db_mock.execute.return_value = execute_result
    
    with patch("app.expiry.service.delete_file") as delete_file_mock, \
         patch("os.path.exists", return_value=True), \
         patch("shutil.rmtree") as rmtree_mock:
         
        await check_document_expirations(db_mock)
        
        # Check S3 deletion
        delete_file_mock.assert_called_once_with(mock_doc.r2_key)
        
        # Check local index deletion
        rmtree_mock.assert_called_once()
        
        # Check DB update
        assert mock_doc.status == "expired"
        db_mock.add.assert_called_once_with(mock_doc)
        db_mock.commit.assert_called_once()


@pytest.mark.asyncio
async def test_check_document_expirations_future():
    """Verify that future documents are not expired."""
    db_mock = AsyncMock()
    
    execute_result = MagicMock()
    execute_result.scalars().all.return_value = []
    db_mock.execute.return_value = execute_result
    
    with patch("app.expiry.service.delete_file") as delete_file_mock:
        await check_document_expirations(db_mock)
        delete_file_mock.assert_not_called()
        db_mock.commit.assert_not_called()


@given(
    hours_left=st.floats(min_value=0.1, max_value=47.9)
)
@pytest.mark.asyncio
@h_settings(max_examples=20, deadline=None)
async def test_property_warning_notice_under_48h(hours_left):
    """
    Property 20: Documents expiring in under 48 hours generate a warning notification.
    """
    db_mock = AsyncMock()
    doc_id = uuid.uuid4()
    user_id = uuid.uuid4()
    
    mock_doc = Document(
        id=doc_id,
        user_id=user_id,
        filename="warning_doc.pdf",
        r2_key=f"{user_id}/{doc_id}/warning_doc.pdf",
        status="completed",
        size_bytes=1024,
        uploaded_at=datetime.now(timezone.utc) - timedelta(days=5),
        expiry_at=datetime.now(timezone.utc) + timedelta(hours=hours_left)
    )
    
    # Execution 1: Query expiring documents
    # Execution 2: Check for existing notifications (returns None)
    exec_result_docs = MagicMock()
    exec_result_docs.scalars().all.return_value = [mock_doc]
    
    exec_result_notifs = MagicMock()
    exec_result_notifs.scalars().first.return_value = None
    
    db_mock.execute.side_effect = [exec_result_docs, exec_result_notifs]
    
    await check_expiry_warnings(db_mock)
    
    # Assert notification added
    db_mock.add.assert_called_once()
    added_notification = db_mock.add.call_args[0][0]
    assert isinstance(added_notification, Notification)
    assert added_notification.user_id == user_id
    assert f"warning_doc.pdf" in added_notification.title
    assert str(doc_id) in added_notification.message
    db_mock.commit.assert_called_once()


@pytest.mark.asyncio
async def test_warning_notice_no_duplicates():
    """Verify duplicate warning notifications are not created."""
    db_mock = AsyncMock()
    doc_id = uuid.uuid4()
    user_id = uuid.uuid4()
    uploaded_time = datetime.now(timezone.utc) - timedelta(days=5)
    
    mock_doc = Document(
        id=doc_id,
        user_id=user_id,
        filename="warning_doc.pdf",
        r2_key=f"{user_id}/{doc_id}/warning_doc.pdf",
        status="completed",
        size_bytes=1024,
        uploaded_at=uploaded_time,
        expiry_at=datetime.now(timezone.utc) + timedelta(hours=24)
    )
    
    mock_notification = Notification(
        user_id=user_id,
        title="Document Expiring Soon: warning_doc.pdf",
        message=f"warning_doc.pdf (ID: {doc_id}) is expiring soon",
        created_at=uploaded_time + timedelta(days=4)  # created after upload time
    )
    
    exec_result_docs = MagicMock()
    exec_result_docs.scalars().all.return_value = [mock_doc]
    
    exec_result_notifs = MagicMock()
    exec_result_notifs.scalars().first.return_value = mock_notification
    
    db_mock.execute.side_effect = [exec_result_docs, exec_result_notifs]
    
    await check_expiry_warnings(db_mock)
    
    # No new notification should be added
    db_mock.add.assert_not_called()
    db_mock.commit.assert_not_called()


@pytest.mark.asyncio
async def test_warning_notice_after_reupload_reset():
    """
    Property 24: Re-upload resets the warning logic. A new warning is triggered
    if the document expires again, since any existing notification predates the new upload.
    """
    db_mock = AsyncMock()
    doc_id = uuid.uuid4()
    user_id = uuid.uuid4()
    
    # 1. First warning created at past upload time
    first_upload = datetime.now(timezone.utc) - timedelta(days=8)
    first_warning = Notification(
        user_id=user_id,
        title="Document Expiring Soon: warning_doc.pdf",
        message=f"warning_doc.pdf (ID: {doc_id}) is expiring soon",
        created_at=first_upload + timedelta(days=6)
    )
    
    # 2. Document gets re-uploaded, resetting uploaded_at and expiry_at
    second_upload = datetime.now(timezone.utc) - timedelta(days=6) # 6 days ago
    
    # 3. Document is now expiring again (24 hours left)
    mock_doc = Document(
        id=doc_id,
        user_id=user_id,
        filename="warning_doc.pdf",
        r2_key=f"{user_id}/{doc_id}/warning_doc.pdf",
        status="completed",
        size_bytes=1024,
        uploaded_at=second_upload,
        expiry_at=datetime.now(timezone.utc) + timedelta(hours=24)
    )
    
    exec_result_docs = MagicMock()
    exec_result_docs.scalars().all.return_value = [mock_doc]
    
    # The existing notification was created *before* the second_upload time (8 days ago + 6 = 2 days ago, which is before second_upload 6 days ago).
    # Wait, 8 - 6 = 2 days ago. second_upload is 6 days ago. So the notification is indeed before the second_upload.
    # Therefore, the query for notifications created >= second_upload will return None!
    exec_result_notifs = MagicMock()
    exec_result_notifs.scalars().first.return_value = None
    
    db_mock.execute.side_effect = [exec_result_docs, exec_result_notifs]
    
    await check_expiry_warnings(db_mock)
    
    # A new notification should be created since the previous one predates the re-upload
    db_mock.add.assert_called_once()
    added_notification = db_mock.add.call_args[0][0]
    assert isinstance(added_notification, Notification)
    assert added_notification.user_id == user_id
    db_mock.commit.assert_called_once()
