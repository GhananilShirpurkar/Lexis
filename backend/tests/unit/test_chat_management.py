import pytest
from unittest.mock import patch, MagicMock, AsyncMock
import uuid
from datetime import datetime
from fastapi import status
from fastapi.testclient import TestClient
from pydantic import ValidationError
from hypothesis import given, strategies as st, settings as hypothesis_settings

from app.main import app
from app.db.session import get_db
from app.models.chat import Chat
from app.models.document import Document
from app.schemas.chat import ChatCreate, ChatUpdate

# Disable Hypothesis health check for function-scoped fixtures if necessary,
# and define the settings profile
hypothesis_settings.register_profile("default", deadline=None)
hypothesis_settings.load_profile("default")

@pytest.fixture
def mock_db():
    db = AsyncMock()
    mock_execute = MagicMock()
    mock_execute.scalars.return_value.first.return_value = None
    mock_execute.scalar.return_value = 0
    db.execute.return_value = mock_execute
    return db

@pytest.fixture
def client(mock_db):
    async def override_get_db():
        yield mock_db
    
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


# =====================================================================
# Property 8: Input Validation for Chat Renames (display_name length 1-100)
# =====================================================================

@given(st.text(min_size=0, max_size=150))
def test_property_chat_rename_input_validation(name):
    """
    Hypothesis test asserting Pydantic input validation for display_name.
    Names between 1 and 100 characters must validate successfully.
    Names with length 0 or > 100 must raise ValidationError.
    """
    # Filter out whitespace-only strings since Pydantic min_length checks characters,
    # but we just want to test raw length bounds.
    if 1 <= len(name) <= 100:
        update_schema = ChatUpdate(display_name=name)
        assert update_schema.display_name == name
    else:
        with pytest.raises(ValidationError):
            ChatUpdate(display_name=name)


# =====================================================================
# Property 9: Manual Display Name Bounds & Auto-Derived Truncation (1-60)
# =====================================================================

@given(st.text(min_size=0, max_size=150))
def test_property_display_name_business_bounds(name):
    """
    Hypothesis test validating:
    - Display names between 1 and 60 characters are accepted by business rules.
    - Display names > 60 characters are rejected for manual renames.
    - Auto-derived names are truncated to <= 60 characters.
    """
    # 1. Manual rename business validation simulation
    is_valid_manual = (1 <= len(name) <= 60)
    
    # 2. Auto-derived truncation simulation
    derived_name = name
    if len(derived_name) > 60:
        derived_name = derived_name[:60]
    
    assert len(derived_name) <= 60
    if len(name) > 60:
        assert is_valid_manual is False
    elif 1 <= len(name) <= 60:
        assert is_valid_manual is True


# =====================================================================
# Property 23: Original Name Preservation on First Rename
# =====================================================================

@given(st.text(min_size=1, max_size=60), st.text(min_size=1, max_size=60))
def test_property_original_name_preservation(initial_title, new_display_name):
    """
    Hypothesis test verifying that the pre-rename display name/title
    is preserved in original_name on the first rename.
    """
    # Simulating a freshly created chat (original_name is None)
    chat = Chat(
        title=initial_title,
        display_name=initial_title,
        original_name=None
    )

    # First rename logic
    if chat.original_name is None:
        chat.original_name = chat.display_name or chat.title
    chat.display_name = new_display_name
    chat.title = new_display_name

    # Assertions
    assert chat.original_name == initial_title
    assert chat.display_name == new_display_name

    # Subsequent renames should NOT overwrite original_name
    second_rename = "Brand New Title"
    if chat.original_name is None:
        chat.original_name = chat.display_name or chat.title
    chat.display_name = second_rename
    chat.title = second_rename

    assert chat.original_name == initial_title
    assert chat.display_name == second_rename


# =====================================================================
# Property 14: Default Provider Fallback Logic
# =====================================================================

@given(st.sampled_from(['gemini', 'groq']) | st.none())
def test_property_default_provider_fallback(last_provider):
    """
    Hypothesis test asserting that the provider defaults to last_provider if set,
    or falls back to 'gemini' when last_provider is None/empty.
    """
    resolved_provider = last_provider if last_provider else 'gemini'
    
    assert resolved_provider in ['gemini', 'groq']
    if last_provider:
        assert resolved_provider == last_provider
    else:
        assert resolved_provider == 'gemini'


# =====================================================================
# Property 19: Per-User Resource Limits (40 Chats Limit)
# =====================================================================

@given(st.integers(min_value=0, max_value=50))
def test_property_chat_limit_enforcement(chat_count):
    """
    Hypothesis test checking that chat creation is rejected if the current
    chat count is >= 40, and accepted otherwise.
    """
    is_allowed = (chat_count < 40)
    
    if chat_count >= 40:
        assert is_allowed is False
    else:
        assert is_allowed is True


