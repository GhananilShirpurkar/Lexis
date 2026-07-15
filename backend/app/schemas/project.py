import uuid
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field

class ProjectBase(BaseModel):
    name: str = Field(..., max_length=100)
    description: str | None = None

class ProjectCreate(ProjectBase):
    chat_ids: list[uuid.UUID] = Field(..., min_length=2, max_length=4)

class ProjectUpdate(BaseModel):
    name: str | None = Field(None, max_length=100)
    description: str | None = None

class ProjectResponse(ProjectBase):
    id: uuid.UUID
    user_id: uuid.UUID
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class ProjectDetailResponse(ProjectResponse):
    unified_chat_id: uuid.UUID | None = None
    chat_ids: list[uuid.UUID] = []

    model_config = ConfigDict(from_attributes=True)

class ProjectAddChat(BaseModel):
    chat_id: uuid.UUID
