# Deployment Guide

## Prerequisites

- Docker 24+ and Docker Compose v2
- 4 GB RAM minimum (8 GB recommended for TeX Live)
- 10 GB disk space
- A domain name (for production)

## Quick Start (Local Development)

```bash
# 1. Clone the repository
git clone <repo-url> jobforgex
cd jobforgex

# 2. Copy and configure environment variables
cp .env.example .env
# Edit .env with your API keys, secrets, and passwords

# 3. Start all services
docker compose up -d

# 4. Verify services
docker compose ps

# 5. Access the application
# Frontend: http://localhost:5173
# Backend API: http://localhost:5454
# API Docs: http://localhost:5454/docs
# pgAdmin: http://localhost:5051 (admin@jobforge.local / admin)
# MinIO Console: http://localhost:9003 (minioadmin / minioadmin)
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| frontend | 5173 | React SPA development server |
| backend | 5454 | FastAPI REST API |
| postgres | 5433 | PostgreSQL 17 database |
| redis | 6380 | Redis 8 for caching and Celery |
| minio | 9002 | S3-compatible object storage |
| minio | 9003 | MinIO web console |
| pgadmin | 5051 | PostgreSQL admin interface |
| latex-server | 5959 | TeX Live PDF compiler |
| celery-worker | — | Background task worker |
| celery-beat | — | Scheduled task scheduler |

## Production Deployment

### 1. Environment Variables

Set production-safe values for all variables in `.env`:

```bash
# REQUIRED: Long random strings for secrets
JWT_SECRET=<openssl rand -hex 32>
DEEPSEEK_KEY_ENC_SECRET=<openssl rand -hex 32>

# REQUIRED: Your API keys
DEEPSEEK_API_KEY=sk-your-key
RAZORPAY_KEY_ID=rzp_live_xxx
RAZORPAY_KEY_SECRET=xxx

# REQUIRED: SMTP for email
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# REQUIRED: Strong database password
DB_PASSWORD=<secure-password>
PGADMIN_PASSWORD=<secure-password>
```

### 2. Build for Production

```bash
# Set build target to production
BUILD_TARGET=production

# Build and start
docker compose up -d --build
```

### 3. Reverse Proxy (Nginx Example)

```nginx
server {
    listen 443 ssl;
    server_name jobforgex.example.com;

    # Frontend
    location / {
        proxy_pass http://localhost:5173;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Backend API
    location /api/ {
        proxy_pass http://localhost:5454;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 120s;
    }

    # WebSocket (if needed)
    location /ws/ {
        proxy_pass http://localhost:5454;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### 4. PostgreSQL Backups

```bash
# Backup
docker compose exec postgres pg_dump -U jobforgex jobforgex > backup.sql

# Restore
cat backup.sql | docker compose exec -T postgres psql -U jobforgex jobforgex

# Automated daily backup (cron)
0 2 * * * cd /path/to/jobforgex && docker compose exec -T postgres pg_dump -U jobforgex jobforgex | gzip > backups/jobforgex-$(date +\\%Y\\%m\\%d).sql.gz
```

### 5. Health Checks

```bash
# Backend health
curl http://localhost:5454/health
# → {"status":"healthy","version":"1.0.0"}

# Readiness
curl http://localhost:5454/health/ready
# → {"status":"ready"}

# Liveness
curl http://localhost:5454/health/live
# → {"status":"alive"}
```

## Scaling Considerations

| Component | Scaling Approach |
|-----------|-----------------|
| Frontend | Static build + CDN, no state |
| Backend | Multiple replicas behind load balancer |
| PostgreSQL | Connection pooling (pgbouncer), read replicas |
| Redis | Cluster mode for high availability |
| MinIO | Distributed mode for production |
| Celery | Multiple workers, separate queues |
| LaTeX Server | Horizontal scaling (stateless) |
