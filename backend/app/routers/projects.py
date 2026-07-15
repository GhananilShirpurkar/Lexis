import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.project import Project, ProjectChat
from app.models.chat import Chat
from app.schemas.project import (
    ProjectCreate,
    ProjectUpdate,
    ProjectResponse,
    ProjectDetailResponse,
    ProjectAddChat
)

router = APIRouter(
    prefix="/projects",
    tags=["projects"]
)

@router.post(
    "",
    response_model=ProjectDetailResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new project",
    description="Creates a new project from 2-4 existing chats. Enforces limit of 10 projects and 40 active chats."
)
async def create_project(
    request: Request,
    payload: ProjectCreate,
    db: AsyncSession = Depends(get_db)
):
    user_id = request.state.user_id

    # 1. Enforce 10-project limit per user
    project_count_query = select(func.count(Project.id)).where(Project.user_id == user_id)
    project_count_result = await db.execute(project_count_query)
    project_count = project_count_result.scalar() or 0

    if project_count >= 10:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "PROJECT_LIMIT_EXCEEDED",
                "message": "You have reached the maximum limit of 10 projects."
            }
        )

    # 2. Verify chat_ids length (already enforced by Pydantic, but let's double check)
    chat_ids = list(set(payload.chat_ids))  # Deduplicate input
    if len(chat_ids) < 2 or len(chat_ids) > 4:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "INVALID_CHAT_COUNT",
                "message": "A project must contain between 2 and 4 member chats."
            }
        )

    # 3. Enforce 40 total chats limit (standalone + member + unified)
    # Creating a project automatically creates a Unified Chat.
    chat_count_query = select(func.count(Chat.id)).where(Chat.user_id == user_id)
    chat_count_result = await db.execute(chat_count_query)
    chat_count = chat_count_result.scalar() or 0

    if chat_count + 1 > 40:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "CHAT_LIMIT_EXCEEDED",
                "message": "Creating this project's unified chat would exceed the maximum limit of 40 active chats."
            }
        )

    # 4. Fetch the chats to verify ownership and check type/document limit
    chats_query = select(Chat).where(Chat.id.in_(chat_ids), Chat.user_id == user_id)
    chats_result = await db.execute(chats_query)
    chats = chats_result.scalars().all()

    if len(chats) != len(chat_ids):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "CHAT_NOT_FOUND",
                "message": "One or more of the specified chats were not found or do not belong to you."
            }
        )

    # Chats must not be unified chats themselves
    for c in chats:
        if c.is_unified:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "INVALID_CHAT_TYPE",
                    "message": "Cannot create a project containing a unified chat."
                }
            )

    # 5. Verify the unique documents count is <= 4
    doc_ids = {c.current_doc_id for c in chats if c.current_doc_id is not None}
    if len(doc_ids) > 4:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "DOCUMENT_LIMIT_EXCEEDED",
                "message": "A project cannot contain more than 4 unique documents."
            }
        )

    # 6. Create the Project and Unified Chat atomically
    project = Project(
        id=uuid.uuid4(),
        user_id=user_id,
        name=payload.name,
        description=payload.description
    )
    db.add(project)
    await db.flush()

    unified_chat = Chat(
        id=uuid.uuid4(),
        user_id=user_id,
        project_id=project.id,
        is_unified=True,
        title=f"Unified: {project.name}"
    )
    db.add(unified_chat)

    # Create project_chats junction records
    for chat_id in chat_ids:
        project_chat = ProjectChat(
            id=uuid.uuid4(),
            project_id=project.id,
            chat_id=chat_id
        )
        db.add(project_chat)

    await db.commit()

    return ProjectDetailResponse(
        id=project.id,
        user_id=project.user_id,
        name=project.name,
        description=project.description,
        created_at=project.created_at,
        unified_chat_id=unified_chat.id,
        chat_ids=chat_ids
    )

