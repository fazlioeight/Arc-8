from pathlib import Path

from fastapi import APIRouter
import pandas as pd

router = APIRouter()

# Resolve CSV path relative to repository structure
BASE_DIR = Path(__file__).resolve().parents[2]  # points to backend/
CLAIMS_CSV = BASE_DIR / "claims_data.csv"

# Load once at startup
claims_df = pd.read_csv(CLAIMS_CSV)
claims_df["ServiceDate"] = pd.to_datetime(claims_df["ServiceDate"])
claims_df["Cost"] = claims_df["Cost"].astype(float)


@router.get("/member/{member_id}/costs")
def get_member_costs(member_id: str):
    member_data = claims_df[claims_df["MemberID"] == member_id]
    total_cost = float(member_data["Cost"].sum())
    return {"member_id": member_id, "total_cost": total_cost}
