import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import uuid
from fastapi import status
from fastapi.testclient import TestClient

from app.main import app
from app.db.session import get_db
from app.models.user import User

# Setup TestClient and override get_db dependency
@pytest.fixture
def mock_db():
    return AsyncMock()

@pytest.fixture
def client(mock_db):
    async def override_get_db():
        yield mock_db
    
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()

def test_register_success(client, mock_db):
    # Mock database executing check for existing user (returns empty)
    mock_execute_result = MagicMock()
    mock_execute_result.scalars.return_value.first.return_value = None
    mock_db.execute.return_value = mock_execute_result

    # Mock commit and refresh
    mock_db.commit = AsyncMock()
    mock_db.refresh = AsyncMock()

    # Stub new_user refresh to give it an ID
    def mock_refresh_side_effect(user_obj):
        user_obj.id = uuid.uuid4()

    mock_db.refresh.side_effect = mock_refresh_side_effect

    payload = {
        "email": "test@example.com",
        "password": "securepassword123"
    }
    response = client.post("/auth/register", json=payload)

    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert mock_db.add.called
    assert mock_db.commit.called

def test_register_invalid_email(client):
    payload = {
        "email": "not-an-email",
        "password": "securepassword123"
    }
    response = client.post("/auth/register", json=payload)
    # Pydantic EmailStr validation raises HTTP 422 Unprocessable Entity
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

def test_register_password_too_short(client):
    payload = {
        "email": "test@example.com",
        "password": "short"
    }
    response = client.post("/auth/register", json=payload)
    # Pydantic min_length=8 raises HTTP 422 Unprocessable Entity
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

def test_register_password_too_long(client):
    payload = {
        "email": "test@example.com",
        "password": "a" * 73
    }
    response = client.post("/auth/register", json=payload)
    # Pydantic max_length=72 raises HTTP 422 Unprocessable Entity
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

def test_register_duplicate_email(client, mock_db):
    # Mock existing user in database
    existing_user = User(email="duplicate@example.com", hashed_password="some_hash")
    
    mock_execute_result = MagicMock()
    mock_execute_result.scalars.return_value.first.return_value = existing_user
    mock_db.execute.return_value = mock_execute_result

    payload = {
        "email": "duplicate@example.com",
        "password": "securepassword123"
    }
    response = client.post("/auth/register", json=payload)
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    data = response.json()
    assert data["detail"]["error"]["code"] == "EMAIL_DUPLICATE"

def test_login_success(client, mock_db):
    # Hash password mockup
    from app.auth.utils import hash_password
    hashed_pwd = hash_password("mypassword123")
    
    mock_user = User(
        id=uuid.uuid4(),
        email="test@example.com",
        hashed_password=hashed_pwd
    )

    # Mock database user check query
    mock_execute_result = MagicMock()
    mock_execute_result.scalars.return_value.first.return_value = mock_user
    mock_db.execute.return_value = mock_execute_result

    payload = {
        "email": "test@example.com",
        "password": "mypassword123"
    }
    response = client.post("/auth/login", json=payload)
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"

def test_login_invalid_credentials(client, mock_db):
    # Mock no user found
    mock_execute_result = MagicMock()
    mock_execute_result.scalars.return_value.first.return_value = None
    mock_db.execute.return_value = mock_execute_result

    payload = {
        "email": "nonexistent@example.com",
        "password": "mypassword123"
    }
    response = client.post("/auth/login", json=payload)
    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    data = response.json()
    assert data["detail"]["error"]["code"] == "INVALID_CREDENTIALS"

def test_login_rate_limiting(client, mock_db):
    from app.auth.rate_limiter import limiter_storage
    from app.config import settings

    limiter_storage.reset()
    
    # Mock no user found for simple failing logins
    mock_execute_result = MagicMock()
    mock_execute_result.scalars.return_value.first.return_value = None
    mock_db.execute.return_value = mock_execute_result

    # Let's adjust settings for testing rate limits
    original_email_limit = settings.RATE_LIMIT_LOGIN_EMAIL_LIMIT
    settings.RATE_LIMIT_LOGIN_EMAIL_LIMIT = 2

    payload = {
        "email": "ratelimit@example.com",
        "password": "mypassword123"
    }

    try:
        # Attempt 1 -> 401
        response = client.post("/auth/login", json=payload)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

        # Attempt 2 -> 401
        response = client.post("/auth/login", json=payload)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

        # Attempt 3 -> 429 RATE_LIMITED
        response = client.post("/auth/login", json=payload)
        assert response.status_code == status.HTTP_429_TOO_MANY_REQUESTS
        data = response.json()
        assert data["detail"]["error"]["code"] == "RATE_LIMITED"
        assert "Retry-After" in response.headers
    finally:
        # Restore settings
        settings.RATE_LIMIT_LOGIN_EMAIL_LIMIT = original_email_limit

