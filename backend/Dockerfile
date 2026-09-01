FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml .

RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir \
    fastapi==0.115.6 \
    uvicorn[standard]==0.34.0 \
    sqlalchemy[asyncio]==2.0.36 \
    asyncpg==0.30.0 \
    psycopg2-binary==2.9.10 \
    alembic==1.14.1 \
    pydantic==2.10.4 \
    pydantic-settings==2.7.0 \
    python-jose[cryptography]==3.3.0 \
    passlib[bcrypt]==1.7.4 \
    bcrypt==4.0.1 \
    python-multipart==0.0.19 \
    httpx==0.28.1 \
    redis==5.2.1 \
    celery[redis]==5.4.0 \
    minio==7.2.10 \
    pyyaml==6.0.2 \
    aiofiles==24.1.0 \
    structlog==24.4.0 \
    slowapi==0.1.9 \
    secure==1.0.1 \
    python-dotenv==1.0.1 \
    email-validator==2.2.0 \
    jinja2==3.1.4 \
    openpyxl==3.1.5

COPY . .

EXPOSE 5454

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "5454"]
