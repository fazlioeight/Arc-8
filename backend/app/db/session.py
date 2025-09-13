from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from ..core.config import settings


def _make_url() -> str:
    # Default to local SQLite for dev if DATABASE_URL not set
    return settings.DATABASE_URL or "sqlite:///./nexora.db"


engine = create_engine(
    _make_url(),
    connect_args={"check_same_thread": False} if _make_url().startswith("sqlite") else {},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

