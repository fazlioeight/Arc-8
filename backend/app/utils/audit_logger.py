# audit_logger.py
import logging
from datetime import datetime

logging.basicConfig(filename='audit.log', level=logging.INFO)

def log_access(user_id, endpoint):
    timestamp = datetime.now().isoformat()
    logging.info(f"{timestamp} | User: {user_id} | Accessed: {endpoint}")