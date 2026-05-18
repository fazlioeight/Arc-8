"""Admin/configuration service for Member360.

Templates, risk rules, task queues, outreach channels, and care-option
policies are all per-tenant config — they live in the tenant DB next to
the data they govern. Audit events come from the control plane.
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.member360 import (
    Member360CareJourneyTemplate,
    Member360CareOptionPolicy,
    Member360OutreachChannel,
    Member360RiskRule,
    Member360TaskQueue,
)
from ..models.tables import TenantAuditEvent


# ---- Templates ----------------------------------------------------------


def serialize_template(t: Member360CareJourneyTemplate) -> dict:
    return {
        "id": t.id,
        "name": t.name,
        "description": t.description,
        "category": t.category,
        "recommended_for_risk_tier": t.recommended_for_risk_tier,
        "default_stages": t.default_stages or [],
        "default_tasks": t.default_tasks or [],
    }


async def create_template(session: AsyncSession, payload: dict) -> Member360CareJourneyTemplate:
    obj = Member360CareJourneyTemplate(**payload)
    session.add(obj)
    await session.flush()
    return obj


async def update_template(
    session: AsyncSession, template_id: int, payload: dict
) -> Optional[Member360CareJourneyTemplate]:
    obj = await session.get(Member360CareJourneyTemplate, template_id)
    if not obj:
        return None
    for key, value in payload.items():
        if value is not None:
            setattr(obj, key, value)
    await session.flush()
    return obj


async def delete_template(session: AsyncSession, template_id: int) -> bool:
    obj = await session.get(Member360CareJourneyTemplate, template_id)
    if not obj:
        return False
    await session.delete(obj)
    return True


# ---- Generic CRUD helpers ----------------------------------------------


async def _list(session: AsyncSession, model) -> list:
    rows = await session.execute(select(model).order_by(model.id.asc()))
    return list(rows.scalars().all())


async def _create(session: AsyncSession, model, payload: dict):
    obj = model(**payload)
    session.add(obj)
    await session.flush()
    return obj


async def _update(session: AsyncSession, model, item_id: int, payload: dict):
    obj = await session.get(model, item_id)
    if not obj:
        return None
    for key, value in payload.items():
        if value is not None:
            setattr(obj, key, value)
    await session.flush()
    return obj


async def _delete(session: AsyncSession, model, item_id: int) -> bool:
    obj = await session.get(model, item_id)
    if not obj:
        return False
    await session.delete(obj)
    return True


# ---- Risk rules / queues / channels / policies --------------------------


async def list_risk_rules(session: AsyncSession):
    return await _list(session, Member360RiskRule)


async def create_risk_rule(session: AsyncSession, payload: dict):
    return await _create(session, Member360RiskRule, payload)


async def update_risk_rule(session: AsyncSession, item_id: int, payload: dict):
    return await _update(session, Member360RiskRule, item_id, payload)


async def delete_risk_rule(session: AsyncSession, item_id: int) -> bool:
    return await _delete(session, Member360RiskRule, item_id)


async def list_task_queues(session: AsyncSession):
    return await _list(session, Member360TaskQueue)


async def create_task_queue(session: AsyncSession, payload: dict):
    return await _create(session, Member360TaskQueue, payload)


async def update_task_queue(session: AsyncSession, item_id: int, payload: dict):
    return await _update(session, Member360TaskQueue, item_id, payload)


async def delete_task_queue(session: AsyncSession, item_id: int) -> bool:
    return await _delete(session, Member360TaskQueue, item_id)


async def list_outreach_channels(session: AsyncSession):
    return await _list(session, Member360OutreachChannel)


async def create_outreach_channel(session: AsyncSession, payload: dict):
    return await _create(session, Member360OutreachChannel, payload)


async def update_outreach_channel(session: AsyncSession, item_id: int, payload: dict):
    return await _update(session, Member360OutreachChannel, item_id, payload)


async def delete_outreach_channel(session: AsyncSession, item_id: int) -> bool:
    return await _delete(session, Member360OutreachChannel, item_id)


async def list_care_option_policies(session: AsyncSession):
    return await _list(session, Member360CareOptionPolicy)


async def create_care_option_policy(session: AsyncSession, payload: dict):
    return await _create(session, Member360CareOptionPolicy, payload)


async def update_care_option_policy(session: AsyncSession, item_id: int, payload: dict):
    return await _update(session, Member360CareOptionPolicy, item_id, payload)


async def delete_care_option_policy(session: AsyncSession, item_id: int) -> bool:
    return await _delete(session, Member360CareOptionPolicy, item_id)


# ---- Audit events (control plane) ---------------------------------------


async def list_audit_events(
    session: AsyncSession,
    *,
    tenant_id: int,
    event_type_prefix: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
) -> tuple[list[TenantAuditEvent], int]:
    stmt = select(TenantAuditEvent).where(TenantAuditEvent.tenant_id == tenant_id)
    if event_type_prefix:
        stmt = stmt.where(TenantAuditEvent.event_type.startswith(event_type_prefix))
    total = await session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    stmt = stmt.order_by(TenantAuditEvent.created_at.desc()).limit(limit).offset(offset)
    rows = (await session.execute(stmt)).scalars().all()
    return list(rows), int(total)


async def list_audit_events_for_member(
    session: AsyncSession,
    *,
    tenant_id: int,
    member_id: int,
    event_type_prefix: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[TenantAuditEvent], int]:
    """Audit events whose JSON ``payload.member_id`` equals ``member_id``.

    ``member_id`` lives inside the JSON ``payload`` rather than as its own
    column because the audit table is shared across modules. We use the
    portable ``as_integer()`` JSON accessor so the comparison happens with
    numeric semantics — ``as_string()`` returns a JSON-encoded value on
    PostgreSQL (with literal quotes for strings) which makes string compares
    surprising. Events whose payload has no ``member_id`` or a non-numeric
    one are filtered out cleanly because the projection is NULL.
    """
    payload_member = TenantAuditEvent.payload["member_id"].as_integer()
    stmt = select(TenantAuditEvent).where(
        TenantAuditEvent.tenant_id == tenant_id,
        payload_member == member_id,
    )
    if event_type_prefix:
        stmt = stmt.where(TenantAuditEvent.event_type.startswith(event_type_prefix))
    total = await session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    stmt = stmt.order_by(TenantAuditEvent.created_at.desc()).limit(limit).offset(offset)
    rows = (await session.execute(stmt)).scalars().all()
    return list(rows), int(total)


def serialize_audit(event: TenantAuditEvent) -> dict:
    return {
        "id": event.id,
        "actor": event.actor,
        "event_type": event.event_type,
        "payload": event.payload or {},
        "created_at": event.created_at,
    }
