import structlog
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.middleware.setup import SecurityHeadersMiddleware, RequestLoggingMiddleware
from app.middleware.logging import setup_logging
from app.routers import auth, workspace, jobs, resumes, ai, billing, extension, webhooks, files, health

setup_logging()
logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("app_startup", environment=settings.ENVIRONMENT)
    yield
    logger.info("app_shutdown")


app = FastAPI(
    title="JobForge API",
    description="AI-native job application command center",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[x.strip() for x in settings.CORS_ORIGINS.split(",") if x.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RequestLoggingMiddleware)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(workspace.router)
app.include_router(jobs.router)
app.include_router(resumes.router)
app.include_router(ai.router)
app.include_router(billing.router)
app.include_router(extension.router)
app.include_router(webhooks.router)
app.include_router(files.router)


@app.get("/")
async def root():
    return {"name": "JobForge API", "version": "1.0.0", "docs": "/docs"}
