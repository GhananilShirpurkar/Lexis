from datetime import datetime, timedelta, timezone
from typing import Any
from jose import JWTError, jwt
import bcrypt
from app.config import settings

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify a plain text password against its bcrypt hashed version.
    """
    try:
        pwd_bytes = plain_password.encode('utf-8')
        hashed_bytes = hashed_password.encode('utf-8')
        return bcrypt.checkpw(pwd_bytes, hashed_bytes)
    except Exception:
        return False

def get_password_hash(password: str) -> str:
    """
    Generate a bcrypt hash from a plain text password.
    """
    pwd_bytes = password.encode('utf-8')
    salt = bcrypt.gensalt(rounds=12)
    hashed = bcrypt.hashpw(pwd_bytes, salt)
    return hashed.decode('utf-8')

def create_access_token(data: dict[str, Any], expires_delta: timedelta | None = None) -> str:
    """
    Generate a JWT token for the user.
    """
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(
        to_encode, 
        settings.JWT_SECRET, 
        algorithm=settings.JWT_ALGORITHM
    )
    return encoded_jwt

def decode_access_token(token: str) -> dict[str, Any] | None:
    """
    Decode and verify a JWT access token.
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
