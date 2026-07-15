import pytest
from fastapi import HTTPException, status, UploadFile
from hypothesis import given, strategies as st
from app.documents.validation import validate_file

def test_validate_file_success():
    # Test valid combinations of extensions and MIME types
    valid_cases = [
        ("report.pdf", "application/pdf"),
        ("notes.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
        ("data.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
        ("slide.pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"),
        ("readme.md", "text/markdown"),
        ("index.html", "text/html"),
        ("log.txt", "text/plain"),
    ]
    for filename, mime in valid_cases:
        # Should not raise any exception
        validate_file(filename, mime)

def test_validate_file_invalid_media():
    # Test media files that are explicitly out of scope
    invalid_cases = [
        ("photo.jpg", "image/jpeg"),
        ("icon.png", "image/png"),
        ("audio.mp3", "audio/mpeg"),
        ("podcast.wav", "audio/wav"),
        ("movie.mp4", "video/mp4"),
        ("clip.avi", "video/x-msvideo"),
    ]
    for filename, mime in invalid_cases:
        with pytest.raises(HTTPException) as exc_info:
            validate_file(filename, mime)
        assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
        assert exc_info.value.detail["error"]["code"] == "INVALID_FILE_TYPE"

def test_validate_file_unsupported_types():
    # Test other formats not in the whitelist
    unsupported_cases = [
        ("payload.exe", "application/octet-stream"),
        ("archive.zip", "application/zip"),
        ("db.sqlite", "application/x-sqlite3"),
        ("script.sh", "application/x-sh"),
    ]
    for filename, mime in unsupported_cases:
        with pytest.raises(HTTPException) as exc_info:
            validate_file(filename, mime)
        assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
        assert exc_info.value.detail["error"]["code"] == "INVALID_FILE_TYPE"

@pytest.mark.asyncio
async def test_validate_file_size_success():
    from app.documents.validation import validate_file_size
    from unittest.mock import MagicMock
    
    mock_file = MagicMock(spec=UploadFile)
    mock_file.size = 10 * 1024 * 1024  # 10 MB
    
    # Should run without raising exceptions
    await validate_file_size(mock_file, 10 * 1024 * 1024)

@pytest.mark.asyncio
async def test_validate_file_size_too_large_header():
    from app.documents.validation import validate_file_size
    from unittest.mock import MagicMock
    
    mock_file = MagicMock(spec=UploadFile)
    
    with pytest.raises(HTTPException) as exc_info:
        await validate_file_size(mock_file, 51 * 1024 * 1024)
    assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
    assert exc_info.value.detail["error"]["code"] == "FILE_TOO_LARGE"

@pytest.mark.asyncio
async def test_validate_file_size_too_large_file():
    from app.documents.validation import validate_file_size
    from unittest.mock import MagicMock
    
    mock_file = MagicMock(spec=UploadFile)
    mock_file.size = 51 * 1024 * 1024
    
    with pytest.raises(HTTPException) as exc_info:
        await validate_file_size(mock_file, None)
    assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
    assert exc_info.value.detail["error"]["code"] == "FILE_TOO_LARGE"

@pytest.mark.asyncio
async def test_validate_file_size_empty_header():
    from app.documents.validation import validate_file_size
    from unittest.mock import MagicMock
    
    mock_file = MagicMock(spec=UploadFile)
    
    with pytest.raises(HTTPException) as exc_info:
        await validate_file_size(mock_file, 0)
    assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
    assert exc_info.value.detail["error"]["code"] == "EMPTY_FILE"

@pytest.mark.asyncio
async def test_validate_file_size_empty_file():
    from app.documents.validation import validate_file_size
    from unittest.mock import MagicMock
    
    mock_file = MagicMock(spec=UploadFile)
    mock_file.size = 0
    
    with pytest.raises(HTTPException) as exc_info:
        await validate_file_size(mock_file, None)
    assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
    assert exc_info.value.detail["error"]["code"] == "EMPTY_FILE"

@pytest.mark.asyncio
async def test_validate_file_size_fallback_seek():
    from app.documents.validation import validate_file_size
    from unittest.mock import AsyncMock
    
    # Mock size=None to trigger fallback
    mock_file = AsyncMock(spec=UploadFile)
    mock_file.size = None
    mock_file.seek = AsyncMock()
    mock_file.tell = AsyncMock(return_value=128)  # 128 bytes
    
    await validate_file_size(mock_file, None)
    assert mock_file.seek.called
    assert mock_file.tell.called


# ==========================================
# Task 3.2.1: Property 7 - File validation & size boundary tests (Hypothesis)
# ==========================================

from app.documents.validation import ALLOWED_EXTENSIONS, ALLOWED_MIME_TYPES

@given(filename=st.text(min_size=1, max_size=50).map(lambda s: s.replace(".", "_")),
       ext=st.sampled_from(list(ALLOWED_EXTENSIONS)),
       mime=st.sampled_from(list(ALLOWED_MIME_TYPES)))
def test_property_validate_file_valid_combinations(filename, ext, mime):
    """
    Hypothesis test asserting that any whitelisted file extension combined with
    any whitelisted MIME type is accepted by validate_file.
    """
    full_filename = f"{filename}{ext}"
    validate_file(full_filename, mime)

@given(filename=st.text(min_size=1, max_size=50),
       media_mime=st.sampled_from([
           "image/png", "image/jpeg", "image/gif", "image/webp",
           "audio/mpeg", "audio/ogg", "audio/wav",
           "video/mp4", "video/webm", "video/ogg"
       ]))
def test_property_validate_file_invalid_media_types(filename, media_mime):
    """
    Hypothesis test asserting that any image, audio, or video MIME types are rejected.
    """
    with pytest.raises(HTTPException) as exc_info:
        validate_file(filename, media_mime)
    assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
    assert exc_info.value.detail["error"]["code"] == "INVALID_FILE_TYPE"

@given(ext=st.sampled_from([".exe", ".zip", ".tar.gz", ".json", ".sqlite"]),
       mime=st.sampled_from(["application/octet-stream", "application/zip", "application/json"]))
def test_property_validate_file_unsupported_types(ext, mime):
    """
    Hypothesis test asserting that unsupported file formats/MIME types are rejected.
    """
    filename = f"document{ext}"
    with pytest.raises(HTTPException) as exc_info:
        validate_file(filename, mime)
    assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
    assert exc_info.value.detail["error"]["code"] == "INVALID_FILE_TYPE"

@pytest.mark.asyncio
@given(content_length=st.integers(min_value=1, max_value=50 * 1024 * 1024))
async def test_property_validate_file_size_valid_header(content_length):
    """
    Hypothesis test asserting that files between 1B and 50MB with valid Content-Length are accepted.
    """
    from app.documents.validation import validate_file_size
    from unittest.mock import MagicMock
    mock_file = MagicMock(spec=UploadFile)
    mock_file.size = content_length
    await validate_file_size(mock_file, content_length)

@pytest.mark.asyncio
@given(content_length=st.integers(min_value=50 * 1024 * 1024 + 1, max_value=100 * 1024 * 1024))
async def test_property_validate_file_size_too_large_header(content_length):
    """
    Hypothesis test asserting that files > 50MB based on Content-Length are rejected.
    """
    from app.documents.validation import validate_file_size
    from unittest.mock import MagicMock
    mock_file = MagicMock(spec=UploadFile)
    mock_file.size = content_length
    with pytest.raises(HTTPException) as exc_info:
        await validate_file_size(mock_file, content_length)
    assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
    assert exc_info.value.detail["error"]["code"] == "FILE_TOO_LARGE"

@pytest.mark.asyncio
@given(content_length=st.integers(max_value=0))
async def test_property_validate_file_size_empty_header(content_length):
    """
    Hypothesis test asserting that files <= 0B based on Content-Length are rejected.
    """
    from app.documents.validation import validate_file_size
    from unittest.mock import MagicMock
    mock_file = MagicMock(spec=UploadFile)
    mock_file.size = content_length
    with pytest.raises(HTTPException) as exc_info:
        await validate_file_size(mock_file, content_length)
    assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
    assert exc_info.value.detail["error"]["code"] == "EMPTY_FILE"

@pytest.mark.asyncio
@given(actual_size=st.integers(min_value=1, max_value=50 * 1024 * 1024))
async def test_property_validate_file_size_valid_actual(actual_size):
    """
    Hypothesis test asserting that files between 1B and 50MB with valid actual size are accepted.
    """
    from app.documents.validation import validate_file_size
    from unittest.mock import MagicMock
    mock_file = MagicMock(spec=UploadFile)
    mock_file.size = actual_size
    await validate_file_size(mock_file, None)

@pytest.mark.asyncio
@given(actual_size=st.integers(min_value=50 * 1024 * 1024 + 1, max_value=100 * 1024 * 1024))
async def test_property_validate_file_size_too_large_actual(actual_size):
    """
    Hypothesis test asserting that files > 50MB based on actual size are rejected.
    """
    from app.documents.validation import validate_file_size
    from unittest.mock import MagicMock
    mock_file = MagicMock(spec=UploadFile)
    mock_file.size = actual_size
    with pytest.raises(HTTPException) as exc_info:
        await validate_file_size(mock_file, None)
    assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
    assert exc_info.value.detail["error"]["code"] == "FILE_TOO_LARGE"

@pytest.mark.asyncio
@given(actual_size=st.integers(max_value=0))
async def test_property_validate_file_size_empty_actual(actual_size):
    """
    Hypothesis test asserting that files <= 0B based on actual size are rejected.
    """
    from app.documents.validation import validate_file_size
    from unittest.mock import MagicMock
    mock_file = MagicMock(spec=UploadFile)
    mock_file.size = actual_size
    with pytest.raises(HTTPException) as exc_info:
        await validate_file_size(mock_file, None)
    assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
    assert exc_info.value.detail["error"]["code"] == "EMPTY_FILE"


from datetime import datetime, timedelta, timezone
from app.documents.validation import calculate_expiry

@given(uploaded_at=st.datetimes(timezones=st.just(timezone.utc) | st.none()))
def test_property_calculate_expiry_is_seven_days_later(uploaded_at):
    """
    Hypothesis test asserting that the calculated expiry timestamp is exactly 7 days
    after the uploaded_at timestamp.
    """
    expiry_at = calculate_expiry(uploaded_at)
    assert expiry_at - uploaded_at == timedelta(days=7)



