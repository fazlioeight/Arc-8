from __future__ import annotations

from typing import List, Optional

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..dependencies.tenant import get_tenant_context
from ..db.session import get_control_session
from ..models.tables import FhirImportJob
from ..services.fhir_imports import (
    FhirConfig,
    create_job,
    fetch_capability_statement,
    fetch_oauth_token,
    probe_resource_sample,
    run_fhir_import,
    save_connector,
)
from ..utils.audit_logger import record_audit_event
from ..utils.security import AuthenticatedUser, get_current_user
from ..db.tenant_manager import TenantContext

router = APIRouter(prefix="/api/imports", tags=["imports"])


class FhirRequest(BaseModel):
    baseUrl: str = Field(..., alias="baseUrl")
    tokenUrl: Optional[str] = Field(None, alias="tokenUrl")
    clientId: Optional[str] = Field(None, alias="clientId")
    clientSecret: Optional[str] = Field(None, alias="clientSecret")
    scopes: Optional[str] = None
    since: Optional[str] = None
    resources: List[str] = Field(default_factory=list)

    class Config:
        allow_population_by_field_name = True


class FhirJobResponse(BaseModel):
    jobId: str
    status: str
    progress: int


@router.post("/fhir/test")
async def test_fhir_connection(
    payload: FhirRequest,
    tenant: TenantContext = Depends(get_tenant_context),
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_control_session),
):
    config = FhirConfig(
        base_url=payload.baseUrl,
        token_url=payload.tokenUrl,
        client_id=payload.clientId,
        client_secret=payload.clientSecret,
        scopes=payload.scopes,
        since=payload.since,
        resources=payload.resources,
    )
    async with httpx.AsyncClient(timeout=8.0) as client:
        token = await fetch_oauth_token(client, config)
        capability = await fetch_capability_statement(client, config, token)
        if config.resources:
            await probe_resource_sample(client, config, token, config.resources[0])

    await record_audit_event(
        session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="import_data.fhir_test",
        payload={"base_url": config.base_url, "resources": config.resources},
    )
    await session.commit()
    return {
        "status": "connected",
        "capability": capability,
        "resourcesTested": config.resources[:1],
    }


@router.post("/fhir/jobs", response_model=FhirJobResponse)
async def queue_fhir_job(
    payload: FhirRequest,
    background_tasks: BackgroundTasks,
    tenant: TenantContext = Depends(get_tenant_context),
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_control_session),
):
    config = FhirConfig(
        base_url=payload.baseUrl,
        token_url=payload.tokenUrl,
        client_id=payload.clientId,
        client_secret=payload.clientSecret,
        scopes=payload.scopes,
        since=payload.since,
        resources=payload.resources,
    )
    connector = await save_connector(session, tenant.id, config)
    job = await create_job(session, tenant.id, connector.id if connector else None, config)
    await record_audit_event(
        session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="import_data.fhir_queued",
        payload={"base_url": config.base_url, "resources": config.resources, "job_id": job.id},
    )
    await session.commit()
    background_tasks.add_task(run_fhir_import, job.id)
    return FhirJobResponse(jobId=str(job.id), status=job.status, progress=job.progress)


@router.get("/fhir/jobs")
async def list_fhir_jobs(
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_control_session),
):
    stmt = (
        select(FhirImportJob)
        .where(FhirImportJob.tenant_id == tenant.id)
        .order_by(FhirImportJob.started_at.desc())
        .limit(50)
    )
    rows = (await session.execute(stmt)).scalars().all()
    return [
        {
            "id": str(row.id),
            "status": row.status,
            "progress": row.progress,
            "resources": row.resources,
            "baseUrl": row.base_url,
            "startedAt": row.started_at,
            "completedAt": row.completed_at,
            "error": row.error,
        }
        for row in rows
    ]


@router.get("/fhir/jobs/{job_id}")
async def get_fhir_job(
    job_id: str,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_control_session),
):
    job = await session.get(FhirImportJob, job_id)
    if not job or job.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    return {
        "id": str(job.id),
        "status": job.status,
        "progress": job.progress,
        "resources": job.resources,
        "baseUrl": job.base_url,
        "startedAt": job.started_at,
        "completedAt": job.completed_at,
        "error": job.error,
        "lastLog": job.last_log,
    }
