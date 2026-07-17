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
    Constructs and returns a boto3 S3 client configured for Tigris/S3.
    If credentials are not provided (or settings are empty), returns a mock client.
    """
    if force_mock or settings.FORCE_MOCK_S3:
        return MagicMock()

    acc_id = account_id or settings.ENDPOINT_URL_S3
    key_id = access_key_id or settings.TIGRIS_ACCESS_KEY_ID
    sec_key = secret_access_key or settings.TIGRIS_SECRET_KEY

    # Fallback to mock if credentials are not fully configured
    if not all([acc_id, key_id, sec_key]):
        return MagicMock()

    # Resolve endpoint URL: full URLs (like Tigris) are used as-is, else fallback to R2 subdomain format
    if acc_id.startswith("http://") or acc_id.startswith("https://"):
        endpoint_url = acc_id
    else:
        endpoint_url = f"https://{acc_id}.r2.cloudflarestorage.com"

    config = Config(
        signature_version="s3v4",
        s3={"addressing_style": "path"}
    )

    return boto3.client(
        "s3",
        endpoint_url=endpoint_url,
        aws_access_key_id=key_id,
        aws_secret_access_key=sec_key,
        region_name="us-east-1",
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
    Uploads file content to the Tigris/S3 bucket.
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
        # Check if bucket exists, create if missing
        try:
            client.head_bucket(Bucket=settings.S3_BUCKET_NAME)
        except ClientError as head_err:
            err_code = head_err.response.get("Error", {}).get("Code")
            logger.warning(f"head_bucket '{settings.S3_BUCKET_NAME}' returned: {err_code} ({head_err}). Attempting bucket creation...")
            try:
                client.create_bucket(Bucket=settings.S3_BUCKET_NAME)
                logger.info(f"Successfully created Tigris bucket '{settings.S3_BUCKET_NAME}'")
            except Exception as create_err:
                logger.warning(f"create_bucket '{settings.S3_BUCKET_NAME}' failed: {create_err}")

        client.put_object(
            Bucket=settings.S3_BUCKET_NAME,
            Key=key,
            Body=data,
            ContentType=content_type
        )
    except ClientError as e:
        logger.error(f"Failed to upload file {key} to Tigris (Bucket: '{settings.S3_BUCKET_NAME}', Endpoint: '{settings.ENDPOINT_URL_S3}'): {e}")
        raise e

    return key

def delete_file(r2_key: str) -> None:
    """
    Deletes file from the Tigris/S3 bucket using the object key.
    """
    client = get_r2_client()

    # If mock client (MagicMock), just return
    if isinstance(client, MagicMock):
        return

    try:
        client.delete_object(
            Bucket=settings.S3_BUCKET_NAME,
            Key=r2_key
        )
    except ClientError as e:
        logger.error(f"Failed to delete file {r2_key} from Tigris: {e}")
        raise e

def get_file_content(r2_key: str) -> bytes | None:
    """
    Fetches raw bytes for a file stored in Tigris/S3.
    Returns None if client is mock or file not found.
    """
    client = get_r2_client()

    if isinstance(client, MagicMock):
        return None

    try:
        obj = client.get_object(
            Bucket=settings.S3_BUCKET_NAME,
            Key=r2_key
        )
        return obj['Body'].read()
    except Exception as e:
        logger.error(f"Failed to get file {r2_key} from Tigris: {e}")
        return None


