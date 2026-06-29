import mimetypes
import logging
import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
from app.config import settings
from unittest.mock import MagicMock

logger = logging.getLogger(__name__)

def get_r2_client(
    account_id: str | None = None,
    access_key_id: str | None = None,
    secret_access_key: str | None = None,
    force_mock: bool = False
):
    """
    Constructs and returns a boto3 S3 client configured for Cloudflare R2.
    If credentials are not provided (or settings are empty), returns a mock client.
    """
    if force_mock:
        return MagicMock()

    acc_id = account_id or settings.R2_ACCOUNT_ID
    key_id = access_key_id or settings.R2_ACCESS_KEY_ID
    sec_key = secret_access_key or settings.R2_SECRET_ACCESS_KEY

    # Fallback to mock if credentials are not fully configured
    if not all([acc_id, key_id, sec_key]):
        return MagicMock()

    endpoint_url = f"https://{acc_id}.r2.cloudflarestorage.com"
    config = Config(signature_version="s3v4")

    return boto3.client(
        "s3",
        endpoint_url=endpoint_url,
        aws_access_key_id=key_id,
        aws_secret_access_key=sec_key,
        config=config
    )

def upload_file(
    user_id: str | int,
    doc_id: str | int,
    filename: str,
    data: bytes,
    content_type: str | None = None
) -> str:
    """
    Uploads file content to Cloudflare R2 bucket.
    Returns the key prefix: {user_id}/{doc_id}/{filename}
    """
    key = f"{user_id}/{doc_id}/{filename}"

    # Determine content type if not provided
    if not content_type:
        content_type, _ = mimetypes.guess_type(filename)
        if not content_type:
            content_type = "application/octet-stream"

    client = get_r2_client()

    # If mock client (MagicMock), just return the key without network calls
    if isinstance(client, MagicMock):
        return key

    try:
        client.put_object(
            Bucket=settings.R2_BUCKET_NAME,
            Key=key,
            Body=data,
            ContentType=content_type
        )
    except ClientError as e:
        logger.error(f"Failed to upload file {key} to R2: {e}")
        raise e

    return key

def delete_file(r2_key: str) -> None:
    """
    Deletes file from Cloudflare R2 bucket using the object key.
    """
    client = get_r2_client()

    # If mock client (MagicMock), just return
    if isinstance(client, MagicMock):
        return

    try:
        client.delete_object(
            Bucket=settings.R2_BUCKET_NAME,
            Key=r2_key
        )
    except ClientError as e:
        logger.error(f"Failed to delete file {r2_key} from R2: {e}")
        raise e

