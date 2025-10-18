from __future__ import annotations

from fastapi import APIRouter

from ..schemas.terminology import ICDMapResponse

router = APIRouter(prefix="/api/terminology", tags=["terminology"])


@router.get("/icd-map", response_model=ICDMapResponse)
async def icd_map(code: str, model_year: int, lob: str) -> ICDMapResponse:
    normalized = code.upper()
    if normalized == "E11.9":
        return ICDMapResponse(
            code="E11.9",
            hcc="NA",
            alternatives=["E11.42", "E11.21", "E11.51"],
            notes=["Unspecified — select a code with complication if documented."],
        )
    return ICDMapResponse(
        code=normalized,
        hcc="18",
        alternatives=[],
        notes=["Requires documentation of neuropathy."],
    )
