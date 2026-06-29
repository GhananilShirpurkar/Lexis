import boto3
from botocore.config import Config
from app.config import settings
from unittest.mock import MagicMock

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
