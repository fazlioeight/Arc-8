from fastapi import APIRouter, Depends
from ..utils.security import get_current_user

router = APIRouter()


@router.get("/member/{member_id}/risk")
def get_member_risk(member_id: str, current_user: dict = Depends(get_current_user)):
    # Placeholder risk score
    return {"member_id": member_id, "risk_score": 0.42, "requested_by": current_user["email"]}
