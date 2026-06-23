import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, func, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from app.db.base import Base

class Project(Base):
    __tablename__ = "projects"
    
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    
    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="projects")
    project_chats: Mapped[list["ProjectChat"]] = relationship(
        "ProjectChat", back_populates="project", cascade="all, delete-orphan"
    )

class ProjectChat(Base):
    __tablename__ = "project_chats"
    
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    chat_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chats.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    
    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="project_chats")
    chat: Mapped["Chat"] = relationship("Chat", back_populates="project_chats")

    __table_args__ = (
        UniqueConstraint("project_id", "chat_id", name="uq_project_chat"),
    )
