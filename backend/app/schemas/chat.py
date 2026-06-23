import uuid
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field

# --- Citation Schemas ---
class CitationBase(BaseModel):
    excerpt: str = Field(..., max_length=200)
    page_number: int | None = None

class CitationCreate(CitationBase):
    document_id: uuid.UUID

class CitationResponse(CitationBase):
    id: uuid.UUID
    message_id: uuid.UUID
    document_id: uuid.UUID
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

# --- Message Schemas ---
class MessageBase(BaseModel):
    role: str = Field(..., description="Role must be system, user, or assistant")
    content: str

class MessageCreate(MessageBase):
    pass

class MessageResponse(MessageBase):
    id: uuid.UUID
    chat_id: uuid.UUID
    created_at: datetime
    citations: list[CitationResponse] = []

    model_config = ConfigDict(from_attributes=True)

# --- Chat Schemas ---
class ChatBase(BaseModel):
    title: str = Field(..., max_length=60)
    current_doc_id: uuid.UUID | None = None

class ChatCreate(BaseModel):
    title: str | None = Field(None, max_length=60, description="Auto-generated if not provided")
    current_doc_id: uuid.UUID | None = None

class ChatUpdate(BaseModel):
    title: str | None = Field(None, max_length=60)
    current_doc_id: uuid.UUID | None = None
    last_provider: str | None = Field(None, max_length=50)

class ChatResponse(ChatBase):
    id: uuid.UUID
    user_id: uuid.UUID
    last_provider: str | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class ChatDetailResponse(ChatResponse):
    messages: list[MessageResponse] = []
