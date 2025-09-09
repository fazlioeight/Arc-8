from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import psycopg2
import bcrypt
import uvicorn

app = FastAPI()

# Allow CORS for React frontend (update origins as needed)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # React dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Root route
@app.get("/")
def read_root():
    return {"message": "Nexora Analytics Backend"}

# Pydantic model for login request
class LoginRequest(BaseModel):
    email: str
    password: str

# Login route
@app.post("/api/login")
def login(request: LoginRequest):
    conn = None
    cur = None
    try:
        # Connect to Postgres
        conn = psycopg2.connect(
            dbname="nexora",
            user="admin",
            password="admin",
            host="localhost"
        )
        cur = conn.cursor()

        # Check if user exists
        cur.execute("SELECT password_hash FROM users WHERE email = %s", (request.email,))
        result = cur.fetchone()

        if not result:
            raise HTTPException(status_code=401, detail="Invalid credentials")

        hashed_password = result[0]

        # Verify password
        if not bcrypt.checkpw(request.password.encode(), hashed_password.encode()):
            raise HTTPException(status_code=401, detail="Invalid credentials")

        return {"token": "example-jwt"}  # Replace with real JWT later

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()

# Run the app
if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
