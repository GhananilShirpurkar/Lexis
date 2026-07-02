from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.db.session import get_db
from app.models.user import User
from app.schemas.user import UserCreate, UserResponse, Token
from app.auth.utils import hash_password, verify_password, validate_email_format
from app.auth.jwt import create_access_token
from app.auth.rate_limiter import check_login_rate_limit, limiter_storage

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.post(
    "/register",
    response_model=Token,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user",
    description="Registers a new user using email and password, returning a signed JWT access token."
)
async def register(user_in: UserCreate, db: AsyncSession = Depends(get_db)):
    # 1. Validate email format using custom validator
    if not validate_email_format(user_in.email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": {
                    "code": "INVALID_EMAIL",
                    "message": "The email format is invalid."
                }
            }
        )
        
    # 2. Check if password is too short (schema checks min_length=8, but let's double check)
    if len(user_in.password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": {
                    "code": "INVALID_PASSWORD",
                    "message": "Password must be at least 8 characters long."
                }
            }
        )
        
    # 3. Check duplicate user
    query = select(User).where(User.email == user_in.email)
    result = await db.execute(query)
    existing_user = result.scalars().first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": {
                    "code": "EMAIL_DUPLICATE",
                    "message": "An account with this email address already exists."
                }
            }
        )
        
    # 4. Hash password and insert
    hashed_pwd = hash_password(user_in.password)
    new_user = User(
        email=user_in.email,
        hashed_password=hashed_pwd
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    
    # 5. Generate signed access token
    access_token = create_access_token(user_id=new_user.id, email=new_user.email)
    return Token(
        access_token=access_token,
        token_type="bearer"
    )

@router.post(
    "/login",
    response_model=Token,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(check_login_rate_limit)],
    summary="User login",
    description="Authenticates a user via email and password, returning a signed JWT access token on success."
)
async def login(user_in: UserCreate, db: AsyncSession = Depends(get_db)):
    # 1. Query user
    query = select(User).where(User.email == user_in.email)
    result = await db.execute(query)
    user = result.scalars().first()
    
    # 2. Validate user existence and password validity
    if not user or not verify_password(user_in.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "error": {
                    "code": "INVALID_CREDENTIALS",
                    "message": "Incorrect email or password."
                }
            }
        )
        
    # 3. Successful login - clear email-based rate limit
    limiter_storage.clear(f"email:{user.email}")
        
    # 4. Generate signed access token
    access_token = create_access_token(user_id=user.id, email=user.email)
    return Token(
        access_token=access_token,
        token_type="bearer"
    )

@router.get(
    "/me",
    response_model=UserResponse,
    status_code=status.HTTP_200_OK,
    summary="Get current user details",
    description="Returns the authenticated user details using the JWT context attached by JWTMiddleware."
)
async def get_me(request: Request, db: AsyncSession = Depends(get_db)):
    query = select(User).where(User.id == request.state.user_id)
    result = await db.execute(query)
    user = result.scalars().first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": {
                    "code": "USER_NOT_FOUND",
                    "message": "User not found."
                }
            }
        )
    return user
