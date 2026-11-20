"""FastAPI routes for the 6 Live Client API Connectors (G-08) & 30-Day Redis Hot Cache (FR-DAT-02).

Mounted at ``/api/integrations``:
  * GET  /api/integrations/status                     — Health & 30-Day Redis Hot Cache stats for all 6 APIs
  * POST /api/integrations/qnxt/sync                  — Live QNXT (Eligibility, Claims, Accumulators, MPI)
  * POST /api/integrations/talkdesk/webhook           — Live Talkdesk CTI Screen-Pop & AI Call Summary
  * POST /api/integrations/sso/verify-claims          — Enterprise OIDC/SAML 12-Role Claim Verification
  * POST /api/integrations/abarca/sync                — Live Abarca PBM (Rx, 0-Refills, Prior Auths)
  * POST /api/integrations/careadvance/sync           — Live CareAdvance Two-Way Care Journey Sync (Inbound)
  * POST /api/integrations/careadvance/push/{id}      — Live CareAdvance Two-Way Care Journey Sync (Outbound)
  * POST /api/integrations/clinical-labs/sync         — Live Clinical Labs (HL7/LOINC Panels)
  * POST /api/integrations/titan-mra/sync             — Live Project Titan MRA (CMS HCC v28 / RAF 1.25)
  * POST /api/integrations/clarity-gl/sync            — Live Clarity / GL Finance (P&L, PMPM, MLR 83%)
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Depends, Header, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.session import get_control_session
from ..db.tenant_manager import TenantContext
from ..dependencies.tenant import get_tenant_context, get_tenant_session
from ..services import live_client_apis as api_service
from ..utils.audit_logger import record_audit_event
from ..utils.security import AuthenticatedUser, get_current_user

router = APIRouter(prefix="/api/integrations", tags=["live-client-apis"])


@router.get("/status")
async def get_integrations_status(
    tenant: TenantContext = Depends(get_tenant_context),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    return api_service.get_all_connectors_status(tenant.key)


@router.post("/qnxt/sync")
async def qnxt_sync(
    payload: dict[str, Any] = Body(...),
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    try:
        result = await api_service.sync_qnxt_member(session, tenant_key=tenant.key, payload=payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="integrations.qnxt.sync",
        payload={"member_key": result["member_key"], "claims_synced": result["claims_synced"]},
    )
    await session.commit()
    await control_session.commit()
    return result


@router.post("/talkdesk/webhook")
async def talkdesk_webhook(
    request: Request,
    payload: dict[str, Any] = Body(...),
    x_talkdesk_signature: str | None = Header(default=None),
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    raw_body = await request.body()
    if not api_service.verify_talkdesk_signature(raw_body, x_talkdesk_signature):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Talkdesk webhook signature")
    try:
        result = await api_service.process_talkdesk_webhook(session, tenant_key=tenant.key, payload=payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="integrations.talkdesk.webhook",
        payload={
            "interaction_id": result["interaction_id"],
            "member_id": result["screen_pop"]["member_id"],
            "note_id": result["note_id"],
        },
    )
    await session.commit()
    await control_session.commit()
    return result


@router.post("/sso/verify-claims")
async def sso_verify_claims(
    payload: dict[str, Any] = Body(...),
    tenant: TenantContext = Depends(get_tenant_context),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    try:
        return api_service.verify_enterprise_sso_claims(payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/abarca/sync")
async def abarca_sync(
    payload: dict[str, Any] = Body(...),
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    try:
        result = await api_service.sync_abarca_pbm(session, tenant_key=tenant.key, payload=payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="integrations.abarca.sync",
        payload={"member_key": result["member_key"], "medications_synced": result["medications_synced"]},
    )
    await session.commit()
    await control_session.commit()
    return result


@router.post("/careadvance/sync")
async def careadvance_sync(
    payload: dict[str, Any] = Body(...),
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    try:
        result = await api_service.sync_careadvance_journeys(session, tenant_key=tenant.key, payload=payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="integrations.careadvance.sync",
        payload={"member_key": result["member_key"], "journey_id": result["journey_id"]},
    )
    await session.commit()
    await control_session.commit()
    return result


@router.post("/careadvance/push/{journey_id}")
async def careadvance_push(
    journey_id: int,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    try:
        result = await api_service.push_journey_to_careadvance(
            session, tenant_key=tenant.key, journey_id=journey_id
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="integrations.careadvance.push",
        payload={"journey_id": journey_id, "stages_pushed": result["stages_pushed"]},
    )
    await session.commit()
    await control_session.commit()
    return result


@router.post("/clinical-labs/sync")
async def clinical_labs_sync(
    payload: dict[str, Any] = Body(...),
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    try:
        result = await api_service.sync_clinical_labs(session, tenant_key=tenant.key, payload=payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="integrations.clinical_labs.sync",
        payload={"member_key": result["member_key"], "labs_synced": result["labs_synced"]},
    )
    await session.commit()
    await control_session.commit()
    return result


@router.post("/titan-mra/sync")
async def titan_mra_sync(
    payload: dict[str, Any] = Body(...),
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    try:
        result = await api_service.sync_project_titan_mra(session, tenant_key=tenant.key, payload=payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="integrations.titan_mra.sync",
        payload={"member_key": result["member_key"], "suspects_ingested": result["suspects_ingested"]},
    )
    await session.commit()
    await control_session.commit()
    return result


@router.post("/clarity-gl/sync")
async def clarity_gl_sync(
    payload: dict[str, Any] = Body(...),
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    try:
        result = await api_service.sync_clarity_gl_finance(session, tenant_key=tenant.key, payload=payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="integrations.clarity_gl.sync",
        payload={"model_year": result["model_year"], "lob": result["lob"]},
    )
    await session.commit()
    await control_session.commit()
    return result
