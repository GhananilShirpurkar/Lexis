import uuid
from datetime import datetime
from pydantic import BaseModel, EmailStr, Field, ConfigDict

class UserBase(BaseModel):
    email: EmailStr

class UserCreate(UserBase):
    password: str = Field(..., min_length=8, max_length=72, description="Password must be between 8 and 72 characters long")

class UserResponse(UserBase):
    id: uuid.UUID
    username: str | None = None
    display_name: str | None = None
    avatar_url: str | None = None
    role: str | None = None
    onboarding_completed: bool = False
    onboarding_skipped_at: datetime | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class OnboardingUpdate(BaseModel):
    username: str | None = None
    display_name: str | None = None
    avatar_url: str | None = None
    role: str | None = None
    skip: bool = False

class OnboardingStatusResponse(BaseModel):
    onboarding_completed: bool
    onboarding_skipped_at: datetime | None = None
    username: str | None = None
    display_name: str | None = None
    avatar_url: str | None = None
    role: str | None = None

class UsernameCheckResponse(BaseModel):
    available: bool
    username: str
    reason: str | None = None

class UserDeleteRequest(BaseModel):
    password: str
    confirm_text: str | None = None

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: str | None = None

