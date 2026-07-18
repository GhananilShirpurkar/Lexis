import os
import shutil
import uuid
import asyncio
import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Request, BackgroundTasks
from fastapi.responses import StreamingResponse
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.models.chat import Chat
from app.models.document import Document
from app.models.message import Message
from app.models.citation import Citation
from app.schemas.chat import ChatCreate, ChatUpdate, ChatResponse, ChatDetailResponse, MessageResponse, MessageSubmit
from app.storage.r2_client import delete_file
from app.config import settings
from app.cache import cache
from app.documents.summarizer import generate_document_summary
from app.sse import sse_manager

router = APIRouter(
    prefix="/chats",
    tags=["chats"]
)

@router.post(
    "",
    response_model=ChatResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new chat session",
    description="Creates a new chat session. Enforces a per-user limit of 40 active chats."
)
async def create_chat(
    request: Request,
    payload: ChatCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    user_id = request.state.user_id

    # 1. Enforce 40-chat limit per user
    count_query = select(func.count(Chat.id)).where(Chat.user_id == user_id)
    count_result = await db.execute(count_query)
    chat_count = count_result.scalar() or 0

    if chat_count >= 40:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": {
                    "code": "CHAT_LIMIT_EXCEEDED",
                    "message": "You have reached the maximum limit of 40 active chats."
                }
            }
        )

    # 2. Default provider to last_provider or 'gemini'
    last_chat_query = (
        select(Chat)
        .where(Chat.user_id == user_id)
        .order_by(Chat.created_at.desc())
        .limit(1)
    )
    last_chat_result = await db.execute(last_chat_query)
    last_chat = last_chat_result.scalars().first()

    default_provider = "gemini"
    if last_chat and last_chat.last_provider:
        default_provider = last_chat.last_provider

    # 3. Create chat title
    title = payload.title or "New Chat"

    # 4. If current_doc_id is provided, verify it exists and belongs to the user
    doc = None
    if payload.current_doc_id:
        doc_query = select(Document).where(
            Document.id == payload.current_doc_id,
            Document.user_id == user_id
        )
        doc_result = await db.execute(doc_query)
        doc = doc_result.scalars().first()
        if not doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={
                    "error": {
                        "code": "DOCUMENT_NOT_FOUND",
                        "message": "The specified document does not exist or does not belong to you."
                    }
                }
            )

    # 5. Insert new chat
    new_chat = Chat(
        user_id=user_id,
        title=title,
        display_name=title,
        original_name=None,
        last_provider=default_provider,
        current_doc_id=payload.current_doc_id,
        summary_status="generating" if payload.current_doc_id else "not_applicable"
    )
    
    db.add(new_chat)
    await db.commit()
    await db.refresh(new_chat)

    if payload.current_doc_id and doc:
        background_tasks.add_task(
            generate_document_summary,
            new_chat.id,
            payload.current_doc_id,
            doc.filename,
            None
        )

    await cache.delete_pattern(f"user:{user_id}:chats:*")
    return new_chat


@router.get(
    "",
    response_model=list[ChatResponse],
    status_code=status.HTTP_200_OK,
    summary="List all user chats",
    description="Retrieves a list of all chats belonging to the authenticated user, ordered by creation date descending."
)
async def list_chats(
    request: Request,
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db)
):
    user_id = request.state.user_id
    cache_key = f"user:{user_id}:chats:{limit}:{offset}"
    cached = await cache.get(cache_key)
    if cached:
        return [ChatResponse(**c) for c in cached]

    query = (
        select(Chat)
        .where(Chat.user_id == user_id)
        .order_by(Chat.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    result = await db.execute(query)
    chats = result.scalars().all()

    chats_dump = [ChatResponse.model_validate(c).model_dump(mode="json") for c in chats]
    await cache.set(cache_key, chats_dump, ttl=120)
    return chats


@router.get(
    "/{chat_id}",
    response_model=ChatDetailResponse,
    status_code=status.HTTP_200_OK,
    summary="Get chat session details",
    description="Retrieves details and messages of a single chat session if it belongs to the authenticated user."
)
async def get_chat(
    request: Request,
    chat_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
):
    user_id = request.state.user_id
    cache_key = f"chat:{chat_id}:meta"
    cached = await cache.get(cache_key)
    if cached:
        return ChatDetailResponse(**cached)

    # Join or fetch messages eagerly if needed, standard query with ownership check
    query = (
        select(Chat)
        .options(selectinload(Chat.messages).selectinload(Message.citations).selectinload(Citation.document))
        .where(Chat.id == chat_id, Chat.user_id == user_id)
    )
    result = await db.execute(query)
    chat = result.scalars().first()

    if not chat:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": {
                    "code": "CHAT_NOT_FOUND",
                    "message": "The requested chat does not exist or does not belong to you."
                }
            }
        )

    chat_dump = ChatDetailResponse.model_validate(chat).model_dump(mode="json")
    await cache.set(cache_key, chat_dump, ttl=120)
    return chat


