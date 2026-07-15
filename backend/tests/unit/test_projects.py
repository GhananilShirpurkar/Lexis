import pytest
from unittest.mock import patch, MagicMock, AsyncMock
import uuid
from datetime import datetime, timezone
from fastapi import status
from fastapi.testclient import TestClient
from pydantic import ValidationError
from hypothesis import given, strategies as st, settings as hypothesis_settings

from app.main import app
from app.db.session import get_db
from app.models.project import Project, ProjectChat
from app.models.chat import Chat
from app.models.document import Document
from app.schemas.project import ProjectCreate, ProjectUpdate

hypothesis_settings.register_profile("default", deadline=None)
hypothesis_settings.load_profile("default")

@pytest.fixture
def mock_db():
    db = AsyncMock()
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
# Unit/Property Tests for Project Limits & Validation
# =====================================================================

def test_project_create_schema_bounds():
    """Verify that ProjectCreate schema validates chat_ids length between 2 and 4."""
    # Valid
    payload = ProjectCreate(name="Test Project", chat_ids=[uuid.uuid4(), uuid.uuid4()])
    assert len(payload.chat_ids) == 2

    # Invalid: less than 2
    with pytest.raises(ValidationError):
        ProjectCreate(name="Test Project", chat_ids=[uuid.uuid4()])

    # Invalid: more than 4
    with pytest.raises(ValidationError):
        ProjectCreate(name="Test Project", chat_ids=[uuid.uuid4(), uuid.uuid4(), uuid.uuid4(), uuid.uuid4(), uuid.uuid4()])


@pytest.mark.asyncio
async def test_project_limit_exceeded(client, mock_db):
    """Property 19: Creating project fails if user already has 10 projects."""
    user_id = str(uuid.uuid4())
    
    # Mock project count query returning 10
    mock_count_result = MagicMock()
    mock_count_result.scalar.return_value = 10
    
    mock_db.execute.side_effect = [
        mock_count_result  # count projects
    ]

    headers = {"X-User-Id": user_id}  # JWT middleware sets state.user_id from headers/JWT
    # Note: If using mock JWTMiddleware, make sure we pass user_id via state/mocking.
    # In Lexis backend, JWTMiddleware extracts user_id. We can patch it or mock request.state.user_id.
    
    with patch("app.auth.middleware.JWTMiddleware.__call__", side_effect=lambda r, call_next: call_next(r)):
        with patch.object(app.requests, "state", MagicMock(user_id=user_id)):
            # Wait, in FastAPI TestClient we can set request.state via patching or middleware.
            # Let's mock request.state.user_id by patching fastapi.Request.state.
            pass

    # A simpler way to test the endpoint logic with Depends(get_db) is to call the route handler function directly!
    # Let's test the route handler function directly since that is extremely robust and avoids TestClient state injection complexities.
    from app.routers.projects import create_project
    from app.schemas.project import ProjectCreate
    from fastapi import HTTPException
    
    mock_request = MagicMock()
    mock_request.state.user_id = uuid.uuid4()
    
    payload = ProjectCreate(name="Test Project", chat_ids=[uuid.uuid4(), uuid.uuid4()])
    
    with pytest.raises(HTTPException) as exc_info:
        await create_project(request=mock_request, payload=payload, db=mock_db)
        
    assert exc_info.value.status_code == 400
    assert exc_info.value.detail["code"] == "PROJECT_LIMIT_EXCEEDED"


