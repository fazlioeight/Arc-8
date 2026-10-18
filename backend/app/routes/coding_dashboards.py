from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..dependencies.tenant import get_tenant_session
from ..schemas.coding import CodingProviderDetail as CodingProviderDetailSchema
from ..schemas.coding import CodingProviderLocation as CodingProviderLocationSchema
from ..schemas.coding_dashboards import (
    CodingReviewDashboardResponse,
    CodingWorklistResponse,
    GroupDashboardResponse,
    ProviderContactUpdate,
    ProviderEducationResponse,
    ProviderManagementResponse,
)
from ..services import coding_members
from ..services.coding_dashboards import (
    fetch_group_overview,
    fetch_provider_education,
    fetch_provider_management,
    fetch_review_dashboard,
    fetch_worklist,
    update_provider_contact,
)
from ..utils.security import AuthenticatedUser, get_current_user, require_application

router = APIRouter(
    prefix="/api/coding",
    tags=["coding dashboards"],
    dependencies=[Depends(require_application("coding"))],
)


def _provider_to_detail_schema(provider) -> CodingProviderDetailSchema:
    location_model = provider.location
    location = None
    if location_model:
        location = CodingProviderLocationSchema(
            address_line1=location_model.address_line1,
            city=location_model.city,
            state=location_model.state,
            postal_code=location_model.postal_code,
        )
    return CodingProviderDetailSchema(
        id=provider.id,
        name=provider.name,
        npi=provider.npi,
        tax_id=provider.tax_id,
        phone=provider.phone,
        email=provider.email,
        location=location,
    )


@router.get("/worklist", response_model=CodingWorklistResponse)
async def get_coding_worklist(
    status: list[str] | None = Query(default=None),
    priority: list[str] | None = Query(default=None),
    assigned: str | None = Query(default=None),
    search: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    session: AsyncSession = Depends(get_tenant_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    assigned_filter = assigned if assigned else None
    result = await fetch_worklist(
        session,
        statuses=status,
        priorities=priority,
        assigned=assigned_filter,
        search=search,
        page=page,
        page_size=page_size,
    )
    return result


@router.get("/review/dashboard", response_model=CodingReviewDashboardResponse)
async def get_review_dashboard(
    mine_only: bool = Query(default=False),
    limit: int = Query(default=40, ge=1, le=200),
    session: AsyncSession = Depends(get_tenant_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    assigned_email = current_user.email if mine_only else None
    result = await fetch_review_dashboard(session, assigned_email=assigned_email, limit=limit)
    return result


@router.get("/providers/education", response_model=ProviderEducationResponse)
async def list_provider_education(
    search: str | None = Query(default=None),
    session: AsyncSession = Depends(get_tenant_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    items = await fetch_provider_education(session, search=search)
    return {
        "items": items,
        "total": len(items),
    }


@router.get("/groups/overview", response_model=GroupDashboardResponse)
async def list_group_overview(
    search: str | None = Query(default=None),
    session: AsyncSession = Depends(get_tenant_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    items = await fetch_group_overview(session, search=search)
    return {
        "items": items,
        "total": len(items),
    }


@router.get("/providers/management", response_model=ProviderManagementResponse)
async def list_provider_management(
    search: str | None = Query(default=None),
    session: AsyncSession = Depends(get_tenant_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    items = await fetch_provider_management(session, search=search)
    return {
        "items": items,
        "total": len(items),
    }


@router.patch("/providers/{provider_id}", response_model=CodingProviderDetailSchema)
async def update_provider_management(
    provider_id: int,
    payload: ProviderContactUpdate,
    session: AsyncSession = Depends(get_tenant_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    update_payload = payload.model_dump(exclude_none=True)
    try:
        provider = await update_provider_contact(session, provider_id, update_payload)
    except IntegrityError:
        # npi carries a unique constraint; a collision surfaces here at flush.
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="NPI already in use by another provider.",
        )
    if provider is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Provider not found")
    await session.commit()
    refreshed = await coding_members.get_provider(session, provider_id)
    if refreshed is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Provider not found")
    return _provider_to_detail_schema(refreshed)
