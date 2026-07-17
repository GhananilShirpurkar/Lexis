import uuid
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


class WorkspaceCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    chat_ids: list[uuid.UUID] = Field(..., min_length=1, max_length=4)


class WorkspaceUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)


class WorkspaceAddChat(BaseModel):
    chat_id: uuid.UUID


class MemberChatResponse(BaseModel):
    id: uuid.UUID
    title: str
    current_doc_id: uuid.UUID | None = None
    doc_filename: str | None = None
    added_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class WorkspaceChatResponse(BaseModel):
    id: uuid.UUID
    title: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class WorkspaceResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    name: str
    created_at: datetime
    updated_at: datetime
    member_count: int = 0

    model_config = ConfigDict(from_attributes=True)


class WorkspaceDetailResponse(WorkspaceResponse):
    member_chats: list[MemberChatResponse] = []
    workspace_chat: WorkspaceChatResponse | None = None
