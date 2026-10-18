# fhir_client.py
import requests

def get_patient_data(patient_id):
    url = f"https://fhirserver.com/Patient/{patient_id}"
    headers = {"Accept": "application/fhir+json"}
    response = requests.get(url, headers=headers)
    return response.json()