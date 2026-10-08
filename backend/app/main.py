import structlog
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.responses import FileResponse
import os

from app.config import settings
from app.middleware.setup import SecurityHeadersMiddleware, RequestLoggingMiddleware
from app.middleware.logging import setup_logging
from app.middleware.cors import WildcardCORSMiddleware
from app.routers import auth, workspace, workspace_settings, jobs, overview, resumes, ai, extension, files, health, users

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
    WildcardCORSMiddleware,
    allow_origins=[x.strip() for x in settings.CORS_ORIGINS.split(",") if x.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RequestLoggingMiddleware)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(workspace.router)
app.include_router(workspace_settings.router)
app.include_router(jobs.router)
app.include_router(overview.router)
app.include_router(resumes.router)
app.include_router(ai.router)
app.include_router(extension.router)
app.include_router(files.router)


@app.get("/extension-version.json")
async def extension_version():
    return {
        "version": "1.3.5",
        "download": "https://chromewebstore.google.com/detail/jobforge-autofill/kigpedieokcmgmhhapiminllfkgkmkfo",
        "changelog": "Install from the Chrome Web Store.",
    }


@app.get("/")
async def root():
    return {"name": "JobForge API", "version": "1.0.0", "docs": "/docs"}


LOGO_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "extension", "icon-128.png")


@app.get("/logo.png")
async def serve_logo():
    if os.path.exists(LOGO_PATH):
        return FileResponse(LOGO_PATH, media_type="image/png")
    return {"detail": "Logo not found"}
