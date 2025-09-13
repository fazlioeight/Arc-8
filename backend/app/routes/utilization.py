from fastapi import APIRouter, Query

router = APIRouter()


@router.get("/overutilization/")
def flag_overutilization(threshold: int = Query(5, ge=1, le=100)):
    # Placeholder logic; real logic would query analytics
    flagged_members = [
        {"member_id": "M001", "visits": threshold + 2},
        {"member_id": "M007", "visits": threshold + 5},
    ]
    return {"threshold": threshold, "flagged": flagged_members}
