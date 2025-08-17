from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

app = FastAPI()

# Allow CORS for React frontend (update origins as needed)
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3000"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

@app.get("/")
def read_root():
    return {"message": "Nexora Analytics Backend"}

# Add routes, e.g., for auth
@app.post("/api/login")
def login(user: dict):
    # Implement auth logic (e.g., check credentials, return JWT)
    return {"token": "example-jwt"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)