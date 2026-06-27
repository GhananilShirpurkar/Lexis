from datetime import datetime, timedelta, timezone
from typing import Any
from jose import JWTError, jwt
from app.config import settings

def create_access_token(user_id: Any, email: str, expires_delta: timedelta | None = None) -> str:
    """
    Generate an access token for a user.
    Defaults to 24 hours expiration.
    """
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        # Default to 24 hours expiration as specified in specifications
        expire = datetime.now(timezone.utc) + timedelta(hours=24)
        
    to_encode = {
        "sub": str(user_id),
        "email": email,
        "exp": expire
    }
    
    encoded_jwt = jwt.encode(
        to_encode, 
        settings.JWT_SECRET, 
        algorithm=settings.JWT_ALGORITHM
    )
    return encoded_jwt

def decode_token(token: str) -> dict[str, Any] | None:
    """
    Decode and verify JWT signature and expiration.
    Returns the decoded payload if valid, otherwise None.
    """
    try:
        payload = jwt.decode(
            token, 
            settings.JWT_SECRET, 
            algorithms=[settings.JWT_ALGORITHM]
        )
        return payload
    except JWTError:
        return None
