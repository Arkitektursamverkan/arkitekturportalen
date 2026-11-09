"""Webhook-triggered sync — receives notifications from the Integration Platform
and automatically pulls + upserts data.

Sync profiles are stored in a JSON file so they persist across restarts.
Each profile maps an Integration Platform flow to EA node type + field mappings.
"""
from __future__ import annotations

import hmac
import json
import os
from pathlib import Path
from typing import Any

import httpx
import structlog
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app.config import settings
from app.dal.graph_repository import GraphRepository
from app.dal.postgres_repository import SYNC_AUDIT_USER
from app.dependencies import get_repository, require_admin
from app.domain_lists import LIST_KEY, sync_target
from app.domain_lists import parse as parse_lists
from app.internal_url import api_base
from app.schemas.common import ExternalSource, NodeType
from app.schemas.node import NodeCreate, NodeUpdate
from app.services import org_settings

log = structlog.get_logger(__name__)

router = APIRouter(prefix="/sync", tags=["sync"])

SYNC_PROFILES_PATH = Path(os.environ.get("SYNC_PROFILES_PATH", "/app/sync_data/sync_profiles.json"))

# A full URL, or the internal host:port a platform such as Render gives.
PLATFORM_URL = api_base(os.environ.get("INTEGRATION_PLATFORM_URL"))
# The admin key reads too, when no separate read key is set (as in arkflows).
PLATFORM_API_KEY = (
    os.environ.get("INTEGRATION_PLATFORM_API_KEY")
    or os.environ.get("INTEGRATION_PLATFORM_ADMIN_KEY", "")
)


# ── Sync profile persistence ────────────────────────────────────────────────

class SyncProfile(BaseModel):
    flow_id: str
    flow_name: str = ""
    node_type: str  # Process, Application, etc.
    external_source_label: str = "PLATFORM"
    platform_url: str = ""
    platform_api_key: str = ""
    mappings: list[dict] = Field(default_factory=list)  # [{source_field, target}]
    enabled: bool = True


def _load_profiles() -> dict[str, SyncProfile]:
    if SYNC_PROFILES_PATH.exists():
        try:
            data = json.loads(SYNC_PROFILES_PATH.read_text())
            return {k: SyncProfile(**v) for k, v in data.items()}
        except Exception:
            pass
    return {}


def _save_profiles(profiles: dict[str, SyncProfile]) -> None:
    SYNC_PROFILES_PATH.parent.mkdir(parents=True, exist_ok=True)
    SYNC_PROFILES_PATH.write_text(
        json.dumps({k: v.model_dump() for k, v in profiles.items()}, indent=2)
    )


# ── Sync logic ───────────────────────────────────────────────────────────────

def _resolve_parent(
    attributes: dict[str, Any],
    prefix_to_id: dict[str, str],
    name_to_id: dict[str, str],
) -> str | None:
    """Parent process id for parent_prefix (canonical) or parent_name (fallback)."""
    parent_prefix = attributes.get("parent_prefix", "")
    if isinstance(parent_prefix, str) and parent_prefix and parent_prefix in prefix_to_id:
        return prefix_to_id[parent_prefix]
    parent_name = attributes.get("parent_name", "")
    if isinstance(parent_name, str) and parent_name:
        return name_to_id.get(parent_name)
    return None


def _with_parent(attributes: dict[str, Any], parent_id: str) -> dict[str, Any]:
    # Drop the now-redundant pointer fields so they don't leak into the UI as
    # visible attributes.
    out = {**attributes, "parent_id": parent_id}
    out.pop("parent_name", None)
    out.pop("parent_prefix", None)
    return out


