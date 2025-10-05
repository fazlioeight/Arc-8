from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from ..models.tables import TenantAuditEvent

_audit_logger = logging.getLogger("audit")


async def record_audit_event(
    session: AsyncSession,
    tenant_id: int,
    actor: str,
    event_type: str,
    payload: Optional[Dict[str, Any]] = None,
) -> None:
    event = TenantAuditEvent(
        tenant_id=tenant_id,
        actor=actor,
        event_type=event_type,
        payload=payload or {},
        created_at=datetime.now(timezone.utc),
    )
    session.add(event)
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(
        None,
        _audit_logger.info,
        json.dumps(
            {
                "tenant_id": tenant_id,
                "actor": actor,
                "event_type": event_type,
                "payload": payload or {},
            }
        ),
    )
