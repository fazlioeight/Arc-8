# member_cost_service.py
from fastapi import FastAPI
import pandas as pd

app = FastAPI()
claims_df = pd.read_csv('claims_data.csv')
claims_df['ServiceDate'] = pd.to_datetime(claims_df['ServiceDate'])
claims_df['Cost'] = claims_df['Cost'].astype(float)

@app.get("/member/{member_id}/costs")
def get_member_costs(member_id: str):
    member_data = claims_df[claims_df['MemberID'] == member_id]
    total_cost = member_data['Cost'].sum()
    return {"member_id": member_id, "total_cost": total_cost}