"""The installation's shared settings, for its other services.

GET /api/v1/installation gives Arkitekten and the Integration Platform what
they would otherwise each need typed in: the portal's address, Arkitekten's
address and the Entra settings (one app registration for the installation).
Arkitekten calls with the portal's API key and also gets the client secret;
the platform calls with the webhook secret it already shares with the portal
(SYNC_WEBHOOK_SECRET) and gets everything but the secret.

PUT /api/v1/installation/arkitekten is where Arkitekten registers its own
address at startup.

GET /api/v1/client-config is public: what the portal's web app needs before
sign-in (the Entra ids are public in any SPA) when its /config.js leaves them
empty."""
from __future__ import annotations

import hmac
from typing import Annotated, Any

from fastapi import APIRouter, Header, HTTPException, Response, status
from pydantic import BaseModel

from app.config import settings
from app.services import installation

router = APIRouter(tags=["installation"])


def _matches(given: str | None, expected: str) -> bool:
    return bool(given and expected and hmac.compare_digest(given.encode(), expected.encode()))


def _caller(x_api_key: str | None, x_installation_secret: str | None) -> str:
    if _matches(x_api_key, settings.API_KEY):
        return "key"
    if _matches(x_installation_secret, settings.SYNC_WEBHOOK_SECRET):
        return "secret"
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing or invalid authentication")


@router.get("/installation")
async def get_installation(
    response: Response,
    x_api_key: Annotated[str | None, Header()] = None,
    x_installation_secret: Annotated[str | None, Header()] = None,
) -> dict[str, Any]:
    caller = _caller(x_api_key, x_installation_secret)
    response.headers["Cache-Control"] = "no-store"
    return installation.snapshot(include_secret=caller == "key")


class ArkitektenRegistration(BaseModel):
    url: str


@router.put("/installation/arkitekten")
async def register_arkitekten(
    data: ArkitektenRegistration,
    response: Response,
    x_api_key: Annotated[str | None, Header()] = None,
) -> dict[str, Any]:
    if not _matches(x_api_key, settings.API_KEY):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing or invalid authentication")
    try:
        await installation.register_arkitekten(data.url)
    except installation.InstallationError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))
    response.headers["Cache-Control"] = "no-store"
    return installation.snapshot(include_secret=True)


@router.get("/client-config")
async def get_client_config(response: Response) -> dict[str, str]:
    response.headers["Cache-Control"] = "no-store"
    configured = bool(settings.ENTRA_TENANT_ID and settings.ENTRA_CLIENT_ID)
    return {
        "entra_tenant_id": settings.ENTRA_TENANT_ID if configured else "",
        "entra_client_id": settings.ENTRA_CLIENT_ID if configured else "",
        "entra_api_scope": installation.entra_scope() if configured else "",
        "arkitekten_url": installation.arkitekten_url() or "",
    }
