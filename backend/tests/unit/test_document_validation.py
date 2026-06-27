import pytest
from fastapi import HTTPException, status
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

