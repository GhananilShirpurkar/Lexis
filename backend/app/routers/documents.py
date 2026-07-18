import uuid
import os
import shutil
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Request, UploadFile, File, Form, Response, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.db.session import get_db
from app.models.document import Document
from app.models.chat import Chat
from app.documents.validation import validate_file, validate_file_size, calculate_expiry
from app.storage.r2_client import upload_file, delete_file, get_file_content
from app.rag.pipeline import index_document
from app.schemas.document import DocumentResponse, DocumentUpdate
from app.config import settings
from app.core.caching import invalidate_public_library
from app.documents.summarizer import generate_document_summary


router = APIRouter(prefix="/documents", tags=["Documents"])

@router.post(
    "/upload",
    response_model=DocumentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload and index a document",
    description="Uploads a document to object storage and compiles its vector search index."
)
async def upload_document(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    chat_id: str | None = Form(None),
    db: AsyncSession = Depends(get_db)
):
    """
    POST /documents/upload: Accepts a file and an optional chat_id via multipart/form-data.
    Validates file format and size, uploads it to storage, runs LlamaIndex pipeline, and returns the metadata.
    """
    # 1. Access authenticated user ID from request state
    user_id = request.state.user_id

    # 2. If chat_id is provided, validate that the chat exists and belongs to the user
    chat = None
    if chat_id:
        try:
            parsed_chat_id = uuid.UUID(chat_id)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "error": {
                        "code": "INVALID_CHAT_ID",
                        "message": "The chat ID provided is not a valid UUID."
                    }
                }
            )
        
        query = select(Chat).where(Chat.id == parsed_chat_id, Chat.user_id == user_id)
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

    # 3. Validate file format and size
    validate_file(file.filename, file.content_type)
    
    # Check headers for content-length if present, then actual size
    content_length = request.headers.get("content-length")
    try:
        content_length_int = int(content_length) if content_length is not None else None
    except ValueError:
        content_length_int = None

    await validate_file_size(file, content_length_int)

    # 4. Read file bytes
    file_bytes = await file.read()
    
    # 5. Generate a unique document ID
    doc_id = uuid.uuid4()

    # 6. Upload to S3/Tigris
    r2_key = upload_file(
        user_id=user_id,
        doc_id=doc_id,
        filename=file.filename,
        data=file_bytes,
        content_type=file.content_type
    )

    # 7. Index document
    try:
        pipeline_result = index_document(
            file_bytes=file_bytes,
            filename=file.filename,
            user_id=user_id,
            doc_id=doc_id
        )
    except Exception as e:
        # Note: index_document itself rolls back the uploaded file from S3 and cleans up local index,
        # but raises the exception. We propagate it.
        raise e

    # 8. Calculate timestamps (matching NeonDB timezone=True format)
    uploaded_at = datetime.now(timezone.utc)
    expiry_at = calculate_expiry(uploaded_at)

    # 9. Perform database transaction atomically
    try:
        db_document = Document(
            id=doc_id,
            user_id=user_id,
            filename=file.filename,
            r2_key=r2_key,
            status="completed",
            summary=pipeline_result["summary"],
            size_bytes=len(file_bytes),
            uploaded_at=uploaded_at,
            expiry_at=expiry_at
        )
        db.add(db_document)

        if chat:
            chat.current_doc_id = doc_id
            chat.summary_status = "generating"
            
            # Initial name fallback is filename
            if chat.title == "New Chat":
                derived_title = file.filename
                if len(derived_title) > 60:
                    derived_title = derived_title[:60]
                chat.title = derived_title

        await db.commit()
        if chat:
            background_tasks.add_task(
                generate_document_summary,
                chat.id,
                doc_id,
                file.filename,
                pipeline_result["text"]
            )
    except Exception as db_exc:
        # Rollback db session
        await db.rollback()

        # Clean up storage upload (Tigris/S3)
        try:
            delete_file(r2_key)
        except Exception:
            pass

        # Clean up local persistent index files
        persist_dir = os.path.join(settings.STORAGE_INDICES_DIR, str(user_id), str(doc_id))
        if os.path.exists(persist_dir):
            try:
                shutil.rmtree(persist_dir)
            except Exception:
                pass

        raise db_exc

    invalidate_public_library()

    return {
        "id": doc_id,
        "user_id": user_id,
        "filename": file.filename,
        "size_bytes": len(file_bytes),
        "status": "completed",
        "summary": pipeline_result["summary"],
        "uploaded_at": uploaded_at,
        "expiry_at": expiry_at
    }


