import pytest
import time
from unittest.mock import patch, MagicMock
from fastapi import Request
from app.auth.rate_limiter import InMemoryRateLimitStorage, get_client_ip

def test_sliding_window_rate_limiting():
    storage = InMemoryRateLimitStorage()
    key = "email:test@example.com"
    limit = 3
    window = 10

    with patch("time.time") as mock_time:
        # Start at timestamp 100.0
        mock_time.return_value = 100.0
        
        # 1st attempt
        allowed, retry = storage.check_and_add(key, limit, window)
        assert allowed is True
        assert retry == 0

        # 2nd attempt at 102.0
        mock_time.return_value = 102.0
        allowed, retry = storage.check_and_add(key, limit, window)
        assert allowed is True
        assert retry == 0

        # 3rd attempt at 104.0
        mock_time.return_value = 104.0
        allowed, retry = storage.check_and_add(key, limit, window)
        assert allowed is True
        assert retry == 0

        # 4th attempt at 105.0 exceeds the limit of 3
        mock_time.return_value = 105.0
        allowed, retry = storage.check_and_add(key, limit, window)
        assert allowed is False
        # Oldest attempt (at 100.0) expires at 110.0. 
        # Time remaining: 110.0 - 105.0 = 5 seconds.
        assert retry == 5

        # 5th attempt at 106.0 still blocked
        mock_time.return_value = 106.0
        allowed, retry = storage.check_and_add(key, limit, window)
        assert allowed is False
        assert retry == 4

        # Fast forward time to 110.5 (past 1st attempt expiration)
        mock_time.return_value = 110.5
        allowed, retry = storage.check_and_add(key, limit, window)
        assert allowed is True
        assert retry == 0

def test_get_client_ip_headers():
    # Test X-Forwarded-For
    req_forwarded = MagicMock(spec=Request)
    req_forwarded.headers = {"X-Forwarded-For": "203.0.113.195, 70.41.3.18, 150.172.238.178"}
    assert get_client_ip(req_forwarded) == "203.0.113.195"

    # Test X-Real-IP
    req_real = MagicMock(spec=Request)
    req_real.headers = {"X-Real-IP": "198.51.100.1"}
    assert get_client_ip(req_real) == "198.51.100.1"

    # Test Fallback request client host
    req_client = MagicMock(spec=Request)
    req_client.headers = {}
    req_client.client = MagicMock()
    req_client.client.host = "192.0.2.1"
    assert get_client_ip(req_client) == "192.0.2.1"
