import uuid
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.models.workspace import Workspace, WorkspaceChat, WorkspaceChatMetadata
from app.models.chat import Chat
from app.models.document import Document
from app.models.message import Message
from app.schemas.workspace import (
    WorkspaceCreate, WorkspaceUpdate, WorkspaceAddChat,
    WorkspaceResponse, WorkspaceDetailResponse,
    MemberChatResponse, WorkspaceChatResponse
)
from app.cache import cache

router = APIRouter(prefix="/workspaces", tags=["Workspaces"])

MAX_MEMBER_CHATS = 4


async def _build_workspace_detail(workspace: Workspace, db: AsyncSession) -> WorkspaceDetailResponse:
    """Builds a full WorkspaceDetailResponse from a Workspace ORM object."""
    # Fetch member chats with document info
    member_query = (
        select(WorkspaceChat)
        .where(WorkspaceChat.workspace_id == workspace.id)
        .order_by(WorkspaceChat.added_at.asc())
    )
    member_result = await db.execute(member_query)
    workspace_chat_links = member_result.scalars().all()

    member_chats = []
    for link in workspace_chat_links:
        chat_result = await db.execute(
            select(Chat).where(Chat.id == link.chat_id)
        )
        chat = chat_result.scalars().first()
        if chat:
            doc_filename = None
            if chat.current_doc_id:
                doc_result = await db.execute(
                    select(Document.filename).where(Document.id == chat.current_doc_id)
                )
                doc_row = doc_result.first()
                doc_filename = doc_row[0] if doc_row else None

            member_chats.append(MemberChatResponse(
                id=chat.id,
                title=chat.title,
                current_doc_id=chat.current_doc_id,
                doc_filename=doc_filename,
                added_at=link.added_at
            ))

    # Fetch workspace chat metadata
    meta_result = await db.execute(
        select(WorkspaceChatMetadata).where(WorkspaceChatMetadata.workspace_id == workspace.id)
    )
    meta = meta_result.scalars().first()

    ws_chat_response = None
    if meta:
        ws_chat_result = await db.execute(
            select(Chat).where(Chat.id == meta.chat_id)
        )
        ws_chat = ws_chat_result.scalars().first()
        if ws_chat:
            ws_chat_response = WorkspaceChatResponse(
                id=ws_chat.id,
                title=ws_chat.title,
                created_at=ws_chat.created_at
            )

    return WorkspaceDetailResponse(
        id=workspace.id,
        user_id=workspace.user_id,
        name=workspace.name,
        created_at=workspace.created_at,
        updated_at=workspace.updated_at,
        member_count=len(member_chats),
        member_chats=member_chats,
        workspace_chat=ws_chat_response
    )


@router.post(
    "",
    response_model=WorkspaceDetailResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new workspace",
    description="Creates a workspace with 1-4 member chats and an auto-created Workspace Chat."
)
async def create_workspace(
    request: Request,
    payload: WorkspaceCreate,
    db: AsyncSession = Depends(get_db)
):
    user_id = request.state.user_id

    # 1. Validate chat count
    if len(payload.chat_ids) > MAX_MEMBER_CHATS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": {
                    "code": "TOO_MANY_CHATS",
                    "message": f"Workspaces can hold max {MAX_MEMBER_CHATS} chats."
                }
            }
        )

    # 2. Validate all chats exist and belong to user
    unique_chat_ids = list(set(payload.chat_ids))
    chats_result = await db.execute(
        select(Chat).where(Chat.id.in_(unique_chat_ids), Chat.user_id == user_id)
    )
    found_chats = chats_result.scalars().all()

    if len(found_chats) != len(unique_chat_ids):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": {
                    "code": "CHAT_NOT_FOUND",
                    "message": "One or more selected chats do not exist or do not belong to you."
                }
            }
        )

    # 3. Create workspace
    workspace = Workspace(
        id=uuid.uuid4(),
        user_id=user_id,
        name=payload.name
    )
    db.add(workspace)
    await db.flush()

    # 4. Create junction records for member chats
    for chat_id in unique_chat_ids:
        db.add(WorkspaceChat(
            id=uuid.uuid4(),
            workspace_id=workspace.id,
            chat_id=chat_id
        ))

    # 5. Auto-create workspace chat
    ws_chat = Chat(
        id=uuid.uuid4(),
        user_id=user_id,
        title=f"Workspace Chat",
        is_workspace_chat=True
    )
    db.add(ws_chat)
    await db.flush()

    # 6. Create workspace chat metadata
    db.add(WorkspaceChatMetadata(
        id=uuid.uuid4(),
        workspace_id=workspace.id,
        chat_id=ws_chat.id
    ))

    await db.commit()

    detail = await _build_workspace_detail(workspace, db)
    await cache.delete(f"user:{user_id}:workspaces")
    return detail


