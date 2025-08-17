# utilization_dashboard.py
import streamlit as st
import requests

st.title("Utilization Management")
threshold = st.slider("Visit Threshold", 1, 20, 5)

if st.button("Flag Overutilization"):
    response = requests.get("http://localhost:8000/overutilization/", params={"threshold": threshold})
    st.write(response.json())