@router.get(
    "/{chat_id}/messages",
    response_model=list[MessageResponse],
    status_code=status.HTTP_200_OK,
    summary="Get chat message history",
    description="Retrieves the list of messages and their citations in the chat, ordered by creation date ascending."
)
async def get_chat_messages(
    request: Request,
    chat_id: uuid.UUID,
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db)
):
    user_id = request.state.user_id
    cache_key = f"chat:{chat_id}:messages:{limit}:{offset}"
    cached = await cache.get(cache_key)
    if cached:
        return [MessageResponse(**m) for m in cached]

    # 1. Verify chat ownership first to prevent leaking message history of foreign chats
    chat_query = select(Chat).where(Chat.id == chat_id, Chat.user_id == user_id)
    chat_result = await db.execute(chat_query)
    chat = chat_result.scalars().first()

    if not chat:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": {
                    "code": "CHAT_NOT_FOUND",
                    "message": "The requested chat does not exist or does not belong to you."
                }
            }
        )

    # 2. Fetch messages ordered by created_at ASC with citations
    from sqlalchemy import case
    messages_query = (
        select(Message)
        .where(Message.chat_id == chat_id)
        .order_by(
            Message.created_at.asc(),
            case((Message.role == "user", 0), else_=1).asc(),
            Message.id.asc()
        )
        .limit(limit)
        .offset(offset)
        .options(selectinload(Message.citations).selectinload(Citation.document))
    )
    messages_result = await db.execute(messages_query)
    messages = messages_result.scalars().all()

    messages_dump = [MessageResponse.model_validate(m).model_dump(mode="json") for m in messages]
    await cache.set(cache_key, messages_dump, ttl=60)
    return messages


@router.post(
    "/{chat_id}/messages",
    status_code=status.HTTP_200_OK,
    summary="Submit a query and stream RAG response",
    description="Streams the RAG response token-by-token via SSE and records history on completion."
)
async def submit_message(
    request: Request,
    chat_id: uuid.UUID,
    payload: MessageSubmit,
    db: AsyncSession = Depends(get_db)
):
    """
    POST /chats/{chat_id}/messages: Submit a message and get a streaming SSE response.
    Checks ownership, document validity, and handles LLM provider routing.
    """
    user_id = request.state.user_id

    # 1. Fetch chat and verify ownership
    chat_query = select(Chat).where(Chat.id == chat_id, Chat.user_id == user_id)
    chat_result = await db.execute(chat_query)
    chat = chat_result.scalars().first()

    if not chat:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": {
                    "code": "CHAT_NOT_FOUND",
                    "message": "The requested chat does not exist or does not belong to you."
                }
            }
        )

    # 1.5. Route unified chats to unified query pipeline
    if chat.is_unified:
        if not chat.project_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "error": {
                        "code": "MISSING_PROJECT_ASSOCIATION",
                        "message": "Unified chat is not associated with any project."
                    }
                }
            )
        provider = payload.provider
        if not provider:
            provider = chat.last_provider or "gemini"
        if provider not in ["gemini", "groq"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "error": {
                        "code": "INVALID_PROVIDER",
                        "message": f"Unsupported provider: {provider}. Supported: gemini, groq"
                    }
                }
            )
        from app.rag.pipeline import query_unified
        return StreamingResponse(
            query_unified(project_id=chat.project_id, user_message=payload.content, provider=provider, db=db),
            media_type="text/event-stream"
        )

    # 1.6. Route workspace chats to workspace query pipeline
    if chat.is_workspace_chat:
        from sqlalchemy import select as sa_select
        from app.models.workspace import WorkspaceChatMetadata
        meta_result = await db.execute(
            sa_select(WorkspaceChatMetadata).where(WorkspaceChatMetadata.chat_id == chat.id)
        )
        ws_meta = meta_result.scalars().first()
        if not ws_meta:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "error": {
                        "code": "WORKSPACE_NOT_FOUND",
                        "message": "This workspace chat is not associated with any workspace."
                    }
                }
            )
        provider = payload.provider
        if not provider:
            provider = chat.last_provider or "gemini"
        if provider not in ["gemini", "groq"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "error": {
                        "code": "INVALID_PROVIDER",
                        "message": f"Unsupported provider: {provider}. Supported: gemini, groq"
                    }
                }
            )
        from app.rag.pipeline import query_workspace
        return StreamingResponse(
            query_workspace(
                workspace_id=ws_meta.workspace_id,
                workspace_chat_id=chat.id,
                user_message=payload.content,
                provider=provider,
                db=db
            ),
            media_type="text/event-stream"
        )

    # 2. Check if there is an associated document (bypassed when web search is enabled)
    if not chat.current_doc_id and not payload.web_search:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": {
                    "code": "NO_DOCUMENT_ASSOCIATED",
                    "message": "No document is associated with this chat session."
                }
            }
        )

    # 3. Fetch document and check status / expiry (only if a document is attached)
    if chat.current_doc_id:
        doc_query = select(Document).where(Document.id == chat.current_doc_id, Document.user_id == user_id)
        doc_result = await db.execute(doc_query)
        doc = doc_result.scalars().first()

        if not doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={
                    "error": {
                        "code": "DOCUMENT_NOT_FOUND",
                        "message": "The document associated with this chat could not be found."
                    }
                }
            )

        # Expiry check
        now = datetime.now(timezone.utc)
        doc_expiry = doc.expiry_at
        if doc_expiry.tzinfo is None:
            doc_expiry = doc_expiry.replace(tzinfo=timezone.utc)
        if doc_expiry < now:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "error": {
                        "code": "DOCUMENT_EXPIRED",
                        "message": "Document expired, please re-upload"
                    }
                }
            )

    # 4. Resolve provider
    provider = payload.provider
    if not provider:
        provider = chat.last_provider or "gemini"

    # Validate provider name
    if provider not in ["gemini", "groq"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": {
                    "code": "INVALID_PROVIDER",
                    "message": f"Unsupported provider: {provider}. Supported: gemini, groq"
                }
            }
        )

    # 5. Call query generator and stream (pass web_search flag)
    from app.rag.pipeline import query as rag_query
    return StreamingResponse(
        rag_query(
            chat_id=chat.id,
            user_message=payload.content,
            provider=provider,
            db=db,
            web_search_enabled=payload.web_search
        ),
        media_type="text/event-stream"
    )


