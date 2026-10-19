"""Backup & snapshot endpoints — full database export/restore and versioned snapshots."""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import StreamingResponse

from app.dal.graph_repository import GraphRepository
from app.dependencies import get_repository, require_admin
from app.schemas.node import NodeCreate, NodeRead, NodeUpdate

from app.schemas.edge import EdgeCreate

log = structlog.get_logger(__name__)

router = APIRouter(prefix="/backup", tags=["backup"])

SNAPSHOT_DIR = Path(os.environ.get("SNAPSHOT_DIR", "/app/snapshots"))


async def _dump_all(repo: GraphRepository) -> dict[str, Any]:
    """Export all nodes and edges as a JSON-serialisable dict."""
    nodes = await repo.list_nodes(limit=100_000)
    edges = await repo.list_edges()
    return {
        "version": "1.0",
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "nodes": [n.model_dump(mode="json") for n in nodes],
        "edges": [e.model_dump(mode="json") for e in edges],
    }


async def _restore(repo: GraphRepository, data: dict[str, Any]) -> dict[str, Any]:
    """Replace the graph with a backup's nodes and edges.

    An object that still exists — same id, type and external key — is updated
    in place rather than deleted and recreated. Everything that hangs off an
    object by its id (documents, notes, flags, change proposals) therefore
    survives the restore instead of going with the deleted row. Objects that
    are not in the backup are deleted; objects only in the backup are created.
    Edges carry nothing of their own, so they are all replaced.
    """
    kept: dict[str, NodeRead] = {}
    for node_data in data["nodes"]:
        try:
            current = await repo.get_node(UUID(str(node_data["id"])))
        except (KeyError, ValueError):
            continue
        if current is not None and _same_object(current, node_data):
            kept[str(current.id)] = current

    for e in await repo.list_edges():
        await repo.delete_edge(e.id)
    for n in await repo.list_nodes(limit=100_000):
        if str(n.id) not in kept:
            await repo.delete_node(n.id)

    id_map: dict[str, str] = {}
    nodes_created = nodes_kept = 0
    for node_data in data["nodes"]:
        current = kept.get(str(node_data.get("id")))
        if current is not None:
            description = node_data.get("description")
            await repo.update_node(current.id, NodeUpdate(
                name=node_data["name"],
                # None means "unchanged" to update_node; clearing needs "".
                description=description if description is not None else ("" if current.description else None),
                attributes=node_data.get("attributes", {}),
                archived=False,
                admin_hidden=node_data.get("admin_hidden", False),
                is_structure=node_data.get("is_structure", False),
            ))
            id_map[str(current.id)] = str(current.id)
            nodes_kept += 1
            continue
        created = await repo.create_node(NodeCreate(
            type=node_data["type"],
            name=node_data["name"],
            description=node_data.get("description"),
            external_source=node_data.get("external_source", "NONE"),
            external_id=node_data.get("external_id"),
            attributes=node_data.get("attributes", {}),
        ))
        id_map[str(node_data["id"])] = str(created.id)
        nodes_created += 1

    edges_created = 0
    for edge_data in data["edges"]:
        source_id = id_map.get(str(edge_data["source_id"]))
        target_id = id_map.get(str(edge_data["target_id"]))
        if not source_id or not target_id:
            log.warning("Skipping edge with missing node", edge=edge_data)
            continue
        await repo.create_edge(EdgeCreate(
            source_id=UUID(source_id),
            target_id=UUID(target_id),
            type=edge_data["type"],
            attributes=edge_data.get("attributes", {}),
        ))
        edges_created += 1

    return {
        "nodes_restored": nodes_created + nodes_kept,
        "nodes_kept": nodes_kept,
        "edges_restored": edges_created,
    }


def _same_object(current: NodeRead, node_data: dict[str, Any]) -> bool:
    def val(v: Any) -> str:
        return v.value if hasattr(v, "value") else str(v)

    return (
        val(current.type) == str(node_data.get("type"))
        and val(current.external_source) == str(node_data.get("external_source", "NONE"))
        and current.external_id == node_data.get("external_id")
    )


# ── Export full database ──────────────────────────────────────────────────────

@router.get("/export", dependencies=[Depends(require_admin)])
async def export_database(
    format: str = Query("json", regex="^(json)$"),
) -> StreamingResponse:
    """Download the full database as a JSON file."""
    repo = get_repository()
    data = await _dump_all(repo)
    content = json.dumps(data, ensure_ascii=False, indent=2)
    filename = f"ea_backup_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.json"
    return StreamingResponse(
        iter([content]),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── Restore backup ───────────────────────────────────────────────────────────

@router.post("/restore", dependencies=[Depends(require_admin)])
async def restore_database(file: UploadFile = File(...)) -> dict[str, Any]:
    """
    Restore a previously exported JSON backup.
    Replaces the graph with the backup contents — see _restore.
    """
    repo = get_repository()

    try:
        raw = await file.read()
        data = json.loads(raw)
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise HTTPException(status_code=400, detail=f"Invalid JSON file: {exc}")

    if "nodes" not in data or "edges" not in data:
        raise HTTPException(status_code=400, detail="Invalid backup format: missing 'nodes' or 'edges'.")

    return await _restore(repo, data)


# ── Snapshots ─────────────────────────────────────────────────────────────────

@router.get("/snapshots", dependencies=[Depends(require_admin)])
async def list_snapshots() -> list[dict[str, Any]]:
    """List all saved snapshots."""
    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
    snapshots = []
    for f in sorted(SNAPSHOT_DIR.glob("*.json"), reverse=True):
        try:
            meta = json.loads(f.read_text())
            snapshots.append({
                "filename": f.name,
                "label": meta.get("label", f.stem),
                "created_at": meta.get("exported_at", ""),
                "node_count": len(meta.get("nodes", [])),
                "edge_count": len(meta.get("edges", [])),
            })
        except Exception:
            continue
    return snapshots


@router.post("/snapshots", dependencies=[Depends(require_admin)])
async def create_snapshot(
    label: str = Query(..., min_length=1, max_length=100, description="Descriptive label for the snapshot"),
) -> dict[str, Any]:
    """Create a versioned snapshot of the current database state."""
    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
    repo = get_repository()
    data = await _dump_all(repo)
    data["label"] = label

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"snapshot_{timestamp}.json"
    filepath = SNAPSHOT_DIR / filename
    filepath.write_text(json.dumps(data, ensure_ascii=False, indent=2))

    return {
        "filename": filename,
        "label": label,
        "created_at": data["exported_at"],
        "node_count": len(data["nodes"]),
        "edge_count": len(data["edges"]),
    }


@router.post("/snapshots/{filename}/restore", dependencies=[Depends(require_admin)])
async def restore_snapshot(filename: str) -> dict[str, Any]:
    """Restore a previously created snapshot."""
    filepath = SNAPSHOT_DIR / filename
    if not filepath.is_file():
        raise HTTPException(status_code=404, detail="Snapshot not found.")

    data = json.loads(filepath.read_text())
    return await _restore(get_repository(), data)


@router.delete("/snapshots/{filename}", dependencies=[Depends(require_admin)])
async def delete_snapshot(filename: str) -> dict[str, str]:
    """Delete a snapshot file."""
    filepath = SNAPSHOT_DIR / filename
    if not filepath.is_file():
        raise HTTPException(status_code=404, detail="Snapshot not found.")
    filepath.unlink()
    return {"message": "Snapshot deleted."}
