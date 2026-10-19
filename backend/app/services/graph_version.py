"""Graph versioning service — point-in-time snapshots of all nodes and edges.

Snapshots are created in two ways:
  1. Automatically after a document version is published, if the graph has
     changed since the previous snapshot (triggered_by='document_export').
  2. Manually by an admin via the API (triggered_by='manual').

Manual snapshots are always created regardless of changes. Automatic snapshots
are skipped if no node or edge audit entries exist since the last snapshot.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, TYPE_CHECKING

import structlog

from app.models.audit import AuditLogORM

if TYPE_CHECKING:
    from app.dal.postgres_repository import PostgresRepository

log = structlog.get_logger(__name__)


def _audit_to_dict(row: AuditLogORM) -> dict[str, Any]:
    return {
        "id": str(row.id),
        "action": row.action,
        "entity_type": row.entity_type,
        "entity_subtype": row.entity_subtype,
        "entity_name": row.entity_name,
        "user_name": row.user_name,
        "change_note": row.change_note,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


async def take_graph_snapshot(
    repo: "PostgresRepository",
    *,
    created_by: str | None = None,
    triggered_by: str = "manual",
    label: str | None = None,
) -> None:
    """Capture the current full graph state as a new numbered snapshot."""
    latest = await repo.get_latest_graph_snapshot()
    since = latest.created_at if latest else None
    new_audit_rows = await repo.list_graph_audit_entries_since(since)

    nodes = await repo.list_nodes(limit=100_000)
    edges = await repo.list_edges()

    snapshot_blob: dict[str, Any] = {
        "nodes": [n.model_dump(mode="json") for n in nodes],
        "edges": [e.model_dump(mode="json") for e in edges],
        "captured_at": datetime.now(timezone.utc).isoformat(),
    }
    audit_entries = [_audit_to_dict(r) for r in new_audit_rows]

    row = await repo.create_graph_snapshot(
        node_count=len(nodes),
        edge_count=len(edges),
        triggered_by=triggered_by,
        snapshot=snapshot_blob,
        audit_entries=audit_entries,
        created_by=created_by,
        label=label,
    )
    log.info(
        "graph_snapshot.created",
        snapshot_number=row.snapshot_number,
        triggered_by=triggered_by,
        node_count=len(nodes),
        edge_count=len(edges),
        audit_entry_count=len(audit_entries),
    )


async def ensure_current_graph_snapshot(
    repo: "PostgresRepository",
    *,
    created_by: str | None = None,
) -> bool:
    """Create a snapshot only if the graph changed since the last one.

    Returns True if a new snapshot was created.
    """
    latest = await repo.get_latest_graph_snapshot()
    since = latest.created_at if latest else None
    new_audit_rows = await repo.list_graph_audit_entries_since(since)

    if not new_audit_rows and latest is not None:
        return False

    await take_graph_snapshot(
        repo, created_by=created_by, triggered_by="document_export"
    )
    return True
