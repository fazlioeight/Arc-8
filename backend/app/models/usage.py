from sqlalchemy import Column, Integer, String, Date, UniqueConstraint
from sqlalchemy.orm import declarative_base, Session

BaseUsage = declarative_base()


class UsageCounter(BaseUsage):
    __tablename__ = "usage_counters"
    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, nullable=False, index=True)
    date = Column(Date, nullable=False)
    key = Column(String(64), nullable=False)
    count = Column(Integer, nullable=False, default=0)
    __table_args__ = (UniqueConstraint("tenant_id", "date", "key", name="uq_usage_day_key"),)


def ensure_tables(db: Session) -> None:
    # Ensure usage table exists (for SQLite dev without migrations)
    engine = db.get_bind()
    BaseUsage.metadata.create_all(bind=engine)

