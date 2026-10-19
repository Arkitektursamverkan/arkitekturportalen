"""One-shot seed endpoint — populates the database with a full demo dataset.

POST /api/v1/seed   (requires X-Api-Key)

Steps:
  1. Import mock SharePoint systems (Applications)
  2. Import mock 2C8 processes (Processes)
  3. Create owned nodes: InformationObjects, InformationSources, TechComponents
  4. Create all relationships
"""
from __future__ import annotations

import json
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies import get_repository, require_admin
from app.schemas.common import EdgeType, NodeType
from app.schemas.edge import EdgeCreate
from app.schemas.node import NodeCreate
from app.services.import_service import ImportService

router = APIRouter(prefix="/seed", tags=["seed"])

SEED_EXTRA_PATH = Path(__file__).parent.parent.parent.parent / "seed" / "seed_extra.json"


@router.post("", dependencies=[Depends(require_admin)])
async def seed_database() -> dict:
    """Idempotent full-dataset seed for the PoC demo.

    Refuses to run once the database holds real data — this endpoint
    imports fictional mock nodes (fake SAP/Workday/Salesforce etc.) that
    would mix with an installation's real data. Safe to run only against an
    empty database, e.g. a fresh dev/test instance.
    """
    repo = get_repository()

    existing = await repo.list_nodes(limit=1)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Databasen innehåller redan data — demodata-import är inaktiverad "
                "för att inte förorena skarp data."
            ),
        )

    svc = ImportService(repo)

    # 1. Import external nodes
    sp = await svc.import_sharepoint(mode="mock")
    c8 = await svc.import_2c8(mode="mock")

    # 2. Build a name→UUID lookup for all nodes (needed to create edges)
    all_nodes = await repo.list_nodes(limit=1000)
    name_to_id: dict[str, UUID] = {n.name: n.id for n in all_nodes}

    if not SEED_EXTRA_PATH.exists():
        return {
            "sharepoint": {"created": sp.created, "updated": sp.updated},
            "2c8": {"created": c8.created, "updated": c8.updated},
            "extra": "seed_extra.json not found — skipped",
        }

    with SEED_EXTRA_PATH.open() as f:
        extra = json.load(f)

    # 3. Create owned nodes
    owned_created = 0
    for node_def in extra.get("nodes", []):
        if name_to_id.get(node_def["name"]):
            continue  # already present (idempotent)
        node = await repo.create_node(NodeCreate(
            type=NodeType(node_def["type"]),
            name=node_def["name"],
            description=node_def.get("description"),
            attributes=node_def.get("attributes", {}),
        ))
        name_to_id[node.name] = node.id
        owned_created += 1

    # 4. Create edges
    # Refresh lookup after node creation
    all_nodes = await repo.list_nodes(limit=1000)
    name_to_id = {n.name: n.id for n in all_nodes}

    existing_edges = await repo.list_edges()
    edge_set = {(str(e.source_id), str(e.target_id), e.type.value) for e in existing_edges}

    edges_created = 0
    for edge_def in extra.get("edges", []):
        src_id = name_to_id.get(edge_def["source"])
        tgt_id = name_to_id.get(edge_def["target"])
        if not src_id or not tgt_id:
            continue
        key = (str(src_id), str(tgt_id), edge_def["type"])
        if key in edge_set:
            continue
        await repo.create_edge(EdgeCreate(
            source_id=src_id,
            target_id=tgt_id,
            type=EdgeType(edge_def["type"]),
            attributes=edge_def.get("attributes", {}),
        ))
        edge_set.add(key)
        edges_created += 1

    return {
        "sharepoint": {"created": sp.created, "updated": sp.updated},
        "2c8": {"created": c8.created, "updated": c8.updated},
        "owned_nodes_created": owned_created,
        "edges_created": edges_created,
    }
