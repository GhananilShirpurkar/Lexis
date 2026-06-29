import pytest
from unittest.mock import patch, MagicMock
from botocore.exceptions import ClientError
from app.storage.r2_client import get_r2_client, upload_file, delete_file

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


@patch("app.storage.r2_client.get_r2_client")
def test_upload_file_mock_mode(mock_get_client):
    """Verify that upload_file works and returns key in mock mode."""
    mock_get_client.return_value = MagicMock()
    key = upload_file(user_id=1, doc_id=42, filename="doc.pdf", data=b"hello")
    assert key == "1/42/doc.pdf"


@patch("app.storage.r2_client.get_r2_client")
def test_upload_file_real_client(mock_get_client):
    """Verify upload_file invokes put_object on the actual client."""
    mock_s3 = MagicMock()
    mock_get_client.return_value = mock_s3
    # Make sure mock_s3 doesn't look like MagicMock class itself in type check
    # by ensuring isinstance(mock_s3, MagicMock) is False, or simply bypassing MagicMock type check
    # Wait, in r2_client.py: `isinstance(client, MagicMock)` checks if it's MagicMock
    # MagicMock instance indeed satisfies isinstance(mock_s3, MagicMock).
    # To mock a real boto3 client, we can make `isinstance(client, MagicMock)` return False.
    # But wait, MagicMock is a subclass of Mock, etc.
    # Let's mock `get_r2_client` to return a custom object that is NOT MagicMock but mocks the S3 client.
    class DummyS3Client:
        def __init__(self):
            self.put_object = MagicMock()
            self.delete_object = MagicMock()
    
    dummy_s3 = DummyS3Client()
    mock_get_client.return_value = dummy_s3

    key = upload_file(user_id=123, doc_id=456, filename="test.txt", data=b"my-data")
    assert key == "123/456/test.txt"
    dummy_s3.put_object.assert_called_once_with(
        Bucket="lexis-storage",
        Key="123/456/test.txt",
        Body=b"my-data",
        ContentType="text/plain"
    )


@patch("app.storage.r2_client.get_r2_client")
def test_delete_file_real_client(mock_get_client):
    """Verify delete_file invokes delete_object on the actual client."""
    class DummyS3Client:
        def __init__(self):
            self.delete_object = MagicMock()
    
    dummy_s3 = DummyS3Client()
    mock_get_client.return_value = dummy_s3

    delete_file("123/456/test.txt")
    dummy_s3.delete_object.assert_called_once_with(
        Bucket="lexis-storage",
        Key="123/456/test.txt"
    )


@patch("app.storage.r2_client.get_r2_client")
def test_upload_file_client_error(mock_get_client):
    """Verify that upload_file raises ClientError if put_object fails."""
    class DummyS3Client:
        def put_object(self, **kwargs):
            raise ClientError({"Error": {"Code": "500", "Message": "Internal Server Error"}}, "PutObject")

    dummy_s3 = DummyS3Client()
    mock_get_client.return_value = dummy_s3

    with pytest.raises(ClientError):
        upload_file(user_id=123, doc_id=456, filename="test.txt", data=b"my-data")


@patch("app.storage.r2_client.get_r2_client")
def test_delete_file_client_error(mock_get_client):
    """Verify that delete_file raises ClientError if delete_object fails."""
    class DummyS3Client:
        def delete_object(self, **kwargs):
            raise ClientError({"Error": {"Code": "500", "Message": "Internal Server Error"}}, "DeleteObject")

    dummy_s3 = DummyS3Client()
    mock_get_client.return_value = dummy_s3

    with pytest.raises(ClientError):
        delete_file("123/456/test.txt")

