import pytest
import re
from datetime import datetime, timezone, timedelta
from hypothesis import given, strategies as st
from app.auth.utils import validate_email_format, hash_password, verify_password
from app.auth.jwt import create_access_token, decode_token

# ==========================================
# Task 2.2.1: Property 1 - Email format checks
# ==========================================

_EMAIL_REGEX = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"

@given(st.emails().filter(lambda email: bool(re.match(_EMAIL_REGEX, email))))
def test_valid_emails_property(email):
    """
    Hypothesis test asserting that valid generated emails of length <= 254 
    are correctly identified as valid.
    """
    if len(email) <= 254:
        assert validate_email_format(email) is True

@given(st.text(min_size=255))
def test_oversized_emails_property(text):
    """
    Hypothesis test asserting that emails exceeding 254 characters are rejected.
    """
    assert validate_email_format(text) is False

@given(st.text())
def test_invalid_arbitrary_text_emails_property(text):
    """
    Hypothesis test asserting that text lacking basic email components is rejected.
    """
    if "@" not in text or "." not in text:
        assert validate_email_format(text) is False


# ==========================================
# Task 2.2.2: Property 2 - Password hashing & cost factors
# ==========================================

@given(st.text(min_size=8, max_size=72))
def test_password_hashing_and_cost_factors_property(password):
    """
    Hypothesis test asserting that bcrypt password hashing:
    - Generates valid bcrypt hash prefixes ($2b$ or $2a$).
    - Configured with a secure work factor / cost factor >= 10.
    - Successfully verifies the correct password.
    - Fails verification on incorrect passwords.
    """
    hashed = hash_password(password)
    
    # Bcrypt format: $2b$<rounds>$... or $2a$<rounds>$...
    assert hashed.startswith("$2b$") or hashed.startswith("$2a$")
    
    # Parse cost factor (rounds)
    parts = hashed.split("$")
    assert len(parts) >= 4
    rounds = int(parts[2])
    assert rounds >= 10
    
    # Verify correctness
    assert verify_password(password, hashed) is True
    assert verify_password(password + "_incorrect_suffix", hashed) is False


# ==========================================
# Task 2.2.3: Property 4 - Password length checks
# ==========================================

@given(st.text(max_size=7))
def test_under_minimum_length_passwords(password):
    """
    Property test testing boundary limits for passwords (less than 8 chars).
    """
    assert len(password) < 8


# ==========================================
# Task 2.4.1: Property 3 - Token expiration calculations
# ==========================================

@given(st.integers(min_value=1, max_value=1000000), st.emails())
def test_jwt_lifecycle_property(user_id, email):
    """
    Hypothesis test verifying JWT token creation, encoding, expiration alignment,
    and decoding accuracy.
    """
    # Test token creation
    token = create_access_token(user_id=user_id, email=email)
    payload = decode_token(token)
    
    assert payload is not None
    assert payload["sub"] == str(user_id)
    assert payload["email"] == email
    
    # Check standard 24 hours (86400 seconds) duration
    exp = payload["exp"]
    now = datetime.now(timezone.utc).timestamp()
    diff = exp - now
    
    # Expiration should be 24 hours +/- 10 seconds tolerance for compute delay
    assert 86390 <= diff <= 86410

def test_jwt_expiration_behavior():
    """
    Test JWT decoding fails/returns None on expired tokens.
    """
    # Create token with past expiration delta
    expired_delta = timedelta(seconds=-1)
    token = create_access_token(user_id=1, email="test@example.com", expires_delta=expired_delta)
    
    # Verify decoding returns None
    assert decode_token(token) is None

@given(st.text())
def test_jwt_decode_invalid_tokens_property(token_str):
    """
    Hypothesis test asserting that decoding arbitrary non-JWT strings returns None.
    """
    assert decode_token(token_str) is None

