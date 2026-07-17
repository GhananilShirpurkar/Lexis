from app.db.base_class import Base

# Import all models to register them on Base.metadata
from app.models.user import User
from app.models.document import Document
from app.models.chat import Chat
from app.models.message import Message
from app.models.citation import Citation
from app.models.project import Project, ProjectChat
from app.models.notification import Notification
from app.models.invoice import Invoice
from app.models.workspace import Workspace, WorkspaceChat, WorkspaceChatMetadata
