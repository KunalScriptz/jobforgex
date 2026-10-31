from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import List, Any
from urllib.parse import quote_plus
from dotenv import load_dotenv

load_dotenv(".env")


def parse_cors(v: Any) -> list[str]:
    if isinstance(v, str):
        return [x.strip() for x in v.split(",") if x.strip()]
    if isinstance(v, list):
        return v
    return ["http://localhost:5173"]


class Settings(BaseSettings):
    DB_HOST: str = "postgres"
    DB_PORT: int = 5432
    DB_NAME: str = "jobforgex"
    DB_USER: str = "jobforgex"
    DB_PASSWORD: str = "jobforgex"

    DATABASE_URL: str = ""
    DATABASE_URL_SYNC: str = ""

    # Redis
    REDIS_URL: str = "redis://redis:6379/0"

    # JWT
    JWT_SECRET: str = "change-me-in-production-use-a-64-char-random-string"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # MinIO
    MINIO_ENDPOINT: str = "minio:9000"
    MINIO_PUBLIC_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    MINIO_BUCKET: str = "job-artifacts"
    MINIO_SECURE: bool = False

    # DeepSeek AI
    DEEPSEEK_API_KEY: str = ""
    DEEPSEEK_BASE_URL: str = "https://api.deepseek.com/v1"
    DEEPSEEK_MODEL: str = "deepseek-v4-flash"
    DEEPSEEK_INPUT_PRICE_PER_1M: float = 0.14
    DEEPSEEK_CACHE_HIT_PRICE_PER_1M: float = 0.0028
    DEEPSEEK_OUTPUT_PRICE_PER_1M: float = 0.28
    DEEPSEEK_KEY_ENC_SECRET: str = ""

    # LaTeX
    LATEX_COMPILE_URL: str = "http://latex-server:5959"
    LATEX_SHARED_SECRET: str = ""


    # SMTP
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 465
    SMTP_USER: str = ""
    SMTP_PASS: str = ""
    SMTP_FROM: str = "JobForge <noreply@jobforge.local>"

    # Google OAuth
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://localhost:5454/api/v1/auth/google/callback"

    # Scheduled digest email. Off by default: the Celery task registration bug meant the digest
    # never actually ran, so enabling it is an explicit opt-in (set DIGEST_ENABLED=true).
    DIGEST_ENABLED: bool = False

    # Instance admins: a comma-separated list of emails. Listed (and email-verified) users get the
    # "admin" role at login/refresh; everyone else is a plain user. Empty means nobody is an admin.
    ADMIN_EMAILS: str = ""

    # Feature flags. Each gates a whole area (nav items + routes' behaviour) that ships dark first.
    FEATURE_PIPELINE: bool = False
    FEATURE_GMAIL: bool = False
    # Discovery: scrape job boards on a schedule into a per-workspace inbox. Gates the UI, the
    # API routes and the daily beat schedule. Off by default; users also opt in per workspace.
    # Scraping LinkedIn/Glassdoor may breach those sites' terms: personal self-hosted use only.
    FEATURE_DISCOVERY: bool = False

    # Discovery scraping. DISCOVERY_PROXIES is comma-separated proxy URLs (user:pass@host:port,
    # or http://user:pass@host:port); it carries credentials, so it is a secret and never logged.
    DISCOVERY_PROXIES: str = ""
    # Cap on AI fit-scored postings per workspace per run (the rest keep their keyword score).
    DISCOVERY_AI_MAX_PER_RUN: int = 60
    # How long un-triaged ("new") postings stay in the inbox before the daily cleanup drops them.
    DISCOVERY_RETENTION_DAYS: int = 30

    # App
    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "INFO"
    CORS_ORIGINS: str = "*,http://localhost:5173,http://localhost:5454,https://*.helixos.pro"

    @property
    def discovery_proxies(self) -> list[str]:
        return [p.strip() for p in self.DISCOVERY_PROXIES.split(",") if p.strip()]

    @property
    def admin_emails(self) -> list[str]:
        return [e.strip().lower() for e in self.ADMIN_EMAILS.split(",") if e.strip()]

    @property
    def FRONTEND_URL(self) -> str:
        """First non-wildcard entry from CORS_ORIGINS (skips '*' and glob patterns)."""
        for origin in self.CORS_ORIGINS.split(","):
            stripped = origin.strip()
            if "*" in stripped:
                continue
            return stripped
        return "http://localhost:5173"

    model_config = {"extra": "ignore"}

    def model_post_init(self, __context):
        if not self.DATABASE_URL:
            encoded_password = quote_plus(self.DB_PASSWORD)
            self.DATABASE_URL = f"postgresql+asyncpg://{self.DB_USER}:{encoded_password}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
        if not self.DATABASE_URL_SYNC:
            encoded_password = quote_plus(self.DB_PASSWORD)
            self.DATABASE_URL_SYNC = f"postgresql+psycopg2://{self.DB_USER}:{encoded_password}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
