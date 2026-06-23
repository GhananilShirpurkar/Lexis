from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/lexis"
    
    # JWT Auth Configuration (Task 1.7.1 placeholders)
    JWT_SECRET: str = "development_secret_key_to_be_replaced_in_production_environments"
    JWT_ALGORITHM: str = "HS256"
    
    # Cloudflare R2 configurations
    R2_BUCKET_NAME: str = "lexis-storage"
    R2_ACCOUNT_ID: str = ""
    R2_ACCESS_KEY_ID: str = ""
    R2_SECRET_ACCESS_KEY: str = ""
    
    # LLM API configuration options
    GEMINI_API_KEY: str = ""
    GROQ_API_KEY: str = ""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
