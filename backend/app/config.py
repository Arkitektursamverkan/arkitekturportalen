"""Application configuration loaded from environment variables."""
from __future__ import annotations

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.internal_url import asyncpg_url

# Values that have shipped as defaults in this repository at some point.
_PLACEHOLDER_SECRETS = {
    "",
    "dev-secret-key",
    "dev-secret-key-change-in-production",
    "change-me-in-production",
    "dev-local-secret-change-me",
}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # ── Database ─────────────────────────────────────────────────────────────
    EA_DB_ENGINE: str = "postgres"
    DATABASE_URL: str = "postgresql+asyncpg://ea_user:ea_pass@localhost:5432/ea_db"
    NEO4J_URI: str = "bolt://localhost:7687"
    NEO4J_USER: str = "neo4j"
    NEO4J_PASSWORD: str = "ea_password"

    # ── Security ─────────────────────────────────────────────────────────────
    API_KEY: str = "dev-secret-key"

    # ── Entra ID auth ────────────────────────────────────────────────────────
    ENTRA_TENANT_ID: str = ""
    ENTRA_CLIENT_ID: str = ""
    # Empty = anyone the Entra tenant signs in. Default for the organisation
    # settings (Administration), which override it once set there.
    ALLOWED_EMAIL_DOMAINS: str = ""
    BOOTSTRAP_ADMIN_EMAILS: str = ""
    # One-time code for creating the first administrator on the login page.
    # Required in production – otherwise whoever reached a new installation
    # first would become its admin.
    SETUP_CODE: str = ""

    # ── Local accounts (alternative login for users without Entra) ───────────
    LOCAL_AUTH_SECRET: str = "change-me-in-production"
    LOCAL_TOKEN_TTL_HOURS: int = 12

    # Let callers without credentials read what the everyone grants allow.
    # Default for the organisation settings, like ALLOWED_EMAIL_DOMAINS.
    ANONYMOUS_READ: bool = False

    # Optional modules switched on at installation (app.modules): comma-
    # separated keys or "all"; empty = the core only. Default for the
    # organisation settings, like ANONYMOUS_READ.
    MODULES: str = ""

    # The Integration Platform sends this as X-Webhook-Secret with its
    # post-execution webhook (POST_EXEC_WEBHOOK_SECRET there). Empty = the
    # webhook is switched off, since anyone could otherwise start a sync.
    SYNC_WEBHOOK_SECRET: str = ""

    # ── Change log ───────────────────────────────────────────────────────────
    # Departments (as Entra ID names them, comma-separated) whose people may
    # write in the change log. Admins always may. Default for the organisation
    # settings, like ALLOWED_EMAIL_DOMAINS.
    CHANGE_LOG_DEPARTMENTS: str = ""

    @property
    def bootstrap_admin_emails_list(self) -> list[str]:
        return [e.strip().lower() for e in self.BOOTSTRAP_ADMIN_EMAILS.split(",") if e.strip()]

    @property
    def entra_issuer(self) -> str:
        return f"https://login.microsoftonline.com/{self.ENTRA_TENANT_ID}/v2.0"

    @property
    def entra_issuers(self) -> list[str]:
        return [
            f"https://login.microsoftonline.com/{self.ENTRA_TENANT_ID}/v2.0",
            f"https://sts.windows.net/{self.ENTRA_TENANT_ID}/",
        ]

    @property
    def entra_jwks_uri(self) -> str:
        return f"https://login.microsoftonline.com/{self.ENTRA_TENANT_ID}/discovery/v2.0/keys"

    @property
    def entra_audience(self) -> str:
        return f"api://{self.ENTRA_CLIENT_ID}"

    # ── CORS ─────────────────────────────────────────────────────────────────
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:5173"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    # ── App ──────────────────────────────────────────────────────────────────
    # Production unless said otherwise: then weak or placeholder secrets stop
    # the start. Development and tests set APP_ENV themselves.
    APP_ENV: str = "production"
    LOG_LEVEL: str = "info"
    # Set in the image at release (Dockerfile ARG); "dev" when built locally.
    APP_VERSION: str = "dev"

    def weak_secrets(self) -> list[str]:
        """Secrets that are empty, a known placeholder or too short to guess-proof.

        LOCAL_AUTH_SECRET signs login tokens and API_KEY acts as an admin, so a
        known value lets anyone sign in as anyone. Anything but development/test
        refuses to start with them (see main.lifespan)."""
        weak = []
        for name in ("API_KEY", "LOCAL_AUTH_SECRET"):
            value = getattr(self, name)
            if value in _PLACEHOLDER_SECRETS or len(value) < 32:
                weak.append(name)
        return weak

    # ── PDF export (document footer constants) ───────────────────────────────
    PDF_RESPONSIBLE: str = "Enterprise Architect"
    PDF_DEPARTMENT: str = "IT"
    PDF_DOCUMENT_CATEGORY: str = "Rutiner"
    # Default organisation name for the organisation settings.
    PDF_ORG_NAME: str = ""
    PDF_APP_BASE_URL: str = ""

    @field_validator("DATABASE_URL")
    @classmethod
    def normalise_database_url(cls, v: str) -> str:
        # A managed database's own connection string works as it is given.
        return asyncpg_url(v)

    @field_validator("EA_DB_ENGINE")
    @classmethod
    def validate_engine(cls, v: str) -> str:
        allowed = {"postgres", "neo4j"}
        if v not in allowed:
            raise ValueError(f"EA_DB_ENGINE must be one of {allowed}")
        return v


settings = Settings()