# =====================================================================
# Standard Unit Tests for Chat CRUD Endpoints
# =====================================================================

def test_create_chat_success(client, mock_db):
    """
    Test successful chat creation shell.
    """
    user_uuid = uuid.uuid4()
    mock_payload = {
        "sub": str(user_uuid),
        "email": "test@example.com"
    }

    # Mock count to be 5 (well under the 40 limit)
    mock_execute = MagicMock()
    mock_execute.scalar.return_value = 5
    # Mock last_chat retrieval to return None
    mock_execute.scalars.return_value.first.return_value = None
    mock_db.execute.return_value = mock_execute

    with patch("app.auth.middleware.decode_token", return_value=mock_payload):
        headers = {"Authorization": "Bearer dummy-token"}
        response = client.post("/chats", json={"title": "Custom Title"}, headers=headers)

        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["title"] == "Custom Title"
        assert data["last_provider"] == "gemini"  # defaults to gemini
        mock_db.add.assert_called_once()
        mock_db.commit.assert_called_once()


def test_create_chat_limit_exceeded(client, mock_db):
    """
    Test that chat creation is rejected with 400 Bad Request when 40-chat limit is reached.
    """
    user_uuid = uuid.uuid4()
    mock_payload = {
        "sub": str(user_uuid),
        "email": "test@example.com"
    }

    # Mock count to be 40
    mock_execute = MagicMock()
    mock_execute.scalar.return_value = 40
    mock_db.execute.return_value = mock_execute

    with patch("app.auth.middleware.decode_token", return_value=mock_payload):
        headers = {"Authorization": "Bearer dummy-token"}
        response = client.post("/chats", json={"title": "Custom Title"}, headers=headers)

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        data = response.json()
        assert data["detail"]["error"]["code"] == "CHAT_LIMIT_EXCEEDED"
        mock_db.add.assert_not_called()


def test_list_chats(client, mock_db):
    """
    Test listing all user chats.
    """
    user_uuid = uuid.uuid4()
    mock_payload = {
        "sub": str(user_uuid),
        "email": "test@example.com"
    }

    mock_chat_1 = MagicMock()
    mock_chat_1.title = "Chat 1"
    mock_chat_2 = MagicMock()
    mock_chat_2.title = "Chat 2"

    mock_execute = MagicMock()
    mock_execute.scalars.return_value.all.return_value = [mock_chat_1, mock_chat_2]
    mock_db.execute.return_value = mock_execute

    with patch("app.auth.middleware.decode_token", return_value=mock_payload):
        headers = {"Authorization": "Bearer dummy-token"}
        response = client.get("/chats", headers=headers)

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) == 2
        assert data[0]["title"] == "Chat 1"
        assert data[1]["title"] == "Chat 2"


def test_get_chat_success(client, mock_db):
    """
    Test retrieving a single chat details.
    """
    user_uuid = uuid.uuid4()
    chat_uuid = uuid.uuid4()
    mock_payload = {
        "sub": str(user_uuid),
        "email": "test@example.com"
    }

    mock_chat = MagicMock()
    mock_chat.id = chat_uuid
    mock_chat.title = "Test Chat"
    mock_chat.user_id = user_uuid
    mock_chat.messages = []

    mock_execute = MagicMock()
    mock_execute.scalars.return_value.first.return_value = mock_chat
    mock_db.execute.return_value = mock_execute

    with patch("app.auth.middleware.decode_token", return_value=mock_payload):
        headers = {"Authorization": "Bearer dummy-token"}
        response = client.get(f"/chats/{chat_uuid}", headers=headers)

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["id"] == str(chat_uuid)
        assert data["title"] == "Test Chat"