@router.patch(
    "/{chat_id}",
    response_model=ChatResponse,
    status_code=status.HTTP_200_OK,
    summary="Update a chat session",
    description="Renames the chat or updates its associated document and provider."
)
async def update_chat(
    request: Request,
    chat_id: uuid.UUID,
    payload: ChatUpdate,
    db: AsyncSession = Depends(get_db)
):
    user_id = request.state.user_id

    query = select(Chat).where(Chat.id == chat_id, Chat.user_id == user_id)
    result = await db.execute(query)
    chat = result.scalars().first()

    if not chat:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": {
                    "code": "CHAT_NOT_FOUND",
                    "message": "The requested chat does not exist or does not belong to you."
                }
            }
        )

    # 1. Handle display_name updates (rename logic)
    if payload.display_name is not None:
        display_name_len = len(payload.display_name)
        if display_name_len < 1 or display_name_len > 60:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "error": {
                        "code": "INVALID_DISPLAY_NAME",
                        "message": "Display name must be between 1 and 60 characters."
                    }
                }
            )
        
        # Track original_name on first rename
        if chat.original_name is None:
            chat.original_name = chat.display_name or chat.title

        chat.display_name = payload.display_name
        chat.title = payload.display_name
        chat.user_edited_title = payload.display_name

    # 1.5. Handle user_edited_title explicitly
    if payload.user_edited_title is not None:
        if payload.user_edited_title == "" or payload.user_edited_title.lower() == "reset":
            chat.user_edited_title = None
            chat.title = chat.generated_title or chat.original_name or chat.title
            chat.display_name = chat.title
        else:
            if chat.original_name is None:
                chat.original_name = chat.display_name or chat.title
            chat.user_edited_title = payload.user_edited_title
            chat.title = payload.user_edited_title
            chat.display_name = payload.user_edited_title

    # 2. Handle current_doc_id updates
    if payload.current_doc_id is not None:
        doc_query = select(Document).where(
            Document.id == payload.current_doc_id,
            Document.user_id == user_id
        )
        doc_result = await db.execute(doc_query)
        doc = doc_result.scalars().first()
        if not doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={
                    "error": {
                        "code": "DOCUMENT_NOT_FOUND",
                        "message": "The specified document does not exist or does not belong to you."
                    }
                }
            )
        chat.current_doc_id = payload.current_doc_id

    # 3. Handle last_provider updates
    if payload.last_provider is not None:
        chat.last_provider = payload.last_provider

    await db.commit()
    await db.refresh(chat)

    await cache.delete_pattern(f"user:{user_id}:chats:*")
    await cache.delete(f"chat:{chat_id}:meta")

    return chat


