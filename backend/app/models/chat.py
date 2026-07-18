import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, func, ForeignKey, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from app.db.base_class import Base

class Chat(Base):
    __tablename__ = "chats"
    
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(60), nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    original_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    last_provider: Mapped[str | None] = mapped_column(String(50), nullable=True)
    current_doc_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("documents.id", ondelete="SET NULL"), nullable=True
    )
    is_unified: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    is_workspace_chat: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=True, index=True
    )
    user_edited_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    generated_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    generated_summary: Mapped[str | None] = mapped_column(String, nullable=True)
    summary_status: Mapped[str] = mapped_column(String(20), default="pending", server_default="pending", nullable=False)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    
    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="chats")
    current_doc: Mapped["Document | None"] = relationship("Document", back_populates="chats")
    messages: Mapped[list["Message"]] = relationship(
        "Message", back_populates="chat", cascade="all, delete-orphan"
    )
    project_chats: Mapped[list["ProjectChat"]] = relationship(
        "ProjectChat", back_populates="chat", cascade="all, delete-orphan"
    )
