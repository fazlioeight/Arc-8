"""Admin routes for the Member360 module.

Mounted at ``/api/member360/admin``. All routes require platform_admin or
tenant admin; we enforce via ``require_admin`` to match the rest of the
admin surface.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.session import get_control_session
from ..db.tenant_manager import TenantContext
from ..dependencies.tenant import get_tenant_context, get_tenant_session
from ..schemas.member360 import CareJourneyTemplate
from ..schemas.member360_admin import (
    AuditEventListResponse,
    CareJourneyTemplateCreate,
    CareJourneyTemplateUpdate,
    CareOptionPolicy,
    CareOptionPolicyCreate,
    CareOptionPolicyUpdate,
    OutreachChannel,
    OutreachChannelCreate,
    OutreachChannelUpdate,
    RiskRule,
    RiskRuleCreate,
    RiskRuleUpdate,
    TaskQueue,
    TaskQueueCreate,
    TaskQueueUpdate,
)
from ..services import member360_admin as admin_service
from ..services import member360 as member360_service
from ..utils.audit_logger import record_audit_event
from ..utils.rbac import Role, require_role
from ..utils.security import AuthenticatedUser, require_admin

router = APIRouter(prefix="/api/member360/admin", tags=["member360-admin"])


# ---- Templates ----------------------------------------------------------


@router.get("/templates", response_model=list[CareJourneyTemplate])
async def list_templates(
    session: AsyncSession = Depends(get_tenant_session),
    current_user: AuthenticatedUser = Depends(require_admin),
):
    return await member360_service.list_care_journey_templates(session)


@router.post("/templates", response_model=CareJourneyTemplate, status_code=status.HTTP_201_CREATED)
async def create_template(
    payload: CareJourneyTemplateCreate,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(require_admin),
):
    obj = await admin_service.create_template(session, payload.model_dump())
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="member360.admin.template.create",
        payload={"template_id": obj.id, "name": obj.name},
    )
    await session.commit()
    await control_session.commit()
    return admin_service.serialize_template(obj)


@router.patch("/templates/{template_id}", response_model=CareJourneyTemplate)
async def update_template(
    template_id: int,
    payload: CareJourneyTemplateUpdate,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(require_admin),
):
    obj = await admin_service.update_template(session, template_id, payload.model_dump(exclude_none=True))
    if not obj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="member360.admin.template.update",
        payload={"template_id": template_id},
    )
    await session.commit()
    await control_session.commit()
    return admin_service.serialize_template(obj)


@router.delete("/templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(
    template_id: int,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(require_admin),
) -> None:
    ok = await admin_service.delete_template(session, template_id)
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="member360.admin.template.delete",
        payload={"template_id": template_id},
    )
    await session.commit()
    await control_session.commit()
    return None


# ---- Risk rules ---------------------------------------------------------


@router.get("/risk-rules", response_model=list[RiskRule])
async def list_risk_rules(
    session: AsyncSession = Depends(get_tenant_session),
    current_user: AuthenticatedUser = Depends(require_admin),
):
    return await admin_service.list_risk_rules(session)


@router.post("/risk-rules", response_model=RiskRule, status_code=status.HTTP_201_CREATED)
async def create_risk_rule(
    payload: RiskRuleCreate,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(require_admin),
):
    obj = await admin_service.create_risk_rule(session, payload.model_dump())
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="member360.admin.risk_rule.create",
        payload={"rule_id": obj.id, "domain": obj.domain, "name": obj.name},
    )
    await session.commit()
    await control_session.commit()
    return obj


@router.patch("/risk-rules/{rule_id}", response_model=RiskRule)
async def update_risk_rule(
    rule_id: int,
    payload: RiskRuleUpdate,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(require_admin),
):
    obj = await admin_service.update_risk_rule(session, rule_id, payload.model_dump(exclude_none=True))
    if not obj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Risk rule not found")
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="member360.admin.risk_rule.update",
        payload={"rule_id": rule_id},
    )
    await session.commit()
    await control_session.commit()
    return obj


@router.delete("/risk-rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_risk_rule(
    rule_id: int,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(require_admin),
) -> None:
    ok = await admin_service.delete_risk_rule(session, rule_id)
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Risk rule not found")
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="member360.admin.risk_rule.delete",
        payload={"rule_id": rule_id},
    )
    await session.commit()
    await control_session.commit()
    return None


# ---- Task queues --------------------------------------------------------


@router.get("/task-queues", response_model=list[TaskQueue])
async def list_task_queues(
    session: AsyncSession = Depends(get_tenant_session),
    current_user: AuthenticatedUser = Depends(require_admin),
):
    return await admin_service.list_task_queues(session)


@router.post("/task-queues", response_model=TaskQueue, status_code=status.HTTP_201_CREATED)
async def create_task_queue(
    payload: TaskQueueCreate,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(require_admin),
):
    obj = await admin_service.create_task_queue(session, payload.model_dump())
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="member360.admin.task_queue.create",
        payload={"queue_id": obj.id, "name": obj.name},
    )
    await session.commit()
    await control_session.commit()
    return obj


@router.patch("/task-queues/{queue_id}", response_model=TaskQueue)
async def update_task_queue(
    queue_id: int,
    payload: TaskQueueUpdate,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(require_admin),
):
    obj = await admin_service.update_task_queue(session, queue_id, payload.model_dump(exclude_none=True))
    if not obj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task queue not found")
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="member360.admin.task_queue.update",
        payload={"queue_id": queue_id},
    )
    await session.commit()
    await control_session.commit()
    return obj


@router.delete("/task-queues/{queue_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task_queue(
    queue_id: int,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(require_admin),
) -> None:
    ok = await admin_service.delete_task_queue(session, queue_id)
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task queue not found")
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="member360.admin.task_queue.delete",
        payload={"queue_id": queue_id},
    )
    await session.commit()
    await control_session.commit()
    return None


# ---- Outreach channels --------------------------------------------------


@router.get("/outreach-channels", response_model=list[OutreachChannel])
async def list_outreach_channels(
    session: AsyncSession = Depends(get_tenant_session),
    current_user: AuthenticatedUser = Depends(require_admin),
):
    return await admin_service.list_outreach_channels(session)


@router.post("/outreach-channels", response_model=OutreachChannel, status_code=status.HTTP_201_CREATED)
async def create_outreach_channel(
    payload: OutreachChannelCreate,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(require_admin),
):
    obj = await admin_service.create_outreach_channel(session, payload.model_dump())
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="member360.admin.channel.create",
        payload={"channel_id": obj.id, "channel_type": obj.channel_type},
    )
    await session.commit()
    await control_session.commit()
    return obj


@router.patch("/outreach-channels/{channel_id}", response_model=OutreachChannel)
async def update_outreach_channel(
    channel_id: int,
    payload: OutreachChannelUpdate,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(require_admin),
):
    obj = await admin_service.update_outreach_channel(session, channel_id, payload.model_dump(exclude_none=True))
    if not obj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Outreach channel not found")
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="member360.admin.channel.update",
        payload={"channel_id": channel_id},
    )
    await session.commit()
    await control_session.commit()
    return obj


@router.delete("/outreach-channels/{channel_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_outreach_channel(
    channel_id: int,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(require_admin),
) -> None:
    ok = await admin_service.delete_outreach_channel(session, channel_id)
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Outreach channel not found")
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="member360.admin.channel.delete",
        payload={"channel_id": channel_id},
    )
    await session.commit()
    await control_session.commit()
    return None


# ---- Care option policies ----------------------------------------------


@router.get("/care-option-policies", response_model=list[CareOptionPolicy])
async def list_care_option_policies(
    session: AsyncSession = Depends(get_tenant_session),
    current_user: AuthenticatedUser = Depends(require_admin),
):
    return await admin_service.list_care_option_policies(session)


@router.post(
    "/care-option-policies",
    response_model=CareOptionPolicy,
    status_code=status.HTTP_201_CREATED,
)
async def create_care_option_policy(
    payload: CareOptionPolicyCreate,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(require_admin),
):
    obj = await admin_service.create_care_option_policy(session, payload.model_dump())
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="member360.admin.policy.create",
        payload={"policy_id": obj.id, "service_type": obj.service_type},
    )
    await session.commit()
    await control_session.commit()
    return obj


@router.patch("/care-option-policies/{policy_id}", response_model=CareOptionPolicy)
async def update_care_option_policy(
    policy_id: int,
    payload: CareOptionPolicyUpdate,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(require_admin),
):
    obj = await admin_service.update_care_option_policy(
        session, policy_id, payload.model_dump(exclude_none=True)
    )
    if not obj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Policy not found")
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="member360.admin.policy.update",
        payload={"policy_id": policy_id},
    )
    await session.commit()
    await control_session.commit()
    return obj


@router.delete("/care-option-policies/{policy_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_care_option_policy(
    policy_id: int,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(require_admin),
) -> None:
    ok = await admin_service.delete_care_option_policy(session, policy_id)
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Policy not found")
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="member360.admin.policy.delete",
        payload={"policy_id": policy_id},
    )
    await session.commit()
    await control_session.commit()
    return None


# ---- Audit events -------------------------------------------------------


@router.get("/audit", response_model=AuditEventListResponse)
async def list_audit_events(
    event_type_prefix: Optional[str] = Query(default="member360."),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(
        require_role(
            Role.COMPLIANCE_AUDITOR,
            Role.SUPERVISOR,
            Role.BUSINESS_ADMIN,
            Role.ADMIN,
            Role.PLATFORM_ADMIN,
        )
    ),
):
    rows, total = await admin_service.list_audit_events(
        session,
        tenant_id=tenant.id,
        event_type_prefix=event_type_prefix or None,
        limit=limit,
        offset=offset,
    )
    return {"items": [admin_service.serialize_audit(r) for r in rows], "total": total}