@router.get(
    "",
    response_model=list[ProjectDetailResponse],
    summary="List all projects",
    description="Returns a list of all projects belonging to the calling user."
)
async def list_projects(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    user_id = request.state.user_id

    # Fetch projects
    projects_query = select(Project).where(Project.user_id == user_id)
    projects_result = await db.execute(projects_query)
    projects = projects_result.scalars().all()

    response = []
    for proj in projects:
        # Find unified chat
        unified_query = select(Chat).where(Chat.project_id == proj.id, Chat.is_unified == True)
        unified_result = await db.execute(unified_query)
        unified_chat = unified_result.scalars().first()

        # Find member chat ids
        member_query = select(ProjectChat.chat_id).where(ProjectChat.project_id == proj.id)
        member_result = await db.execute(member_query)
        chat_ids = list(member_result.scalars().all())

        response.append(
            ProjectDetailResponse(
                id=proj.id,
                user_id=proj.user_id,
                name=proj.name,
                description=proj.description,
                created_at=proj.created_at,
                unified_chat_id=unified_chat.id if unified_chat else None,
                chat_ids=chat_ids
            )
        )

    return response

@router.get(
    "/{project_id}",
    response_model=ProjectDetailResponse,
    summary="Get project details",
    description="Returns the details of a single project, verifying ownership."
)
async def get_project(
    project_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    user_id = request.state.user_id

    # Fetch project
    project_query = select(Project).where(Project.id == project_id)
    project_result = await db.execute(project_query)
    project = project_result.scalars().first()

    if not project or project.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "PROJECT_NOT_FOUND",
                "message": "Project not found."
            }
        )

    # Find unified chat
    unified_query = select(Chat).where(Chat.project_id == project.id, Chat.is_unified == True)
    unified_result = await db.execute(unified_query)
    unified_chat = unified_result.scalars().first()

    # Find member chat ids
    member_query = select(ProjectChat.chat_id).where(ProjectChat.project_id == project.id)
    member_result = await db.execute(member_query)
    chat_ids = list(member_result.scalars().all())

    return ProjectDetailResponse(
        id=project.id,
        user_id=project.user_id,
        name=project.name,
        description=project.description,
        created_at=project.created_at,
        unified_chat_id=unified_chat.id if unified_chat else None,
        chat_ids=chat_ids
    )

@router.patch(
    "/{project_id}",
    response_model=ProjectDetailResponse,
    summary="Update project name and description",
    description="Renames a project or updates its description, maintaining unified chat title sync."
)
async def update_project(
    project_id: uuid.UUID,
    payload: ProjectUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    user_id = request.state.user_id

    # Fetch project
    project_query = select(Project).where(Project.id == project_id)
    project_result = await db.execute(project_query)
    project = project_result.scalars().first()

    if not project or project.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "PROJECT_NOT_FOUND",
                "message": "Project not found."
            }
        )

    # Update name / description
    if payload.name is not None:
        project.name = payload.name
        # Update Unified Chat title as well
        unified_query = select(Chat).where(Chat.project_id == project.id, Chat.is_unified == True)
        unified_result = await db.execute(unified_query)
        unified_chat = unified_result.scalars().first()
        if unified_chat:
            unified_chat.title = f"Unified: {payload.name}"

    if payload.description is not None:
        project.description = payload.description

    await db.commit()

    # Get updated details
    unified_query = select(Chat).where(Chat.project_id == project.id, Chat.is_unified == True)
    unified_result = await db.execute(unified_query)
    unified_chat = unified_result.scalars().first()

    member_query = select(ProjectChat.chat_id).where(ProjectChat.project_id == project.id)
    member_result = await db.execute(member_query)
    chat_ids = list(member_result.scalars().all())

    return ProjectDetailResponse(
        id=project.id,
        user_id=project.user_id,
        name=project.name,
        description=project.description,
        created_at=project.created_at,
        unified_chat_id=unified_chat.id if unified_chat else None,
        chat_ids=chat_ids
    )

@router.delete(
    "/{project_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a project",
    description="Deletes a project, cascading deletion to project chats and its Unified Chat."
)
async def delete_project(
    project_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    user_id = request.state.user_id

    # Fetch project
    project_query = select(Project).where(Project.id == project_id)
    project_result = await db.execute(project_query)
    project = project_result.scalars().first()

    if not project or project.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "PROJECT_NOT_FOUND",
                "message": "Project not found."
            }
        )

    await db.delete(project)
    await db.commit()

