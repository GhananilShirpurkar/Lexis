import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, func, ForeignKey, BigInteger, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from app.db.base import Base

class Document(Base):
    __tablename__ = "documents"
    
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    r2_key: Mapped[str] = mapped_column(String(1024), unique=True, nullable=False)
    status: Mapped[str] = mapped_column(String(50), server_default="pending", nullable=False)
    summary: Mapped[str | None] = mapped_column(String, nullable=True)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    expiry_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    
    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="documents")
    chats: Mapped[list["Chat"]] = relationship("Chat", back_populates="current_doc")
    citations: Mapped[list["Citation"]] = relationship(
        "Citation", back_populates="document", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_documents_expiry_status", "expiry_at", "status"),
    )
