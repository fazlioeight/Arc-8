from pydantic import AnyHttpUrl
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List, Optional


class Settings(BaseSettings):
    # Security
    SECRET_KEY: str = "CHANGE_ME_SUPER_SECRET_KEY"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRES_MINUTES: int = 60

    # CORS
    CORS_ORIGINS: List[AnyHttpUrl] = ["http://localhost:3000"]

    # Database
    DATABASE_URL: Optional[str] = None  # e.g., postgresql://user:pass@host:port/db

    # Billing (future)
    STRIPE_SECRET_KEY: Optional[str] = None
    STRIPE_WEBHOOK_SECRET: Optional[str] = None

    # Usage limits
    USAGE_DAILY_LIMIT: int = 10000

    model_config = SettingsConfigDict(
        case_sensitive=True,
        env_file=".env",
    )


settings = Settings()