@router.delete(
    "/{chat_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a chat session",
    description="Deletes the chat session and optionally deletes the document if it becomes orphaned."
)
async def delete_chat(
    request: Request,
    chat_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
):
    user_id = request.state.user_id

    # 1. Fetch chat and verify ownership
    query = select(Chat).where(Chat.id == chat_id, Chat.user_id == user_id)
    result = await db.execute(query)
    chat = result.scalars().first()

    if not chat:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": {
                    "code": "CHAT_NOT_FOUND",
                    "message": "The requested chat does not exist or does not belong to you."
                }
            }
        )

    doc_id_to_check = chat.current_doc_id

    # 2. Delete the chat record (cascade deletes messages and project memberships automatically)
    await db.delete(chat)
    await db.commit()

    await cache.delete_pattern(f"user:{user_id}:chats:*")
    await cache.delete(f"chat:{chat_id}:meta")
    await cache.delete_pattern(f"chat:{chat_id}:messages:*")

    # 3. If there was a linked document, check if it's now orphaned
    if doc_id_to_check:
        # Check if any other chat of this user still references this document
        other_chats_query = select(func.count(Chat.id)).where(
            Chat.user_id == user_id,
            Chat.current_doc_id == doc_id_to_check
        )
        other_chats_result = await db.execute(other_chats_query)
        other_chats_count = other_chats_result.scalar() or 0

        # If no other chat references this document, we hard-delete it
        if other_chats_count == 0:
            doc_query = select(Document).where(
                Document.id == doc_id_to_check,
                Document.user_id == user_id
            )
            doc_result = await db.execute(doc_query)
            doc = doc_result.scalars().first()

            if doc:
                r2_key = doc.r2_key
                # Delete document from NeonDB
                await db.delete(doc)
                await db.commit()

                # Clean up external storage
                try:
                    delete_file(r2_key)
                except Exception:
                    pass

                # Clean up local persistent index
                persist_dir = os.path.join(settings.STORAGE_INDICES_DIR, str(user_id), str(doc_id_to_check))
                if os.path.exists(persist_dir):
                    try:
                        shutil.rmtree(persist_dir)
                    except Exception:
                        pass
    return

@router.post(
    "/{chat_id}/regenerate-summary",
    status_code=status.HTTP_200_OK,
    summary="Regenerate document summary and title",
    description="Trigger a background task to regenerate the document summary and title."
)
async def regenerate_summary(
    request: Request,
    chat_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    user_id = request.state.user_id
    chat_query = select(Chat).where(Chat.id == chat_id, Chat.user_id == user_id)
    chat_result = await db.execute(chat_query)
    chat = chat_result.scalars().first()
    if not chat:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": {
                    "code": "CHAT_NOT_FOUND",
                    "message": "The requested chat does not exist or does not belong to you."
                }
            }
        )
    if not chat.current_doc_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": {
                    "code": "NO_DOCUMENT_ASSOCIATED",
                    "message": "No document is associated with this chat session."
                }
            }
        )
    if chat.summary_status == "generating":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": {
                    "code": "SUMMARY_GENERATING",
                    "message": "Summary is already being generated."
                }
            }
        )
        
    doc_query = select(Document).where(Document.id == chat.current_doc_id, Document.user_id == user_id)
    doc_result = await db.execute(doc_query)
    doc = doc_result.scalars().first()
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": {
                    "code": "DOCUMENT_NOT_FOUND",
                    "message": "The document associated with this chat could not be found."
                }
            }
        )
        
    chat.summary_status = "generating"
    await db.commit()
    
    background_tasks.add_task(
        generate_document_summary,
        chat.id,
        chat.current_doc_id,
        doc.filename,
        None
    )
    
    return {"status": "generating"}

@router.get("/{chat_id}/events")
async def chat_events(
    request: Request,
    chat_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
):
    """
    SSE endpoint to subscribe to real-time updates for a specific chat.
    """
    user_id = request.state.user_id
    chat_query = select(Chat).where(Chat.id == chat_id, Chat.user_id == user_id)
    chat_result = await db.execute(chat_query)
    chat = chat_result.scalars().first()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
        
    async def event_generator():
        queue = await sse_manager.connect(chat_id)
        try:
            # Yield initial state
            yield f"data: {json.dumps({'type': 'initial', 'summary_status': chat.summary_status, 'generated_summary': chat.generated_summary, 'generated_title': chat.generated_title})}\n\n"
            
            while True:
                if await request.is_disconnected():
                    break
                try:
                    data = await asyncio.wait_for(queue.get(), timeout=2.0)
                    yield f"data: {json.dumps(data)}\n\n"
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
        finally:
            await sse_manager.disconnect(chat_id, queue)
            
    return StreamingResponse(event_generator(), media_type="text/event-stream")
