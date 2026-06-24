import re
from passlib.context import CryptContext

# Set up password context with bcrypt scheme
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str) -> str:
    """
    Generate a bcrypt hash of a plain text password.
    """
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify a plain text password against a bcrypt hashed password.
    """
    return pwd_context.verify(plain_password, hashed_password)

def validate_email_format(email: str) -> bool:
    """
    Validates an email address format.
    Checks:
    - Maximum length of 254 characters.
    - Standard regex matching local-part and domain.
    - Valid TLD presence (minimum 2 characters).
    """
    if not email or len(email) > 254:
        return False
    
    # Standard RFC-compliant email regex
    email_regex = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
    if not re.match(email_regex, email):
        return False
    
    # Further check TLD length
    parts = email.split("@")
    if len(parts) != 2:
        return False
    
    domain_parts = parts[1].split(".")
    if len(domain_parts) < 2:
        return False
    
    tld = domain_parts[-1]
    if len(tld) < 2:
        return False
        
    return True
