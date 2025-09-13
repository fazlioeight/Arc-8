from fastapi import APIRouter, Query, Depends
from ..utils.security import get_current_user

router = APIRouter()


@router.get("/overutilization/")
def flag_overutilization(threshold: int = Query(5, ge=1, le=100), current_user: dict = Depends(get_current_user)):
    # Placeholder logic; real logic would query analytics
    flagged_members = [
        {"member_id": "M001", "visits": threshold + 2},
        {"member_id": "M007", "visits": threshold + 5},
    ]
    return {"requested_by": current_user["email"], "tenant": current_user["tenant_id"], "threshold": threshold, "flagged": flagged_members}