async def _run_sync(profile: SyncProfile, repo: GraphRepository) -> dict[str, Any]:
    """Pull data from Integration Platform and upsert into EA."""
    url = profile.platform_url or PLATFORM_URL
    api_key = profile.platform_api_key or PLATFORM_API_KEY

    if not url:
        raise ValueError("No URL configured for Integration Platform (INTEGRATION_PLATFORM_URL)")
    if not api_key:
        raise ValueError("No API key configured for Integration Platform")

    # Fetch all records
    all_records: list[dict] = []
    page = 1
    async with httpx.AsyncClient(timeout=30.0) as client:
        while True:
            resp = await client.get(
                f"{url}/data/{profile.flow_id}/records",
                headers={"X-Api-Key": api_key},
                params={"page": page, "page_size": 500},
            )
            if resp.status_code != 200:
                raise ValueError(f"Platform API error ({resp.status_code}): {resp.text[:300]}")
            data = resp.json()
            all_records.extend(data.get("records", []))
            if page * data.get("page_size", 500) >= data.get("total", 0):
                break
            page += 1

    # Validate node type
    node_type, list_key = sync_target(profile.node_type)
    if list_key and not any(c.key == list_key for c in parse_lists(org_settings.domain_lists()).custom):
        raise ValueError(f"Listan {list_key} finns inte längre")
    source_map = {"sharepoint": ExternalSource.SHAREPOINT, "2c8": ExternalSource.TWO_C8}
    external_source = source_map.get(profile.external_source_label.lower(), ExternalSource.NONE)
    external_source_str = profile.external_source_label.upper()

    # Processes point at their parent by prefix or name, which the post-import
    # step turns into parent_id. Resolve against what is already stored before
    # upserting too, so an unchanged process is stored exactly as it was —
    # otherwise every sync wipes parent_id and puts it back, two audit rows each.
    prefix_to_id: dict[str, str] = {}
    name_to_id: dict[str, str] = {}
    container_id: str | None = None
    if node_type == NodeType.PROCESS:
        existing_processes = await repo.list_nodes(node_type="Process", limit=10000)
        prefix_to_id = {
            p.attributes["prefix"]: str(p.id)
            for p in existing_processes
            if isinstance(p.attributes.get("prefix"), str) and p.attributes["prefix"]
        }
        name_to_id = {p.name: str(p.id) for p in existing_processes}
        # Prefix-less 2C8 processes end up under this flow's container node.
        container_id = next(
            (str(p.id) for p in existing_processes
             if p.external_id == f"{profile.flow_id}:__no_prefix__"),
            None,
        )

    # Import
    created = updated = 0
    errors: list[str] = []

    for rec in all_records:
        record_data = rec.get("data", {})
        external_id = rec.get("external_id", record_data.get("external_id", ""))
        # See platform_import.execute for why we namespace by flow_id.
        namespaced_id = f"{profile.flow_id}:{external_id}"

        try:
            # Apply mappings
            name = ""
            description = None
            attributes: dict[str, Any] = {}
            for m in profile.mappings:
                value = record_data.get(m["source_field"])
                if value is None:
                    continue
                target = m["target"]
                if target == "name":
                    name = str(value)
                elif target == "description":
                    description = str(value)
                elif target.startswith("attr:"):
                    attributes[target[5:]] = value

            if not name:
                continue

            if node_type == NodeType.PROCESS:
                parent_id = _resolve_parent(attributes, prefix_to_id, name_to_id)
                if (not parent_id and container_id and external_source == ExternalSource.TWO_C8
                        and attributes.get("prefix") == ""):
                    parent_id = container_id
                if parent_id:
                    attributes = _with_parent(attributes, parent_id)

            if list_key:
                attributes[LIST_KEY] = list_key

            node_data = NodeCreate(
                type=node_type,
                name=name,
                description=description,
                external_source=external_source,
                external_id=namespaced_id,
                attributes=attributes,
            )

            _, was_created = await repo.upsert_node_by_external(
                external_source_str, namespaced_id, node_data,
            )
            if was_created:
                created += 1
            else:
                updated += 1

        except Exception as exc:
            errors.append(f"{external_id}: {exc}")

    # Post-import: resolve parent_id for Process nodes by linking to other nodes.
    # Prefer prefix-based linking (canonical, unaffected by name transformations)
    # and fall back to name-based linking for legacy / CSV-style sources.
    # This runs BEFORE pruning so the no-prefix container can be added to the
    # synced set and not get immediately archived.
    container_ext_id: str | None = None
    if node_type == NodeType.PROCESS:
        try:
            all_processes = await repo.list_nodes(node_type="Process", limit=10000)
            prefix_to_id = {
                p.attributes["prefix"]: str(p.id)
                for p in all_processes
                if isinstance(p.attributes.get("prefix"), str) and p.attributes["prefix"]
            }
            name_to_id = {p.name: str(p.id) for p in all_processes}
            for proc in all_processes:
                if "parent_id" in proc.attributes:
                    continue
                parent_id = _resolve_parent(proc.attributes, prefix_to_id, name_to_id)
                if parent_id:
                    await repo.update_node(proc.id, NodeUpdate(attributes=_with_parent(proc.attributes, parent_id)), user_name=SYNC_AUDIT_USER)

            # Group prefix-less processes from this flow under a container node so
            # they appear in the process tree rather than being invisible orphans.
            if external_source == ExternalSource.TWO_C8:
                no_prefix_container = f"{profile.flow_id}:__no_prefix__"
                orphaned = [
                    p for p in all_processes
                    if "parent_id" not in p.attributes
                    and p.attributes.get("prefix") == ""
                    and p.external_id
                    and p.external_id.startswith(f"{profile.flow_id}:")
                    and p.external_id != no_prefix_container
                ]
                if orphaned:
                    container_ext_id = no_prefix_container
                    container_node, _ = await repo.upsert_node_by_external(
                        external_source_str,
                        container_ext_id,
                        NodeCreate(
                            type=NodeType.PROCESS,
                            name="Processer utan prefix",
                            external_source=external_source,
                            external_id=container_ext_id,
                            attributes={},
                        ),
                    )
                    cid = str(container_node.id)
                    for proc in orphaned:
                        await repo.update_node(proc.id, NodeUpdate(attributes=_with_parent(proc.attributes, cid)), user_name=SYNC_AUDIT_USER)
                    log.info("sync.no_prefix_container", flow_id=profile.flow_id, count=len(orphaned))
        except Exception as exc:
            log.warning("sync.parent_resolve_error", error=str(exc))

    # Prune: archive nodes that we upserted in previous syncs but are no longer in the source.
    # We track which external_ids we touched in this run. For nodes NOT in the current batch,
    # we only archive if their external_id is in the set of IDs the platform has ever sent
    # (approximated by: the node was last_synced, meaning it was created/updated by upsert).
    synced_external_ids = set()
    for rec in all_records:
        record_data = rec.get("data", {})
        ext_id = rec.get("external_id", record_data.get("external_id", ""))
        if ext_id:
            synced_external_ids.add(f"{profile.flow_id}:{ext_id}")
    # Keep the container alive as long as it was needed this run.
    if container_ext_id:
        synced_external_ids.add(container_ext_id)

    archived_count = 0
    if synced_external_ids:
        existing_nodes = await repo.list_nodes(
            node_type=node_type.value,
            external_source=external_source_str,
            limit=10000,
        )
        for node in existing_nodes:
            # Own lists share a type: another list's objects aren't this flow's to prune.
            if list_key and (node.attributes or {}).get(LIST_KEY) != list_key:
                continue
            # Only prune nodes that have last_synced_at set (meaning they were created via
            # upsert_node_by_external, not via seed or manual creation)
            if (node.external_id
                    and node.external_id not in synced_external_ids
                    and not node.archived
                    and node.last_synced_at is not None):
                await repo.update_node(node.id, NodeUpdate(archived=True), user_name=SYNC_AUDIT_USER)
                archived_count += 1
        if archived_count:
            log.info("sync.archived", flow_id=profile.flow_id, count=archived_count)

    log.info("sync.done", flow_id=profile.flow_id, node_type=profile.node_type,
             created=created, updated=updated, archived=archived_count, errors=len(errors))

    return {
        "flow_id": profile.flow_id,
        "node_type": profile.node_type,
        "total": len(all_records),
        "created": created,
        "updated": updated,
        "archived": archived_count,
        "errors": errors[:10],
    }


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/webhook")
async def receive_sync_webhook(
    request: Request,
    repo: GraphRepository = Depends(get_repository),
):
    """Receive a post-execution webhook from the Integration Platform and trigger sync."""
    secret = settings.SYNC_WEBHOOK_SECRET
    if not secret:
        raise HTTPException(status_code=503, detail="Webhooken är avstängd: SYNC_WEBHOOK_SECRET är inte satt")
    sent = request.headers.get("X-Webhook-Secret", "")
    if not hmac.compare_digest(sent.encode(), secret.encode()):
        raise HTTPException(status_code=401, detail="Fel eller saknad webhook-hemlighet")

    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    flow_id = payload.get("flow_id")
    if not flow_id:
        raise HTTPException(status_code=400, detail="Missing flow_id in payload")

    event = payload.get("event", "")
    if event != "flow.execution.success":
        return {"status": "ignored", "reason": f"Event type '{event}' is not a success event"}

    profiles = _load_profiles()
    profile = profiles.get(flow_id)
    if not profile:
        return {"status": "ignored", "reason": f"No sync profile for flow {flow_id}"}

    if not profile.enabled:
        return {"status": "ignored", "reason": "Sync profile is disabled"}

    log.info("sync.webhook_received", flow_id=flow_id, flow_name=payload.get("flow_name", ""))

    try:
        result = await _run_sync(profile, repo)
        return {"status": "synced", **result}
    except Exception as exc:
        log.error("sync.error", flow_id=flow_id, error=str(exc))
        raise HTTPException(status_code=500, detail=f"Sync failed: {exc}")


