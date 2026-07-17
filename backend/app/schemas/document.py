import uuid
from datetime import datetime
from pydantic import BaseModel, ConfigDict

class DocumentBase(BaseModel):
    filename: str
    size_bytes: int
    expiry_at: datetime

class DocumentCreate(DocumentBase):
    r2_key: str

class DocumentUpdate(BaseModel):
    filename: str

class DocumentResponse(DocumentBase):
    id: uuid.UUID
    user_id: uuid.UUID
    status: str = "pending"
    summary: str | None = None
    uploaded_at: datetime

    model_config = ConfigDict(from_attributes=True)

