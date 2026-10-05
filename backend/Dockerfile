FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install uv from the official installer (architecture-aware).
RUN curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR=/usr/local/bin sh

COPY pyproject.toml uv.lock ./

RUN uv sync --frozen --no-dev

COPY . .

# Keep the venv out of /app so the docker-compose `./backend:/app` bind mount
# (used by backend, celery-worker, and celery-beat) doesn't shadow it.
ENV PATH="/opt/venv/bin:$PATH"

# The entrypoint lives outside /app for the same reason (the bind mount would shadow it).
# `tr` strips any CRLF that a Windows checkout could have introduced.
COPY docker-entrypoint.sh /tmp/docker-entrypoint.sh
RUN tr -d '\r' < /tmp/docker-entrypoint.sh > /usr/local/bin/docker-entrypoint.sh \
    && chmod +x /usr/local/bin/docker-entrypoint.sh \
    && rm /tmp/docker-entrypoint.sh

EXPOSE 5454

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "5454"]
