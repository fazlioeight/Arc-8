from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import psycopg2

app = FastAPI()

# Allow CORS for React frontend (update origins as needed)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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


class LoginRequest(BaseModel):
    email: str
    password: str


@app.post("/api/login")
def login(request: LoginRequest):
    conn = psycopg2.connect(
        "dbname=yourdb user=youruser password=yourpass host=localhost"
    )
    cur = conn.cursor()
    cur.execute("SELECT password_hash FROM users WHERE email = %s", (request.email,))
    result = cur.fetchone()
    if not result or not verify_password(request.password, result[0]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    # Return JWT or session token
    return {"token": "example-jwt"}
