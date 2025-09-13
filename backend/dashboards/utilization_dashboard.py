# utilization_dashboard.py
import streamlit as st
import requests

st.title("Utilization Management")
st.write("Provide a bearer token to call the protected API.")
token = st.text_input("Bearer Token", value="", type="password")
threshold = st.slider("Visit Threshold", 1, 20, 5)

if st.button("Flag Overutilization"):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    try:
        response = requests.get("http://localhost:8000/overutilization/", params={"threshold": threshold}, headers=headers)
        st.write(response.json())
    except Exception as e:
        st.error(str(e))
