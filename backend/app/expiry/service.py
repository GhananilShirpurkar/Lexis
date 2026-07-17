import os
import shutil
import logging
from datetime import datetime, timezone, timedelta
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.session import AsyncSessionLocal
from app.models.document import Document
from app.models.notification import Notification
from app.storage.r2_client import delete_file

logger = logging.getLogger(__name__)

async def check_document_expirations(db: AsyncSession) -> None:
    """
    Scans for documents whose expiry timestamp has passed.
    For each expired document, deletes the physical file from S3/Tigris,
    deletes the local vector index, and sets the document's status to 'expired' in NeonDB.
    """
    now = datetime.now(timezone.utc)
    # Find active/completed documents that have expired
    query = select(Document).where(
        and_(
            Document.expiry_at <= now,
            Document.status != "expired"
        )
    )
    result = await db.execute(query)
    expired_docs = result.scalars().all()

    for doc in expired_docs:
        logger.info(f"Expiring document: {doc.filename} (ID: {doc.id}) for user {doc.user_id}")
        
        # 1. Clean up S3/Tigris storage
        try:
            delete_file(doc.r2_key)
        except Exception as e:
            logger.error(f"Failed to delete S3 file for expired doc {doc.id}: {e}")

        # 2. Clean up local persistent index files
        persist_dir = os.path.join(settings.STORAGE_INDICES_DIR, str(doc.user_id), str(doc.id))
        if os.path.exists(persist_dir):
            try:
                shutil.rmtree(persist_dir)
            except Exception as e:
                logger.error(f"Failed to delete local vector index directory {persist_dir}: {e}")

        # 3. Update database record status
        doc.status = "expired"
        db.add(doc)

    if expired_docs:
        await db.commit()


async def check_expiry_warnings(db: AsyncSession) -> None:
    """
    Scans for documents expiring within the next 48 hours.
    Creates a notification warning the user of the impending expiration if one does not already exist.
    """
    now = datetime.now(timezone.utc)
    warning_threshold = now + timedelta(hours=48)
    
    # Query documents that expire within 48 hours, and are not yet expired
    query = select(Document).where(
        and_(
            Document.expiry_at <= warning_threshold,
            Document.expiry_at > now,
            Document.status != "expired"
        )
    )
    result = await db.execute(query)
    expiring_docs = result.scalars().all()

    notifications_to_add = []
    for doc in expiring_docs:
        # Check if we have already sent a warning notification since the document was uploaded/reset
        notif_query = select(Notification).where(
            and_(
                Notification.user_id == doc.user_id,
                Notification.message.like(f"%{doc.id}%"),
                Notification.created_at >= doc.uploaded_at
            )
        )
        notif_result = await db.execute(notif_query)
        existing_notif = notif_result.scalars().first()

        if not existing_notif:
            logger.info(f"Creating expiry warning notification for doc {doc.id} (user {doc.user_id})")
            notifications_to_add.append({
                "id": uuid.uuid4(),
                "user_id": doc.user_id,
                "title": f"Document Expiring Soon: {doc.filename}",
                "message": (
                    f"Your document '{doc.filename}' (ID: {doc.id}) will expire on "
                    f"{doc.expiry_at.strftime('%Y-%m-%d %H:%M:%S')} UTC. "
                    f"Please re-upload it to keep it active."
                ),
                "status": "unread"
            })

    if notifications_to_add:
        from sqlalchemy.dialects.postgresql import insert as pg_insert
        BATCH_SIZE = 500
        for i in range(0, len(notifications_to_add), BATCH_SIZE):
            chunk = notifications_to_add[i:i + BATCH_SIZE]
            stmt = pg_insert(Notification).values(chunk).on_conflict_do_nothing()
            await db.execute(stmt)
        await db.commit()


async def run_expiry_scan() -> None:
    """
    Wrapper function run by the background scheduler.
    Creates a database session, scans for expirations, and scans for warnings.
    """
    logger.info("Starting background expiry scan...")
    async with AsyncSessionLocal() as db:
        try:
            # 1. Process document expirations
            await check_document_expirations(db)
            # 2. Process expiry warning notices
            await check_expiry_warnings(db)
            logger.info("Background expiry scan completed successfully.")
        except Exception as e:
            logger.error(f"Error during background expiry scan: {e}")
            await db.rollback()
