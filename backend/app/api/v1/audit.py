"""Audit log endpoints."""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app import modules
from app.dal.postgres_repository import PostgresRepository
from app.dependencies import get_repository, require_admin
from app.schemas.audit import AuditLogList, RestoreResponse

router = APIRouter(prefix="/audit", tags=["audit"])


def _get_pg_repo() -> PostgresRepository:
    repo = get_repository()
    if not isinstance(repo, PostgresRepository):
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Audit log is only available with PostgreSQL backend",
        )
    return repo


@router.get("", response_model=AuditLogList, dependencies=[Depends(require_admin)])
async def list_audit_logs(
    entity_type: str | None = Query(None),
    action: str | None = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0),
) -> AuditLogList:
    repo = _get_pg_repo()
    return await repo.list_audit_logs(
        entity_type=entity_type, action=action, limit=limit, offset=offset,
    )


@router.post(
    "/{audit_log_id}/restore",
    response_model=RestoreResponse,
    dependencies=[Depends(require_admin)],
)
async def restore_entity(
    audit_log_id: UUID,
    restore_edges: bool = Query(True, description="Also restore connections that were deleted with this node"),
) -> RestoreResponse:
    repo = _get_pg_repo()
    try:
        entity_id, entity_name = await repo.restore_entity(audit_log_id, restore_edges=restore_edges)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return RestoreResponse(
        message=f"Restored {entity_name or entity_id}",
        restored_id=entity_id,
    )


@router.delete("", dependencies=[Depends(require_admin)])
async def clear_audit_log() -> dict:
    repo = _get_pg_repo()
    # The change statistics are counted from the object history: while the
    # module is on, clearing the log leaves that part.
    keep = modules.enabled("changes")
    count = await repo.clear_audit_log(keep_node_history=keep)
    return {"deleted": count, "kept_node_history": keep}
