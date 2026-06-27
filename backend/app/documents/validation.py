import os
from fastapi import HTTPException, status, UploadFile

ALLOWED_EXTENSIONS = {
    ".pdf", 
    ".docx", 
    ".doc", 
    ".xlsx", 
    ".xls", 
    ".pptx", 
    ".ppt", 
    ".md", 
    ".html", 
    ".htm", 
    ".txt"
}

ALLOWED_MIME_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.ms-powerpoint",
    "text/markdown",
    "text/plain",
    "text/html",
}

def validate_file(filename: str, content_type: str) -> None:
    """Validate that the file extension and MIME type belong to the whitelist.
    Explicitly rejects image, audio, and video types.
    """
    _, ext = os.path.splitext(filename.lower())
    
    # 1. Explicit reject of media formats
    if content_type.startswith(("image/", "audio/", "video/")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": {
                    "code": "INVALID_FILE_TYPE",
                    "message": "Media files (images, audio, video) are not supported."
                }
            }
        )

    # 2. Whitelist check
    if ext not in ALLOWED_EXTENSIONS or content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": {
                    "code": "INVALID_FILE_TYPE",
                    "message": f"File format '{ext}' with MIME type '{content_type}' is not supported."
                }
            }
        )

async def validate_file_size(file: UploadFile, content_length: int | None = None) -> None:
    """Validate that the uploaded file size is between 1 byte and 50 MB.
    Checks the Content-Length header first (fail-fast), then verifies actual read bytes (failsafe).
    """
    MAX_SIZE = 50 * 1024 * 1024  # 50 MB
    
    # 1. Fail-fast using Content-Length header if provided
    if content_length is not None:
        if content_length <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "error": {
                        "code": "EMPTY_FILE",
                        "message": "File is empty."
                    }
                }
            )
        if content_length > MAX_SIZE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "error": {
                        "code": "FILE_TOO_LARGE",
                        "message": "File size exceeds the 50 MB maximum limit."
                    }
                }
            )
            
    # 2. Failsafe: check actual file size on the UploadFile object
    actual_size = file.size
    if actual_size is None:
        # Fallback if size attribute is not populated
        await file.seek(0, os.SEEK_END)
        actual_size = await file.tell()
        await file.seek(0)
        
    if actual_size <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": {
                    "code": "EMPTY_FILE",
                    "message": "File is empty."
                }
            }
        )
        
    if actual_size > MAX_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": {
                    "code": "FILE_TOO_LARGE",
                    "message": "File size exceeds the 50 MB maximum limit."
                }
            }
        )

