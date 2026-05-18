"""Import routes — unified data import job tracking + FHIR connector flow.

Two surfaces:
  - ``/api/imports/uploads``: file uploads (Members/Providers/Claims/MAO-004/Charts)
  - ``/api/imports/jobs``: unified job feed used by the Job Status Center
  - ``/api/imports/fhir/*``: legacy FHIR connector flow (preserved unchanged)
"""
from __future__ import annotations

from typing import List, Optional

import httpx
from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..dependencies.tenant import get_tenant_context
from ..db.session import get_control_session
from ..db.tenant_manager import TenantContext
from ..models.tables import FhirImportJob
from ..services import data_imports as data_imports_service
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

router = APIRouter(prefix="/api/imports", tags=["imports"])


# ---------------------- Unified job feed ---------------------------------


class JobListResponse(BaseModel):
    items: list[dict]
    total: int


@router.get("/jobs", response_model=JobListResponse)
async def list_jobs(
    status_filter: Optional[str] = Query(default=None, alias="status"),
    source_type: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    jobs, total = await data_imports_service.list_jobs(
        session,
        tenant_id=tenant.id,
        status=status_filter,
        source_type=source_type,
        search=search,
        limit=limit,
        offset=offset,
    )
    return {"items": [data_imports_service.serialize_job(j) for j in jobs], "total": total}


@router.get("/jobs/{job_id}")
async def get_job(
    job_id: str,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    job = await data_imports_service.get_job(session, tenant.id, job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    logs = await data_imports_service.get_logs(session, job_id)
    return {
        **data_imports_service.serialize_job(job),
        "logs": [data_imports_service.serialize_log(l) for l in logs],
    }


@router.get("/jobs/{job_id}/logs")
async def get_job_logs(
    job_id: str,
    limit: int = Query(default=200, ge=1, le=2000),
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    job = await data_imports_service.get_job(session, tenant.id, job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    logs = await data_imports_service.get_logs(session, job_id, limit=limit)
    return {"items": [data_imports_service.serialize_log(l) for l in logs]}


@router.get("/jobs/{job_id}/download", response_class=PlainTextResponse)
async def download_job_logs(
    job_id: str,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    job = await data_imports_service.get_job(session, tenant.id, job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    logs = await data_imports_service.get_logs(session, job_id, limit=2000)
    body = data_imports_service.build_log_export(job, logs)
    return PlainTextResponse(
        content=body,
        media_type="text/plain",
        headers={
            "Content-Disposition": f'attachment; filename="{job.id}.log"',
        },
    )


@router.post("/jobs/{job_id}/retry")
async def retry_job_endpoint(
    job_id: str,
    background_tasks: BackgroundTasks,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    job = await data_imports_service.get_job(session, tenant.id, job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    if job.status not in ("failed", "completed"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Job cannot be retried while in status '{job.status}'",
        )
    job = await data_imports_service.retry_job(session, job)
    await record_audit_event(
        session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="import_data.retry",
        payload={"job_id": job.id, "name": job.name},
    )
    await session.commit()
    background_tasks.add_task(data_imports_service.process_job, job.id)
    return data_imports_service.serialize_job(job)


# ---------------------- File uploads -------------------------------------


@router.post("/uploads", status_code=status.HTTP_201_CREATED)
async def queue_upload(
    background_tasks: BackgroundTasks,
    entity: str = Form(...),
    file: UploadFile = File(...),
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    valid, message = data_imports_service.validate_upload(file.filename or "", entity)
    if not valid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message)

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File is empty")

    file_path, file_size = await data_imports_service.save_upload(
        tenant_key=tenant.key,
        file_name=file.filename or "upload",
        file_bytes=contents,
    )
    name = f"Import {entity.title()} — {file.filename}"
    job = await data_imports_service.create_job(
        session,
        tenant_id=tenant.id,
        name=name,
        source_type="upload",
        entity=entity,
        file_name=file.filename,
        file_size=file_size,
        file_path=file_path,
        mime_type=file.content_type,
        initiated_by=current_user.email,
        metadata={"preview": data_imports_service.preview_file(file_path, max_lines=5)},
    )
    await record_audit_event(
        session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="import_data.upload_queued",
        payload={"job_id": job.id, "entity": entity, "file_name": file.filename, "size": file_size},
    )
    await session.commit()
    background_tasks.add_task(data_imports_service.process_job, job.id)
    return data_imports_service.serialize_job(job)


# ---------------------- FHIR connector (existing) ------------------------


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

    # Mirror to the unified data_import_jobs feed so the Job Status Center
    # sees FHIR pulls and file uploads in one list.
    mirror = await data_imports_service.create_job(
        session,
        tenant_id=tenant.id,
        name=f"FHIR pull — {config.base_url}",
        source_type="fhir",
        entity=",".join(config.resources[:3]) if config.resources else None,
        initiated_by=current_user.email,
        metadata={
            "base_url": config.base_url,
            "token_url": config.token_url,
            "scopes": config.scopes,
            "since": config.since,
            "resources": config.resources,
            "fhir_job_id": job.id,
        },
    )

    await record_audit_event(
        session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="import_data.fhir_queued",
        payload={
            "base_url": config.base_url,
            "resources": config.resources,
            "job_id": job.id,
            "mirror_id": mirror.id,
        },
    )
    await session.commit()
    background_tasks.add_task(run_fhir_import, job.id)
    background_tasks.add_task(data_imports_service.process_job, mirror.id)
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
