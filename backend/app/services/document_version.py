"""Versioning service for exportable documents (Målarkitektur, Principdokument).

A version is created lazily at export time. If no audit entries exist since
the last version's `created_at`, no new version is created and the latest
existing version is returned. When changes exist, a new version is created
with version_minor bumped by 1 (or a major bump if requested, which sets
version_major += 1 and version_minor = 0).
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

import structlog

from app.dal.postgres_repository import PostgresRepository
from app.models.audit import AuditLogORM
from app.models.document_version import DocumentVersionORM
from app.schemas.common import NodeType
from app.schemas.principle import PrincipleRead

log = structlog.get_logger(__name__)


DOCUMENT_TARGET_ARCHITECTURE = "target_architecture"
DOCUMENT_PRINCIPLE_DOCUMENT = "principle_document"
DOCUMENT_GLOSSARY = "glossary"
DOCUMENT_NULAAGESANALYS = "nulaagesanalys"
DOCUMENT_GAP_ANALYS = "gap_analys"


def _audit_to_dict(row: AuditLogORM) -> dict[str, Any]:
    """Reduce an audit row to a JSON-serializable summary for the changelog
    appendix. We don't store full snapshots in the version row — they bloat
    the DB and the audit log itself is the source of truth."""
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


async def _build_target_architecture_snapshot(repo: PostgresRepository) -> dict[str, Any]:
    row = await repo.get_target_architecture()
    if row is None:
        return {"content": {"sections": []}, "updated_at": None}
    return {
        "content": row.content,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        "updated_by": row.updated_by,
    }


async def _build_glossary_snapshot(repo: PostgresRepository) -> dict[str, Any]:
    rows = await repo.list_glossary_terms()
    return {
        "terms": [
            {
                "id": str(r.id),
                "term": r.term,
                "definition": r.definition,
                "updated_at": r.updated_at.isoformat() if r.updated_at else None,
            }
            for r in rows
        ],
    }


async def _build_principle_document_snapshot(repo: PostgresRepository) -> dict[str, Any]:
    doc = await repo.get_principle_document()
    sections = (doc.sections if doc else {}) or {}

    nodes = await repo.list_nodes(
        node_type=NodeType.ARCHITECTURE_PRINCIPLE.value, limit=10000
    )
    principles = [PrincipleRead.from_node(n) for n in nodes]
    principles = [p for p in principles if p.status.value != "Avvecklad"]
    principles.sort(key=lambda p: p.identifier)

    return {
        "sections": {
            "introduction": sections.get("introduction", ""),
            "decision_forum": sections.get("decision_forum", ""),
            "deviation_handling": sections.get("deviation_handling", ""),
            "target_arch_alignment": sections.get("target_arch_alignment", ""),
        },
        "principles": [p.model_dump(by_alias=True, mode="json") for p in principles],
    }


async def _attach_metadata(
    repo: PostgresRepository, document_type: str, snapshot: dict[str, Any]
) -> dict[str, Any]:
    meta_row = await repo.get_document_metadata(document_type)
    entries = list(meta_row.entries) if meta_row else []
    snapshot["metadata_entries"] = entries
    return snapshot


async def _build_nulaagesanalys_snapshot(repo: PostgresRepository) -> dict[str, Any]:
    row = await repo.get_nulaagesanalys()
    if row is None:
        return {"content": {"sections": []}, "updated_at": None}
    return {
        "content": row.content,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        "updated_by": row.updated_by,
    }


async def _build_gap_analys_snapshot(repo: PostgresRepository) -> dict[str, Any]:
    row = await repo.get_gap_analys()
    if row is None:
        return {"content": {"sections": []}, "updated_at": None}
    # Weighted task progress per GAP item, so the PDF shows partial progress.
    task_progress: dict[str, dict[str, int]] = {}
    for task in await repo.list_all_gap_tasks():
        if task.status == "cancelled":
            continue
        p = task_progress.setdefault(task.gap_item_id, {"done": 0, "active": 0})
        p["active"] += task.weight
        if task.status == "done":
            p["done"] += task.weight
    return {
        "content": row.content,
        "task_progress": task_progress,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        "updated_by": row.updated_by,
    }


async def _build_snapshot(repo: PostgresRepository, document_type: str) -> dict[str, Any]:
    if document_type == DOCUMENT_TARGET_ARCHITECTURE:
        snapshot = await _build_target_architecture_snapshot(repo)
    elif document_type == DOCUMENT_PRINCIPLE_DOCUMENT:
        snapshot = await _build_principle_document_snapshot(repo)
    elif document_type == DOCUMENT_GLOSSARY:
        snapshot = await _build_glossary_snapshot(repo)
    elif document_type == DOCUMENT_NULAAGESANALYS:
        snapshot = await _build_nulaagesanalys_snapshot(repo)
    elif document_type == DOCUMENT_GAP_ANALYS:
        snapshot = await _build_gap_analys_snapshot(repo)
    else:
        raise ValueError(f"Unknown document_type: {document_type}")
    return await _attach_metadata(repo, document_type, snapshot)


async def _audit_entries_since(
    repo: PostgresRepository,
    document_type: str,
    since: datetime | None,
) -> list[AuditLogORM]:
    include_principle_nodes = document_type == DOCUMENT_PRINCIPLE_DOCUMENT
    include_glossary_terms = document_type == DOCUMENT_GLOSSARY
    return await repo.list_audit_entries_for_document(
        document_type,
        since=since,
        include_principle_nodes=include_principle_nodes,
        include_glossary_terms=include_glossary_terms,
    )


async def ensure_current_version(
    repo: PostgresRepository,
    document_type: str,
    *,
    bump_major: bool = False,
    force_minor: bool = False,
    created_by: str | None = None,
    change_summary: str | None = None,
) -> tuple[DocumentVersionORM, bool]:
    """Return the most recent version, creating a new one if needed.

    A new version is created when any of:
      - `bump_major=True` (publish a new major version)
      - `force_minor=True` (publish a new minor version unconditionally)
      - There are unsnapshotted audit entries (auto-bump minor)

    Returns (version, created_new).
    """
    latest = await repo.get_latest_document_version(document_type)
    since = latest.created_at if latest else None

    new_audit_rows = await _audit_entries_since(repo, document_type, since)

    if not new_audit_rows and not bump_major and not force_minor and latest is not None:
        return latest, False

    if latest is None:
        version_major = 1 if bump_major else 0
        version_minor = 0 if bump_major else 1
    elif bump_major:
        version_major = latest.version_major + 1
        version_minor = 0
    else:
        version_major = latest.version_major
        version_minor = latest.version_minor + 1

    snapshot = await _build_snapshot(repo, document_type)
    audit_entries = [_audit_to_dict(r) for r in new_audit_rows]

    new_version = await repo.create_document_version(
        document_type=document_type,
        version_major=version_major,
        version_minor=version_minor,
        is_major=bump_major,
        snapshot=snapshot,
        audit_entries=audit_entries,
        change_summary=change_summary,
        created_by=created_by,
    )
    log.info(
        "document_version.created",
        document_type=document_type,
        version=f"{version_major}.{version_minor}",
        is_major=bump_major,
        audit_entry_count=len(audit_entries),
    )

    # Opportunistically snapshot the graph if it has changed since the last
    # graph snapshot. Failure is non-fatal — the document version is already
    # committed.
    try:
        from app.services.graph_version import ensure_current_graph_snapshot
        await ensure_current_graph_snapshot(repo, created_by=created_by)
    except Exception:
        log.warning("graph_snapshot.auto_trigger_failed", exc_info=True)

    return new_version, True


async def pending_change_count(
    repo: PostgresRepository, document_type: str
) -> int:
    latest = await repo.get_latest_document_version(document_type)
    since = latest.created_at if latest else None
    rows = await _audit_entries_since(repo, document_type, since)
    return len(rows)