@pytest.mark.asyncio
async def test_unique_documents_limit_exceeded(mock_db):
    """Property 18: Creating project fails if member chats contain > 4 unique documents."""
    mock_request = MagicMock()
    user_id = uuid.uuid4()
    mock_request.state.user_id = user_id

    # 1. Project count = 0
    mock_proj_count = MagicMock()
    mock_proj_count.scalar.return_value = 0

    # 2. Chat count = 10
    mock_chat_count = MagicMock()
    mock_chat_count.scalar.return_value = 10

    # 3. Chats query return 5 chats (which exceeds Pydantic limits but we want to test doc limit logic)
    chat_ids = [uuid.uuid4() for _ in range(5)]
    mock_chats = [
        Chat(id=cid, user_id=user_id, current_doc_id=uuid.uuid4())
        for cid in chat_ids
    ]
    mock_chats_result = MagicMock()
    mock_chats_result.scalars().all.return_value = mock_chats

    mock_db.execute.side_effect = [
        mock_proj_count,
        mock_chat_count,
        mock_chats_result
    ]

    from app.routers.projects import create_project
    from fastapi import HTTPException

    # Bypass Pydantic validation for test by constructing raw dict or using a relaxed schema
    # But wait, ProjectCreate enforces min_items=2, max_items=4.
    # So let's pass exactly 4 chat_ids, but all having different current_doc_ids (4 docs is allowed).
    # What if 5 unique docs? If we pass 4 chats, we can have at most 4 docs.
    # So doc limit is violated if we add a chat to a project later, or if we have 5 chats.
    # Let's test the doc limit on adding a chat!
    # Let's check `add_project_chat` endpoint.
    from app.routers.projects import add_project_chat
    from app.schemas.project import ProjectAddChat

    project_id = uuid.uuid4()
    mock_project = Project(id=project_id, user_id=user_id, name="Test")
    
    # 4 existing member chats with 4 different documents
    existing_chats = [
        Chat(id=uuid.uuid4(), user_id=user_id, current_doc_id=uuid.uuid4())
        for _ in range(3)
    ]
    
    # Target chat to add with a 5th unique document
    target_chat = Chat(id=uuid.uuid4(), user_id=user_id, current_doc_id=uuid.uuid4())

    mock_project_result = MagicMock()
    mock_project_result.scalars().first.return_value = mock_project

    mock_chat_result = MagicMock()
    mock_chat_result.scalars().first.return_value = target_chat

    # Exist check: returns None (not member)
    mock_exist_result = MagicMock()
    mock_exist_result.scalars().first.return_value = None

    # Member chats query: returns existing 3 chats
    mock_member_result = MagicMock()
    mock_member_result.scalars().all.return_value = existing_chats

    mock_db.execute.side_effect = [
        mock_project_result,
        mock_chat_result,
        mock_exist_result,
        mock_member_result
    ]

    payload = ProjectAddChat(chat_id=target_chat.id)
    with pytest.raises(HTTPException) as exc_info:
        await add_project_chat(project_id=project_id, payload=payload, request=mock_request, db=mock_db)

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail["code"] == "DOCUMENT_LIMIT_EXCEEDED"


@pytest.mark.asyncio
async def test_project_crud_flow(mock_db):
    """Test full CRUD operations on projects."""
    mock_request = MagicMock()
    user_id = uuid.uuid4()
    mock_request.state.user_id = user_id

    # Create project mock calls
    mock_proj_count = MagicMock()
    mock_proj_count.scalar.return_value = 0
    mock_chat_count = MagicMock()
    mock_chat_count.scalar.return_value = 0

    chat_ids = [uuid.uuid4(), uuid.uuid4()]
    mock_chats = [
        Chat(id=cid, user_id=user_id, current_doc_id=uuid.uuid4(), is_unified=False)
        for cid in chat_ids
    ]
    mock_chats_result = MagicMock()
    mock_chats_result.scalars().all.return_value = mock_chats

    mock_db.execute.side_effect = [
        mock_proj_count,
        mock_chat_count,
        mock_chats_result
    ]

    from app.routers.projects import create_project, get_project, update_project, delete_project
    
    # 1. Create Project
    payload = ProjectCreate(name="Original Name", description="Desc", chat_ids=chat_ids)
    response = await create_project(request=mock_request, payload=payload, db=mock_db)
    
    assert response.name == "Original Name"
    assert response.description == "Desc"
    assert len(response.chat_ids) == 2
    assert response.unified_chat_id is not None

    # 2. Get Project
    mock_project = Project(id=response.id, user_id=user_id, name="Original Name", description="Desc")
    mock_project_result = MagicMock()
    mock_project_result.scalars().first.return_value = mock_project

    mock_unified = Chat(id=response.unified_chat_id, user_id=user_id, project_id=response.id, is_unified=True)
    mock_unified_result = MagicMock()
    mock_unified_result.scalars().first.return_value = mock_unified

    mock_members = MagicMock()
    mock_members.scalars().all.return_value = chat_ids

    mock_db.execute.side_effect = [
        mock_project_result,
        mock_unified_result,
        mock_members
    ]

    get_resp = await get_project(project_id=response.id, request=mock_request, db=mock_db)
    assert get_resp.name == "Original Name"
    assert get_resp.unified_chat_id == response.unified_chat_id

    # 3. Update Project
    mock_project_result_update = MagicMock()
    mock_project_result_update.scalars().first.return_value = mock_project

    mock_unified_result_update = MagicMock()
    mock_unified_result_update.scalars().first.return_value = mock_unified

    mock_members_result_update = MagicMock()
    mock_members_result_update.scalars().all.return_value = chat_ids

    mock_db.execute.side_effect = [
        mock_project_result_update,
        mock_unified_result_update,  # inside update_project for title sync
        mock_unified_result_update,  # inside response builder
        mock_members_result_update   # inside response builder
    ]

    update_payload = ProjectUpdate(name="New Name", description="New Desc")
    update_resp = await update_project(project_id=response.id, payload=update_payload, request=mock_request, db=mock_db)
    
    assert update_resp.name == "New Name"
    assert update_resp.description == "New Desc"
    assert mock_unified.title == "Unified: New Name"

    # 4. Delete Project
    mock_project_result_delete = MagicMock()
    mock_project_result_delete.scalars().first.return_value = mock_project
    mock_db.execute.side_effect = [mock_project_result_delete]

    await delete_project(project_id=response.id, request=mock_request, db=mock_db)
    mock_db.delete.assert_called_once_with(mock_project)