@router.post(
    "/{project_id}/chats",
    response_model=ProjectDetailResponse,
    summary="Add a chat to a project",
    description="Adds a member chat to a project. Enforces boundary counts (max 4 chats and max 4 unique docs)."
)
async def add_project_chat(
    project_id: uuid.UUID,
    payload: ProjectAddChat,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    user_id = request.state.user_id

    # 1. Fetch project
    project_query = select(Project).where(Project.id == project_id)
    project_result = await db.execute(project_query)
    project = project_result.scalars().first()

    if not project or project.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "PROJECT_NOT_FOUND",
                "message": "Project not found."
            }
        )

    # 2. Fetch the target chat to add
    chat_query = select(Chat).where(Chat.id == payload.chat_id, Chat.user_id == user_id)
    chat_result = await db.execute(chat_query)
    chat = chat_result.scalars().first()

    if not chat:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "CHAT_NOT_FOUND",
                "message": "Chat not found or does not belong to you."
            }
        )

    if chat.is_unified:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "INVALID_CHAT_TYPE",
                "message": "Cannot add a unified chat to a project."
            }
        )

    # 3. Check if chat is already a member
    exist_query = select(ProjectChat).where(
        ProjectChat.project_id == project_id,
        ProjectChat.chat_id == payload.chat_id
    )
    exist_result = await db.execute(exist_query)
    if exist_result.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "CHAT_ALREADY_MEMBER",
                "message": "This chat is already a member of the project."
            }
        )

    # 4. Enforce 4 member chats limit
    member_chats_query = select(Chat).join(ProjectChat, ProjectChat.chat_id == Chat.id).where(ProjectChat.project_id == project_id)
    member_chats_result = await db.execute(member_chats_query)
    member_chats = member_chats_result.scalars().all()

    if len(member_chats) >= 4:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "CHAT_LIMIT_EXCEEDED",
                "message": "A project cannot contain more than 4 chats."
            }
        )

    # 5. Enforce 4 unique documents limit
    doc_ids = {c.current_doc_id for c in member_chats if c.current_doc_id is not None}
    if chat.current_doc_id is not None:
        doc_ids.add(chat.current_doc_id)

    if len(doc_ids) > 4:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "DOCUMENT_LIMIT_EXCEEDED",
                "message": "A project cannot contain more than 4 unique documents."
            }
        )

    # 6. Add junction record
    project_chat = ProjectChat(
        id=uuid.uuid4(),
        project_id=project_id,
        chat_id=payload.chat_id
    )
    db.add(project_chat)
    await db.commit()

    # Get updated details
    unified_query = select(Chat).where(Chat.project_id == project.id, Chat.is_unified == True)
    unified_result = await db.execute(unified_query)
    unified_chat = unified_result.scalars().first()

    member_ids_query = select(ProjectChat.chat_id).where(ProjectChat.project_id == project.id)
    member_ids_result = await db.execute(member_ids_query)
    chat_ids = list(member_ids_result.scalars().all())

    return ProjectDetailResponse(
        id=project.id,
        user_id=project.user_id,
        name=project.name,
        description=project.description,
        created_at=project.created_at,
        unified_chat_id=unified_chat.id if unified_chat else None,
        chat_ids=chat_ids
    )

@router.delete(
    "/{project_id}/chats/{chat_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove a chat from a project",
    description="Removes a member chat from a project. Enforces a minimum count of 2 member chats."
)
async def remove_project_chat(
    project_id: uuid.UUID,
    chat_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    user_id = request.state.user_id

    # 1. Fetch project to verify ownership
    project_query = select(Project).where(Project.id == project_id)
    project_result = await db.execute(project_query)
    project = project_result.scalars().first()

    if not project or project.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "PROJECT_NOT_FOUND",
                "message": "Project not found."
            }
        )

    # Verify target chat belongs to the user
    chat_query = select(Chat).where(Chat.id == chat_id, Chat.user_id == user_id)
    chat_result = await db.execute(chat_query)
    chat = chat_result.scalars().first()

    if not chat:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "CHAT_NOT_FOUND",
                "message": "Chat not found or does not belong to you."
            }
        )

    # 2. Check if junction record exists
    exist_query = select(ProjectChat).where(
        ProjectChat.project_id == project_id,
        ProjectChat.chat_id == chat_id
    )
    exist_result = await db.execute(exist_query)
    project_chat = exist_result.scalars().first()

    if not project_chat:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "CHAT_NOT_MEMBER",
                "message": "This chat is not a member of the project."
            }
        )

    # 3. Enforce minimum of 2 chats
    member_count_query = select(func.count(ProjectChat.id)).where(ProjectChat.project_id == project_id)
    member_count_result = await db.execute(member_count_query)
    member_count = member_count_result.scalar() or 0

    if member_count <= 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "MIN_CHATS_REQUIRED",
                "message": "A project must contain at least 2 member chats."
            }
        )

    # Delete junction record
    await db.delete(project_chat)
    await db.commit()