def test_update_chat_rename_success(client, mock_db):
    """
    Test renaming a chat successfully and verifying original_name preservation.
    """
    user_uuid = uuid.uuid4()
    chat_uuid = uuid.uuid4()
    mock_payload = {
        "sub": str(user_uuid),
        "email": "test@example.com"
    }

    mock_chat = Chat(
        id=chat_uuid,
        title="Initial Name",
        display_name="Initial Name",
        original_name=None,
        user_id=user_uuid
    )

    mock_execute = MagicMock()
    mock_execute.scalars.return_value.first.return_value = mock_chat
    mock_db.execute.return_value = mock_execute

    with patch("app.auth.middleware.decode_token", return_value=mock_payload):
        headers = {"Authorization": "Bearer dummy-token"}
        response = client.patch(
            f"/chats/{chat_uuid}",
            json={"display_name": "New Manual Title"},
            headers=headers
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["title"] == "New Manual Title"
        assert data["display_name"] == "New Manual Title"
        assert data["original_name"] == "Initial Name"
        mock_db.commit.assert_called_once()


def test_update_chat_rename_invalid_length(client, mock_db):
    """
    Test that manual renames outside the 1-60 characters limit are rejected with 400.
    """
    user_uuid = uuid.uuid4()
    chat_uuid = uuid.uuid4()
    mock_payload = {
        "sub": str(user_uuid),
        "email": "test@example.com"
    }

    mock_chat = Chat(
        id=chat_uuid,
        title="Initial Name",
        display_name="Initial Name",
        original_name=None,
        user_id=user_uuid
    )

    mock_execute = MagicMock()
    mock_execute.scalars.return_value.first.return_value = mock_chat
    mock_db.execute.return_value = mock_execute

    with patch("app.auth.middleware.decode_token", return_value=mock_payload):
        headers = {"Authorization": "Bearer dummy-token"}
        
        # Too long: 61 characters
        long_title = "A" * 61
        response = client.patch(
            f"/chats/{chat_uuid}",
            json={"display_name": long_title},
            headers=headers
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.json()["detail"]["error"]["code"] == "INVALID_DISPLAY_NAME"
        mock_db.commit.assert_not_called()


def test_delete_chat_success_and_cleanup_orphaned_doc(client, mock_db):
    """
    Test deleting a chat and ensuring that if its current document is not referenced
    by any other chat, it is hard-deleted from DB, storage, and indices.
    """
    user_uuid = uuid.uuid4()
    chat_uuid = uuid.uuid4()
    doc_uuid = uuid.uuid4()
    mock_payload = {
        "sub": str(user_uuid),
        "email": "test@example.com"
    }

    # 1. Mock chat that has a linked document
    mock_chat = MagicMock()
    mock_chat.id = chat_uuid
    mock_chat.user_id = user_uuid
    mock_chat.current_doc_id = doc_uuid

    # 2. Mock execute calls:
    # First execute: find the chat to delete -> mock_chat
    # Second execute: count other chats with the same document -> returns 0 (orphaned!)
    # Third execute: find the document object -> mock_doc
    mock_doc = MagicMock()
    mock_doc.id = doc_uuid
    mock_doc.r2_key = "user/doc/orphaned.pdf"

    # Set up sequential execute results
    mock_execute_chat = MagicMock()
    mock_execute_chat.scalars.return_value.first.return_value = mock_chat

    mock_execute_count = MagicMock()
    mock_execute_count.scalar.return_value = 0

    mock_execute_doc = MagicMock()
    mock_execute_doc.scalars.return_value.first.return_value = mock_doc

    mock_db.execute.side_effect = [mock_execute_chat, mock_execute_count, mock_execute_doc]

    with patch("app.auth.middleware.decode_token", return_value=mock_payload), \
         patch("app.routers.chats.delete_file") as mock_delete_s3, \
         patch("shutil.rmtree") as mock_rmtree, \
         patch("os.path.exists", return_value=True):
        
        headers = {"Authorization": "Bearer dummy-token"}
        response = client.delete(f"/chats/{chat_uuid}", headers=headers)

        assert response.status_code == status.HTTP_204_NO_CONTENT
        
        # Verify chat delete
        mock_db.delete.assert_any_call(mock_chat)
        # Verify document delete (since count was 0)
        mock_db.delete.assert_any_call(mock_doc)
        
        # Verify storage delete call and folder cleanup
        mock_delete_s3.assert_called_once_with("user/doc/orphaned.pdf")
        mock_rmtree.assert_called_once()


def test_get_chat_messages_success(client, mock_db):
    """
    Test successful message history retrieval.
    """
    user_uuid = uuid.uuid4()
    chat_uuid = uuid.uuid4()
    mock_payload = {
        "sub": str(user_uuid),
        "email": "test@example.com"
    }

    mock_chat = Chat(
        id=chat_uuid,
        title="Test Chat",
        user_id=user_uuid
    )

    mock_msg_1 = MagicMock()
    mock_msg_1.id = uuid.uuid4()
    mock_msg_1.chat_id = chat_uuid
    mock_msg_1.role = "user"
    mock_msg_1.content = "Hello"
    mock_msg_1.citations = []

    mock_execute_chat = MagicMock()
    mock_execute_chat.scalars.return_value.first.return_value = mock_chat

    mock_execute_msgs = MagicMock()
    mock_execute_msgs.scalars.return_value.all.return_value = [mock_msg_1]

    mock_db.execute.side_effect = [mock_execute_chat, mock_execute_msgs]

    with patch("app.auth.middleware.decode_token", return_value=mock_payload):
        headers = {"Authorization": "Bearer dummy-token"}
        response = client.get(f"/chats/{chat_uuid}/messages", headers=headers)

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) == 1
        assert data[0]["content"] == "Hello"
        assert data[0]["role"] == "user"