@router.get(
    "",
    response_model=list[WorkspaceDetailResponse],
    status_code=status.HTTP_200_OK,
    summary="List all workspaces",
    description="Retrieves all workspaces belonging to the authenticated user."
)
async def list_workspaces(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    user_id = request.state.user_id
    cache_key = f"user:{user_id}:workspaces"
    cached = await cache.get(cache_key)
    if cached:
        return [WorkspaceDetailResponse(**ws) for ws in cached]

    query = (
        select(Workspace)
        .where(Workspace.user_id == user_id)
        .order_by(Workspace.updated_at.desc())
    )
    result = await db.execute(query)
    workspaces = result.scalars().all()

    details = []
    for ws in workspaces:
        details.append(await _build_workspace_detail(ws, db))

    details_dump = [ws.model_dump(mode="json") for ws in details]
    await cache.set(cache_key, details_dump, ttl=120)
    return details


@router.get(
    "/{workspace_id}",
    response_model=WorkspaceDetailResponse,
    status_code=status.HTTP_200_OK,
    summary="Get workspace details",
    description="Retrieves workspace details including member chats and workspace chat."
)
async def get_workspace(
    request: Request,
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
):
    user_id = request.state.user_id
    cache_key = f"workspace:{workspace_id}:meta"
    cached = await cache.get(cache_key)
    if cached:
        return WorkspaceDetailResponse(**cached)

    result = await db.execute(
        select(Workspace).where(Workspace.id == workspace_id, Workspace.user_id == user_id)
    )
    workspace = result.scalars().first()

    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": {
                    "code": "WORKSPACE_NOT_FOUND",
                    "message": "The requested workspace does not exist or does not belong to you."
                }
            }
        )

    detail = await _build_workspace_detail(workspace, db)
    await cache.set(cache_key, detail.model_dump(mode="json"), ttl=120)
    return detail


@router.patch(
    "/{workspace_id}",
    response_model=WorkspaceDetailResponse,
    status_code=status.HTTP_200_OK,
    summary="Rename workspace",
    description="Updates workspace name."
)
async def update_workspace(
    request: Request,
    workspace_id: uuid.UUID,
    payload: WorkspaceUpdate,
    db: AsyncSession = Depends(get_db)
):
    user_id = request.state.user_id

    result = await db.execute(
        select(Workspace).where(Workspace.id == workspace_id, Workspace.user_id == user_id)
    )
    workspace = result.scalars().first()

    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": {
                    "code": "WORKSPACE_NOT_FOUND",
                    "message": "The requested workspace does not exist or does not belong to you."
                }
            }
        )

    if payload.name is not None:
        workspace.name = payload.name

    await db.commit()
    detail = await _build_workspace_detail(workspace, db)
    await cache.delete(f"user:{user_id}:workspaces")
    await cache.delete(f"workspace:{workspace_id}:meta")
    return detail


@router.delete(
    "/{workspace_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete workspace",
    description="Deletes workspace and its workspace chat. Member chats become standalone."
)
async def delete_workspace(
    request: Request,
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
):
    user_id = request.state.user_id

    result = await db.execute(
        select(Workspace).where(Workspace.id == workspace_id, Workspace.user_id == user_id)
    )
    workspace = result.scalars().first()

    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": {
                    "code": "WORKSPACE_NOT_FOUND",
                    "message": "The requested workspace does not exist or does not belong to you."
                }
            }
        )

    # Delete the workspace chat (the 5th chat) — member chats remain standalone
    meta_result = await db.execute(
        select(WorkspaceChatMetadata).where(WorkspaceChatMetadata.workspace_id == workspace_id)
    )
    meta = meta_result.scalars().first()
    if meta:
        ws_chat_result = await db.execute(
            select(Chat).where(Chat.id == meta.chat_id)
        )
        ws_chat = ws_chat_result.scalars().first()
        if ws_chat:
            await db.delete(ws_chat)

    await db.delete(workspace)
    await db.commit()

    await cache.delete(f"user:{user_id}:workspaces")
    await cache.delete(f"workspace:{workspace_id}:meta")
    return


