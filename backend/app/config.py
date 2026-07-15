from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/lexis"
    
    # JWT Auth Configuration (Task 1.7.1 placeholders)
    JWT_SECRET: str = "development_secret_key_to_be_replaced_in_production_environments"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    # S3 Storage (Tigris) Configuration
    S3_BUCKET_NAME: str = "lexis"
    ENDPOINT_URL_S3: str = "https://fly.storage.tigris.dev"
    TIGRIS_ACCESS_KEY_ID: str = ""
    TIGRIS_SECRET_KEY: str = ""
    FORCE_MOCK_S3: bool = False
    FORCE_MOCK_LLM: bool = False
    
    # LLM API configuration options
    GEMINI_API_KEY: str = ""
    GROQ_API_KEY: str = ""

    # Rate Limiting configuration options
    RATE_LIMIT_LOGIN_IP_LIMIT: int = 20
    RATE_LIMIT_LOGIN_IP_WINDOW: int = 3600
    RATE_LIMIT_LOGIN_EMAIL_LIMIT: int = 5
    RATE_LIMIT_LOGIN_EMAIL_WINDOW: int = 900

    # Local index storage path configuration
    STORAGE_INDICES_DIR: str = "storage/indices"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
