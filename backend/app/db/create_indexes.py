import asyncio
import re
from sqlalchemy import text
from app.db.session import engine

INDEX_STATEMENTS = [
    # Messages: primary query pattern (chat_id, created_at DESC)
    "CREATE INDEX IF NOT EXISTS idx_messages_chat_id_created_at ON messages(chat_id, created_at DESC);",
    
    # Chats: listing with user_id and created_at DESC
    "CREATE INDEX IF NOT EXISTS idx_chats_user_id_created_at ON chats(user_id, created_at DESC);",
    
    # Documents: library listing with user_id and uploaded_at DESC
    "CREATE INDEX IF NOT EXISTS idx_documents_user_id_uploaded_at ON documents(user_id, uploaded_at DESC);",
    
    # Citations: RAG lookups
    "CREATE INDEX IF NOT EXISTS idx_citations_document_id ON citations(document_id);",
    "CREATE INDEX IF NOT EXISTS idx_citations_message_id ON citations(message_id);",
    
    # Notifications: unread status lookup
    "CREATE INDEX IF NOT EXISTS idx_notifications_user_id_status ON notifications(user_id, status);",
    
    # Projects: membership lookups
    "CREATE INDEX IF NOT EXISTS idx_project_chats_project_id ON project_chats(project_id);",
    "CREATE INDEX IF NOT EXISTS idx_project_chats_chat_id ON project_chats(chat_id);",
    
    # Users: profile lookups
    "CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);",
    "CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);",

    # Workspaces: user listing and member lookups
    "CREATE INDEX IF NOT EXISTS idx_workspaces_user_id ON workspaces(user_id);",
    "CREATE INDEX IF NOT EXISTS idx_workspace_chats_workspace_id ON workspace_chats(workspace_id);",
    "CREATE INDEX IF NOT EXISTS idx_workspace_chats_chat_id ON workspace_chats(chat_id);",
    "CREATE INDEX IF NOT EXISTS idx_workspace_chat_metadata_workspace_id ON workspace_chat_metadata(workspace_id);",
    "CREATE INDEX IF NOT EXISTS idx_workspace_chat_metadata_chat_id ON workspace_chat_metadata(chat_id);"
]

async def apply_indexes():
    """Applies high-impact performance database indexes on Neon PostgreSQL in isolated transactions."""
    for stmt in INDEX_STATEMENTS:
        match = re.search(r"idx_\w+", stmt)
        idx_name = match.group(0) if match else stmt
        try:
            async with engine.connect() as conn:
                await conn.execute(text(stmt))
                await conn.commit()
                print(f"[INDEX SUCCESS] {idx_name}")
        except Exception as e:
            print(f"[INDEX ERROR] Failed for '{idx_name}': {e}")

if __name__ == "__main__":
    asyncio.run(apply_indexes())