@router.get(
    "/{doc_id}",
    response_model=DocumentResponse,
    status_code=status.HTTP_200_OK,
    summary="Get document metadata",
    description="Retrieves the metadata of a document if it belongs to the authenticated user."
)
async def get_document(
    request: Request,
    doc_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
):
    """
    GET /documents/{doc_id}: Retrieves metadata for the requested document.
    Returns 404 Not Found if the document does not exist or does not belong to the user.
    """
    user_id = request.state.user_id

    query = select(Document).where(Document.id == doc_id, Document.user_id == user_id)
    result = await db.execute(query)
    document = result.scalars().first()

    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": {
                    "code": "DOCUMENT_NOT_FOUND",
                    "message": "The requested document does not exist or does not belong to you."
                }
            }
        )

    return document


@router.delete(
    "/{doc_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a document",
    description="Deletes a document from the database, storage, and local vector index."
)
async def delete_document(
    request: Request,
    doc_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
):
    """
    DELETE /documents/{doc_id}: Hard deletes a document and cleans up related storage and vector index files.
    Returns 404 Not Found if the document does not exist or does not belong to the user.
    """
    user_id = request.state.user_id

    # 1. Fetch document and verify ownership
    query = select(Document).where(Document.id == doc_id, Document.user_id == user_id)
    result = await db.execute(query)
    document = result.scalars().first()

    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": {
                    "code": "DOCUMENT_NOT_FOUND",
                    "message": "The requested document does not exist or does not belong to you."
                }
            }
        )

    r2_key = document.r2_key

    # 2. Perform DB deletion
    await db.delete(document)
    await db.commit()

    # 3. Clean up external storage (Tigris/S3)
    try:
        delete_file(r2_key)
    except Exception:
        # Prevent blocking if external service has issues
        pass

    # 4. Clean up local persistent index files
    persist_dir = os.path.join(settings.STORAGE_INDICES_DIR, str(user_id), str(doc_id))
    if os.path.exists(persist_dir):
        try:
            shutil.rmtree(persist_dir)
        except Exception:
            pass

    invalidate_public_library()
    return


@router.get(
    "",
    response_model=list[DocumentResponse],
    status_code=status.HTTP_200_OK,
    summary="List all user documents",
    description="Returns all documents uploaded by the authenticated user, sorted by upload date."
)
async def list_documents(
    request: Request,
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db)
):
    """
    GET /documents: Returns a list of all documents belonging to the authenticated user.
    """
    user_id = request.state.user_id

    query = (
        select(Document)
        .where(Document.user_id == user_id)
        .order_by(Document.uploaded_at.desc())
        .limit(limit)
        .offset(offset)
    )
    result = await db.execute(query)
    documents = result.scalars().all()

    return documents


@router.patch(
    "/{doc_id}",
    response_model=DocumentResponse,
    status_code=status.HTTP_200_OK,
    summary="Rename a document",
    description="Updates the filename of a document owned by the authenticated user."
)
async def rename_document(
    request: Request,
    doc_id: uuid.UUID,
    payload: DocumentUpdate,
    db: AsyncSession = Depends(get_db)
):
    """
    PATCH /documents/{doc_id}: Renames the specified document.
    """
    user_id = request.state.user_id

    new_filename = payload.filename.strip()
    if not new_filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": {
                    "code": "INVALID_FILENAME",
                    "message": "Filename cannot be empty."
                }
            }
        )

    query = select(Document).where(Document.id == doc_id, Document.user_id == user_id)
    result = await db.execute(query)
    document = result.scalars().first()

    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": {
                    "code": "DOCUMENT_NOT_FOUND",
                    "message": "The requested document does not exist or does not belong to you."
                }
            }
        )

    document.filename = new_filename
    await db.commit()
    await db.refresh(document)

    return document


@router.get(
    "/{doc_id}/download",
    summary="Download document file",
    description="Retrieves and serves the original document file as an attachment."
)
async def download_document(
    request: Request,
    doc_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
):
    """
    GET /documents/{doc_id}/download: Downloads the raw document file.
    """
    user_id = request.state.user_id

    query = select(Document).where(Document.id == doc_id, Document.user_id == user_id)
    result = await db.execute(query)
    document = result.scalars().first()

    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": {
                    "code": "DOCUMENT_NOT_FOUND",
                    "message": "The requested document does not exist or does not belong to you."
                }
            }
        )

    file_bytes = get_file_content(document.r2_key)

    if file_bytes is None:
        # Fallback text if mock S3 or missing storage file
        fallback_content = (
            f"LEXIS Document Archive\n"
            f"Document Title: {document.filename}\n"
            f"Document ID: {document.id}\n"
            f"Summary:\n{document.summary or 'No summary available.'}\n"
        ).encode('utf-8')
        file_bytes = fallback_content

    headers = {
        "Content-Disposition": f'attachment; filename="{document.filename}"'
    }
    return Response(content=file_bytes, media_type="application/octet-stream", headers=headers)

