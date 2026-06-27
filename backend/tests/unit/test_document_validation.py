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
