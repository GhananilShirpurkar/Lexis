from typing import Any
from pydantic import BaseModel, Field

class ErrorDetail(BaseModel):
    code: str = Field(
        ..., 
        description="Machine-readable error code, e.g., RATE_LIMITED, UNAUTHORIZED, NOT_FOUND"
    )
    message: str = Field(
        ..., 
        description="A clear, human-readable message describing the error."
    )
    detail: Any | None = Field(
        None, 
        description="Additional debug metadata or validation error details."
    )

class ErrorResponse(BaseModel):
    """
    Standardized top-level API error envelope.
    """
    error: ErrorDetail