# ── Profile CRUD ─────────────────────────────────────────────────────────────

@router.get("/profiles", dependencies=[Depends(require_admin)])
async def list_profiles():
    """List all sync profiles."""
    profiles = _load_profiles()
    return [{"flow_id": k, **v.model_dump()} for k, v in profiles.items()]


@router.post("/profiles", dependencies=[Depends(require_admin)])
async def create_or_update_profile(profile: SyncProfile):
    """Create or update a sync profile for a flow."""
    profiles = _load_profiles()
    profiles[profile.flow_id] = profile
    _save_profiles(profiles)
    return {"status": "ok", "flow_id": profile.flow_id}


@router.delete("/profiles/{flow_id}", dependencies=[Depends(require_admin)])
async def delete_profile(flow_id: str):
    """Delete a sync profile."""
    profiles = _load_profiles()
    if flow_id not in profiles:
        raise HTTPException(status_code=404, detail="Profile not found")
    del profiles[flow_id]
    _save_profiles(profiles)
    return {"status": "deleted"}


@router.post("/profiles/{flow_id}/run", dependencies=[Depends(require_admin)])
async def manual_sync(flow_id: str, repo: GraphRepository = Depends(get_repository)):
    """Manually trigger a sync for a profile."""
    profiles = _load_profiles()
    profile = profiles.get(flow_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    result = await _run_sync(profile, repo)
    return result
