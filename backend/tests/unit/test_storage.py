import pytest
from unittest.mock import patch, MagicMock
from app.storage.r2_client import get_r2_client

def test_get_r2_client_force_mock():
    """Verify that forcing mock returns a MagicMock instance."""
    client = get_r2_client(force_mock=True)
    assert isinstance(client, MagicMock)

def test_get_r2_client_missing_credentials_mock_fallback():
    """Verify that missing credentials fall back to returning a MagicMock client."""
    # Pass empty credentials
    client = get_r2_client(account_id="", access_key_id="", secret_access_key="")
    assert isinstance(client, MagicMock)

@patch("app.storage.r2_client.boto3.client")
def test_get_r2_client_correct_mappings(mock_boto_client):
    """Verify that get_r2_client properly constructs a boto3 S3 client with the correct endpoint and config."""
    mock_client_instance = MagicMock()
    mock_boto_client.return_value = mock_client_instance

    account_id = "my-r2-account-id"
    access_key_id = "my-access-key-id"
    secret_access_key = "my-secret-access-key"

    client = get_r2_client(
        account_id=account_id,
        access_key_id=access_key_id,
        secret_access_key=secret_access_key
    )

    # Verify return value is the initialized boto3 client
    assert client == mock_client_instance

    # Verify boto3.client was called with s3 and correct configurations
    mock_boto_client.assert_called_once()
    args, kwargs = mock_boto_client.call_args
    
    assert args[0] == "s3"
    assert kwargs["endpoint_url"] == f"https://{account_id}.r2.cloudflarestorage.com"
    assert kwargs["aws_access_key_id"] == access_key_id
    assert kwargs["aws_secret_access_key"] == secret_access_key
    
    # Verify s3v4 signature configuration
    config = kwargs["config"]
    assert config.signature_version == "s3v4"
