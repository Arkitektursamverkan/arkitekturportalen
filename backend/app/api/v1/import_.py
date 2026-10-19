"""Import trigger endpoints for external connectors."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.dependencies import get_repository, require_admin
from app.services.import_service import ImportResult, ImportService

router = APIRouter(prefix="/import", tags=["import"])


@router.post("/sharepoint", response_model=dict,
             dependencies=[Depends(require_admin)])
async def import_sharepoint(
    mode: str = Query("mock", description="'mock' uses seed JSON; 'api' calls live SharePoint"),
    prune: bool = Query(False, description="Archive nodes missing from source"),
) -> dict:
    """Import Application nodes from SharePoint."""
    repo = get_repository()
    svc = ImportService(repo)
    result: ImportResult = await svc.import_sharepoint(mode=mode, prune=prune)
    return {
        "source": result.source,
        "mode": result.mode,
        "total": result.total,
        "created": result.created,
        "updated": result.updated,
        "errors": result.errors,
    }


@router.post("/2c8", response_model=dict,
             dependencies=[Depends(require_admin)])
async def import_2c8(
    mode: str = Query("mock", description="'mock' uses seed JSON; 'api' calls live 2C8"),
    prune: bool = Query(False),
) -> dict:
    """Import Process nodes from 2C8."""
    repo = get_repository()
    svc = ImportService(repo)
    result: ImportResult = await svc.import_2c8(mode=mode, prune=prune)
    return {
        "source": result.source,
        "mode": result.mode,
        "total": result.total,
        "created": result.created,
        "updated": result.updated,
        "errors": result.errors,
    }
