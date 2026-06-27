import os
from fastapi import HTTPException, status

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
