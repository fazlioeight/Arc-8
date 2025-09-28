from __future__ import annotations

import json
import logging
from typing import Any

from sqlalchemy import text
from sqlalchemy.exc import OperationalError

from ..db.session import control_session

logger = logging.getLogger(__name__)


async def ensure_control_bootstrap() -> None:
    """Ensure control-plane schema/data required for auth exists."""
    try:
        async with control_session() as session:
            info_result = await session.execute(text("PRAGMA table_info(users)"))
            columns = [row._mapping.get("name") for row in info_result]
            if "app_permissions" not in columns:
                logger.info("Adding app_permissions column to users table for control plane")
                await session.execute(text("ALTER TABLE users ADD COLUMN app_permissions TEXT DEFAULT '{}'"))
                await session.execute(text("UPDATE users SET app_permissions = '{}' WHERE app_permissions IS NULL"))
                await session.commit()
            else:
                await session.execute(text("UPDATE users SET app_permissions = '{}' WHERE app_permissions IS NULL"))
                await session.commit()

            users_result = await session.execute(
                text("SELECT id, role, app_permissions FROM users")
            )
            updates: list[dict[str, Any]] = []
            for row in users_result:
                mapping = row._mapping
                role = (mapping.get("role") or "user").lower()
                raw = mapping.get("app_permissions")
                if isinstance(raw, dict):
                    data = dict(raw)
                else:
                    try:
                        data = json.loads(raw) if raw else {}
                    except (json.JSONDecodeError, TypeError):
                        data = {}

                changed = False
                if "portal" not in data:
                    data["portal"] = "admin" if role == "admin" else "user"
                    changed = True
                if role == "admin" and data.get("admin_console") != "admin":
                    data["admin_console"] = "admin"
                    changed = True

                if changed:
                    updates.append({
                        "id": mapping.get("id"),
                        "apps": json.dumps(data),
                    })

            for update in updates:
                await session.execute(
                    text("UPDATE users SET app_permissions = :apps WHERE id = :id"),
                    update,
                )
            if updates:
                await session.commit()
                logger.info("Updated app permissions for %s users", len(updates))
    except OperationalError as exc:
        logger.warning("Control plane bootstrap skipped due to database error: %s", exc)
