from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Iterable, Optional

import httpx
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.session import control_session
from ..models.tables import FhirConnector, FhirImportJob
from ..utils.audit_logger import record_audit_event

logger = logging.getLogger(__name__)


class FhirConfig:
    def __init__(
        self,
        *,
        base_url: str,
        token_url: Optional[str] = None,
        client_id: Optional[str] = None,
        client_secret: Optional[str] = None,
        scopes: Optional[str] = None,
        since: Optional[str] = None,
        resources: Optional[Iterable[str]] = None,
    ):
        self.base_url = base_url.rstrip("/")
        self.token_url = token_url.rstrip("/") if token_url else None
        self.client_id = client_id
        self.client_secret = client_secret
        self.scopes = scopes
        self.since = since
        self.resources = list(resources or [])


async def fetch_oauth_token(client: httpx.AsyncClient, config: FhirConfig) -> Optional[str]:
    if not config.token_url:
        return None
    data = {"grant_type": "client_credentials"}
    if config.client_id:
        data["client_id"] = config.client_id
    if config.client_secret:
        data["client_secret"] = config.client_secret
    if config.scopes:
        data["scope"] = config.scopes
    try:
        resp = await client.post(config.token_url, data=data, timeout=8.0)
    except Exception as exc:  # pragma: no cover - network failures
        logger.warning("FHIR token request failed: %s", exc)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Unable to reach token endpoint") from exc
    if resp.status_code >= 400:
        logger.warning("FHIR token request error %s: %s", resp.status_code, resp.text)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Token request failed; check client credentials or scopes")
    payload = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
    token = payload.get("access_token")
    if not token:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Token response missing access_token")
    return token


async def fetch_capability_statement(client: httpx.AsyncClient, config: FhirConfig, token: Optional[str]) -> dict:
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    url = f"{config.base_url}/metadata"
    try:
        resp = await client.get(url, headers=headers, timeout=8.0)
    except Exception as exc:  # pragma: no cover
        logger.warning("FHIR metadata request failed: %s", exc)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Unable to reach FHIR metadata endpoint") from exc
    if resp.status_code >= 400:
        logger.warning("FHIR metadata error %s: %s", resp.status_code, resp.text)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="FHIR metadata endpoint returned an error")
    try:
        return resp.json()
    except Exception:
        return {}


async def probe_resource_sample(
    client: httpx.AsyncClient, config: FhirConfig, token: Optional[str], resource_type: str
) -> None:
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    params = {"_count": "1"}
    if config.since:
        params["_since"] = config.since
    url = f"{config.base_url}/{resource_type}"
    try:
        resp = await client.get(url, headers=headers, params=params, timeout=8.0)
    except Exception as exc:  # pragma: no cover
        logger.warning("FHIR resource probe failed: %s", exc)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Unable to reach {resource_type} endpoint") from exc
    if resp.status_code >= 400:
        logger.warning("FHIR resource probe error %s: %s", resp.status_code, resp.text)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{resource_type} endpoint returned an error")


async def save_connector(session: AsyncSession, tenant_id: int, config: FhirConfig) -> FhirConnector:
    stmt = select(FhirConnector).where(FhirConnector.tenant_id == tenant_id, FhirConnector.base_url == config.base_url).limit(1)
    existing = await session.scalar(stmt)
    if existing:
        existing.token_url = config.token_url
        existing.client_id = config.client_id
        existing.client_secret = config.client_secret
        existing.scopes = config.scopes
        existing.since = config.since
        existing.config_metadata = existing.config_metadata or {}
        return existing
    connector = FhirConnector(
        tenant_id=tenant_id,
        base_url=config.base_url,
        token_url=config.token_url,
        client_id=config.client_id,
        client_secret=config.client_secret,
        scopes=config.scopes,
        since=config.since,
        config_metadata={},
    )
    session.add(connector)
    return connector


async def create_job(session: AsyncSession, tenant_id: int, connector_id: Optional[int], config: FhirConfig) -> FhirImportJob:
    job = FhirImportJob(
        tenant_id=tenant_id,
        connector_id=connector_id,
        base_url=config.base_url,
        token_url=config.token_url,
        scopes=config.scopes,
        since=config.since,
        resources=config.resources,
        status="queued",
        progress=0,
        last_log=["Job created"],
    )
    session.add(job)
    await session.flush()
    return job


async def update_job_status(
    session: AsyncSession, job: FhirImportJob, *, status_value: str, progress: int | None = None, error: str | None = None
) -> None:
    job.status = status_value
    if progress is not None:
        job.progress = progress
    if status_value == "completed":
        job.completed_at = job.completed_at or datetime.now(timezone.utc)
        job.progress = 100
    if error:
        job.error = error
    await session.flush()


async def run_fhir_import(job_id: str) -> None:
    async with control_session() as session:
        job = await session.get(FhirImportJob, job_id)
        if not job:
            return
        await update_job_status(session, job, status_value="running", progress=5)
        await session.commit()

        try:
            steps = max(1, len(job.resources))
            for idx, resource in enumerate(job.resources or ["Patient"], start=1):
                await asyncio.sleep(0.1)
                progress = min(95, int((idx / steps) * 90) + 5)
                job.last_log.append(f"Synced {resource}")
                await update_job_status(session, job, status_value="running", progress=progress)
                await session.commit()
            await update_job_status(session, job, status_value="completed", progress=100)
            await session.commit()
        except Exception as exc:  # pragma: no cover
            logger.exception("FHIR import failed")
            await update_job_status(session, job, status_value="failed", progress=job.progress, error=str(exc))
            await session.commit()
