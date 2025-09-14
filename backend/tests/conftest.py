import os
import sys

# Ensure the backend directory is on sys.path so that imports like
# `from app.utils.security import ...` resolve to `backend/app/...`.
CURRENT_DIR = os.path.dirname(__file__)
BACKEND_ROOT = os.path.abspath(os.path.join(CURRENT_DIR, os.pardir))

if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

