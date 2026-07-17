import gzip
import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_gzip_compression_above_threshold():
    """
    Responses > 1,000 bytes requested with Accept-Encoding: gzip must be compressed in transit.
    """
    response = client.get("/openapi.json", headers={"Accept-Encoding": "gzip"})
    assert response.status_code == 200
    assert response.headers.get("content-encoding") == "gzip"
    
    # Decompress and verify content parses cleanly
    decompressed_bytes = gzip.decompress(response.content)
    assert len(decompressed_bytes) > 1000
    assert b"Lexis API" in decompressed_bytes


def test_gzip_compression_below_threshold():
    """
    Small responses < 1,000 bytes must NOT be compressed to avoid unnecessary CPU overhead.
    """
    response = client.get("/health", headers={"Accept-Encoding": "gzip"})
    assert response.status_code == 200
    assert "content-encoding" not in response.headers
    data = response.json()
    assert data["status"] == "healthy"


def test_no_accept_encoding_header():
    """
    Clients that do not send Accept-Encoding: gzip must receive uncompressed responses.
    """
    response = client.get("/openapi.json")
    assert response.status_code == 200
    assert "content-encoding" not in response.headers
    assert b"Lexis API" in response.content


def test_sse_streaming_bypasses_compression():
    """
    Server-Sent Events requests (Accept: text/event-stream or /messages) must bypass GZip compression
    to prevent buffering latency, even for large payloads.
    """
    response = client.get("/openapi.json", headers={"Accept": "text/event-stream", "Accept-Encoding": "gzip"})
    assert response.status_code == 200
    assert "content-encoding" not in response.headers

