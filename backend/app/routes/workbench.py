from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from ..schemas.workbench import (
    FinalizeRequest,
    FinalizeResponse,
    WorkbenchPayload,
)

router = APIRouter(prefix="/api/workbench", tags=["workbench"])


@router.get("/suspects", response_model=WorkbenchPayload)
async def get_suspects(member_id: str) -> WorkbenchPayload:
    payload = WorkbenchPayload.model_validate(
        {
            "member": {"id": member_id, "name": "Doe, Jane", "lob": "MA"},
            "encounter": {
                "id": "EN987",
                "dos": "2025-10-03",
                "provider": {"id": "P45", "name": "C. Lee", "type": "NP"},
                "pos": "11",
            },
            "suspects": [
                {
                    "suspect_id": "S1",
                    "condition": "Type 2 diabetes with polyneuropathy",
                    "icd_suggestions": [
                        {"code": "E11.42", "label": "Type 2 DM with diabetic polyneuropathy"}
                    ],
                    "evidence": [
                        {
                            "snippet_id": "SN1",
                            "source_type": "progress_note",
                            "dos": "2025-10-03",
                            "provider": {"id": "P45", "name": "C. Lee", "type": "NP"},
                            "text": "Assessment: Diabetic neuropathy with numbness in feet. Plan: increase duloxetine...",
                            "meat": {"M": True, "E": True, "A": True, "T": True},
                            "confidence": 0.91,
                            "qualifying": True,
                            "location": {"page": 2, "offset_start": 341, "offset_end": 412},
                        },
                        {
                            "snippet_id": "SN2",
                            "source_type": "lab_result",
                            "dos": "2025-08-14",
                            "provider": {"id": "LAB12", "name": "Quest Diagnostics", "type": "Lab"},
                            "text": "Microalbumin ratio elevated at 45 mg/g creatinine.",
                            "meat": {"M": False, "E": True, "A": False, "T": False},
                            "confidence": 0.73,
                            "qualifying": False,
                            "location": {"page": 1, "offset_start": 110, "offset_end": 180},
                        },
                    ],
                    "priority": 0.87,
                },
                {
                    "suspect_id": "S2",
                    "condition": "Chronic kidney disease, stage 3",
                    "icd_suggestions": [{"code": "N18.30", "label": "CKD stage 3 unspecified"}],
                    "evidence": [
                        {
                            "snippet_id": "SN3",
                            "source_type": "progress_note",
                            "dos": "2025-10-03",
                            "provider": {"id": "P45", "name": "C. Lee", "type": "NP"},
                            "text": "Problem list: CKD stage 3b. Creatinine stable at 1.7.",
                            "meat": {"M": True, "E": False, "A": False, "T": True},
                            "confidence": 0.84,
                            "qualifying": True,
                            "location": {"page": 3, "offset_start": 220, "offset_end": 290},
                        }
                    ],
                    "priority": 0.64,
                },
            ],
            "documents": [
                {
                    "id": "D1",
                    "source_type": "progress_note",
                    "dos": "2025-10-03",
                    "provider": {"name": "C. Lee"},
                    "preview": "...Assessment: Diabetic neuropathy...CKD stage 3b noted...",
                },
                {
                    "id": "D2",
                    "source_type": "lab_result",
                    "dos": "2025-08-14",
                    "provider": {"name": "Quest Diagnostics"},
                    "preview": "Microalbumin ratio 45 mg/g creatinine (high)",
                },
            ],
            "model_year": 2025,
        }
    )
    return payload


@router.post("/code", response_model=FinalizeResponse)
async def finalize_code(payload: FinalizeRequest) -> FinalizeResponse:
    if not payload.evidence_used:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Select at least one evidence snippet before finalizing.",
        )
    if not payload.checklist.get("meat_complete"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="MEAT checklist must be satisfied.",
        )

    return FinalizeResponse(
        status="accepted",
        hcc={"id": "18", "label": "Diabetes with chronic complications", "weight": 0.318},
        submission_intent="add",
        audit_id="A-20251018-000112",
    )