@router.post(
    "/{workspace_id}/chats",
    response_model=WorkspaceDetailResponse,
    status_code=status.HTTP_200_OK,
    summary="Add member chat to workspace",
    description="Adds an existing chat to the workspace as a member chat. Max 4 total."
)
async def add_workspace_chat(
    request: Request,
    workspace_id: uuid.UUID,
    payload: WorkspaceAddChat,
    db: AsyncSession = Depends(get_db)
):
    user_id = request.state.user_id

    # 1. Verify workspace ownership
    ws_result = await db.execute(
        select(Workspace).where(Workspace.id == workspace_id, Workspace.user_id == user_id)
    )
    workspace = ws_result.scalars().first()

    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": {
                    "code": "WORKSPACE_NOT_FOUND",
                    "message": "The requested workspace does not exist or does not belong to you."
                }
            }
        )

    # 2. Check member count
    count_result = await db.execute(
        select(func.count()).select_from(WorkspaceChat).where(WorkspaceChat.workspace_id == workspace_id)
    )
    current_count = count_result.scalar()

    if current_count >= MAX_MEMBER_CHATS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": {
                    "code": "WORKSPACE_FULL",
                    "message": f"Workspaces can hold max {MAX_MEMBER_CHATS} chats. Remove one first."
                }
            }
        )

    # 3. Verify chat exists and belongs to user
    chat_result = await db.execute(
        select(Chat).where(Chat.id == payload.chat_id, Chat.user_id == user_id)
    )
    chat = chat_result.scalars().first()

    if not chat:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": {
                    "code": "CHAT_NOT_FOUND",
                    "message": "The selected chat does not exist or does not belong to you."
                }
            }
        )

    # 4. Check for duplicate
    dup_result = await db.execute(
        select(WorkspaceChat).where(
            WorkspaceChat.workspace_id == workspace_id,
            WorkspaceChat.chat_id == payload.chat_id
        )
    )
    if dup_result.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": {
                    "code": "CHAT_ALREADY_IN_WORKSPACE",
                    "message": "This chat is already a member of this workspace."
                }
            }
        )

    # 5. Add member chat
    db.add(WorkspaceChat(
        id=uuid.uuid4(),
        workspace_id=workspace_id,
        chat_id=payload.chat_id
    ))
    await db.commit()

    detail = await _build_workspace_detail(workspace, db)
    await cache.delete(f"user:{user_id}:workspaces")
    await cache.delete(f"workspace:{workspace_id}:meta")
    return detail


@router.delete(
    "/{workspace_id}/chats/{chat_id}",
    response_model=WorkspaceDetailResponse,
    status_code=status.HTTP_200_OK,
    summary="Remove member chat from workspace",
    description="Removes a member chat from the workspace. Chat becomes standalone."
)
async def remove_workspace_chat(
    request: Request,
    workspace_id: uuid.UUID,
    chat_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
):
    user_id = request.state.user_id

    # 1. Verify workspace ownership
    ws_result = await db.execute(
        select(Workspace).where(Workspace.id == workspace_id, Workspace.user_id == user_id)
    )
    workspace = ws_result.scalars().first()

    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": {
                    "code": "WORKSPACE_NOT_FOUND",
                    "message": "The requested workspace does not exist or does not belong to you."
                }
            }
        )

    # 2. Find and delete the junction record
    link_result = await db.execute(
        select(WorkspaceChat).where(
            WorkspaceChat.workspace_id == workspace_id,
            WorkspaceChat.chat_id == chat_id
        )
    )
    link = link_result.scalars().first()

    if not link:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": {
                    "code": "CHAT_NOT_IN_WORKSPACE",
                    "message": "This chat is not a member of this workspace."
                }
            }
        )

    await db.delete(link)
    await db.commit()

    detail = await _build_workspace_detail(workspace, db)
    await cache.delete(f"user:{user_id}:workspaces")
    await cache.delete(f"workspace:{workspace_id}:meta")
    return detail


@router.post(
    "/{workspace_id}/chat/reset",
    response_model=WorkspaceDetailResponse,
    status_code=status.HTTP_200_OK,
    summary="Reset workspace chat",
    description="Deletes the current workspace chat and creates a new one with a clean history."
)
async def reset_workspace_chat(
    request: Request,
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
):
    user_id = request.state.user_id

    # 1. Verify workspace ownership
    ws_result = await db.execute(
        select(Workspace).where(Workspace.id == workspace_id, Workspace.user_id == user_id)
    )
    workspace = ws_result.scalars().first()

    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": {
                    "code": "WORKSPACE_NOT_FOUND",
                    "message": "The requested workspace does not exist or does not belong to you."
                }
            }
        )

    # 2. Delete existing workspace chat metadata and chat
    meta_result = await db.execute(
        select(WorkspaceChatMetadata).where(WorkspaceChatMetadata.workspace_id == workspace_id)
    )
    meta = meta_result.scalars().first()

    if meta:
        old_chat_result = await db.execute(
            select(Chat).where(Chat.id == meta.chat_id)
        )
        old_chat = old_chat_result.scalars().first()
        if old_chat:
            await db.delete(old_chat)
        await db.delete(meta)

    # 3. Create new workspace chat
    new_ws_chat = Chat(
        id=uuid.uuid4(),
        user_id=user_id,
        title=f"Workspace Chat",
        is_workspace_chat=True
    )
    db.add(new_ws_chat)
    await db.flush()

    db.add(WorkspaceChatMetadata(
        id=uuid.uuid4(),
        workspace_id=workspace_id,
        chat_id=new_ws_chat.id
    ))

    await db.commit()

    detail = await _build_workspace_detail(workspace, db)
    await cache.delete(f"user:{user_id}:workspaces")
    await cache.delete(f"workspace:{workspace_id}:meta")
    return detail
