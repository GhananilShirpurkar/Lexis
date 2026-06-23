from sqlalchemy.orm import DeclarativeBase

class Base(DeclarativeBase):
    """Base class for all SQLAlchemy ORM models."""
    pass

# Import all models to register them on Base.metadata
from app.models.user import User
from app.models.document import Document
from app.models.chat import Chat
from app.models.message import Message
from app.models.citation import Citation
from app.models.project import Project, ProjectChat
from app.models.notification import Notification

