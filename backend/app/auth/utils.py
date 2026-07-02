import re
import bcrypt

def hash_password(password: str) -> str:
    """
    Generate a bcrypt hash of a plain text password.
    """
    # bcrypt requires bytes
    pwd_bytes = password.encode('utf-8')
    # Generate salt and hash
    salt = bcrypt.gensalt(rounds=12)
    hashed = bcrypt.hashpw(pwd_bytes, salt)
    # Return as string
    return hashed.decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify a plain text password against a bcrypt hashed password.
    """
    try:
        pwd_bytes = plain_password.encode('utf-8')
        hashed_bytes = hashed_password.encode('utf-8')
        return bcrypt.checkpw(pwd_bytes, hashed_bytes)
    except Exception:
        return False

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
