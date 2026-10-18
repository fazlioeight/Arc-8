"""Create all ControlBase tables in the control database.

Used for fresh prod deploys where the Alembic migration chain has bugs
that only manifest in the separated control/tenant database topology
(SQLite single-DB dev never exercises them). Idempotent: `create_all`
issues `CREATE TABLE IF NOT EXISTS` per table.

Expects CONTROL_DATABASE_URL in the env (asyncpg-format DSN).
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.ext.asyncio import create_async_engine

from app.models import load_all_models  # noqa: E402
from app.models.tables import ControlBase  # noqa: E402


async def main() -> None:
    load_all_models()
    dsn = os.environ.get("CONTROL_DATABASE_URL")
    if not dsn:
        raise SystemExit("CONTROL_DATABASE_URL is required")

    engine = create_async_engine(dsn, future=True, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(ControlBase.metadata.create_all)
    await engine.dispose()

    print("Control schema applied (ControlBase.metadata.create_all).", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
