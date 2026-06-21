FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000 \
    WEB_CONCURRENCY=2

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

COPY app.py ./app.py

EXPOSE 8000

# No DB drivers, no app models — this image cannot reach the data layer.
CMD gunicorn -w ${WEB_CONCURRENCY} -k uvicorn.workers.UvicornWorker -b 0.0.0.0:${PORT} app:app
