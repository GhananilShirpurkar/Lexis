import uuid
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field

class NotificationBase(BaseModel):
    title: str = Field(..., max_length=150)
    message: str

class NotificationCreate(NotificationBase):
    pass

class NotificationResponse(NotificationBase):
    id: uuid.UUID
    user_id: uuid.UUID
    status: str = "unread"
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class NotificationUpdate(BaseModel):
    status: str = Field(..., pattern="^(read|unread)$")

