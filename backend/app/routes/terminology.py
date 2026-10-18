from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.session import get_control_session
from ..models.tables import IcdCode
from ..schemas.terminology import ICDMapResponse

router = APIRouter(prefix="/api/terminology", tags=["terminology"])


@router.get("/icd-map", response_model=ICDMapResponse)
async def icd_map(
    code: str,
    model_year: int = 2025,
    lob: str = "MA",
    control_session: AsyncSession = Depends(get_control_session),
) -> ICDMapResponse:
    normalized = code.upper().strip()
    result = await control_session.execute(
        select(IcdCode).where(IcdCode.code == normalized, IcdCode.is_valid.is_(True))
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"ICD code {normalized!r} not found in reference table",
        )
    return ICDMapResponse(
        code=row.code,
        hcc=row.hcc_code or "",
        alternatives=row.alternatives or [],
        notes=row.notes or [],
    )
