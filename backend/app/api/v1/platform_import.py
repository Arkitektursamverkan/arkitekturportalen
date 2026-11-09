"""Import from the Integration Platform — fetch data and upsert nodes with field mapping."""
from __future__ import annotations

import os
from typing import Any

import httpx
import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from app.api.v1.sync import is_masked, stored_profile
from app.dal.graph_repository import GraphRepository
from app.dependencies import get_repository, require_admin, require_user
from app.domain_lists import CUSTOM_TYPE, LIST_KEY, sync_target
from app.domain_lists import parse as parse_lists
from app.internal_url import api_base
from app.schemas.common import ExternalSource, NodeType
from app.schemas.node import NodeCreate
from app.services import org_settings

log = structlog.get_logger(__name__)

router = APIRouter(prefix="/import/platform", tags=["platform-import"])

# A full URL, or the internal host:port a platform such as Render gives.
PLATFORM_URL = api_base(os.environ.get("INTEGRATION_PLATFORM_URL"))


class _PlatformTarget(BaseModel):
    """Base for requests aimed at the platform: an empty URL means the
    installation's own INTEGRATION_PLATFORM_URL."""

    platform_url: str = Field(default="", validate_default=True, description="Integration Platform API base URL")

    @field_validator("platform_url")
    @classmethod
    def _installation_default(cls, v: str) -> str:
        url = (v.strip() or PLATFORM_URL).rstrip("/")
        if not url:
            raise ValueError("Ange Integrationsplattformens adress – INTEGRATION_PLATFORM_URL är inte satt")
        return url


# ── Schemas ───────────────────────────────────────────────────────────────────

class PlatformSourceInfo(BaseModel):
    flow_id: str
    flow_name: str
    connector_type: str
    record_count: int
    last_sync: str | None
    status: str


class FieldMapping(BaseModel):
    source_field: str = Field(..., description="Field name from the Integration Platform record")
    target: str = Field(..., description="EA target: 'name', 'description', or 'attr:<attribute_name>'")


class PlatformImportRequest(_PlatformTarget):
    platform_api_key: str = Field(..., description="API key for the Integration Platform")
    flow_id: str = Field(..., description="Flow ID to import from")
    node_type: str = Field(..., description="EA node type: Process, Application, etc.")
    external_source_label: str = Field(default="PLATFORM", description="Label for tracking the source")
    mappings: list[FieldMapping] = Field(..., description="Field mappings from platform fields to EA fields")


class PlatformImportResult(BaseModel):
    source: str
    flow_name: str
    total: int
    created: int
    updated: int
    errors: list[str]


# ── Helper: fetch from Integration Platform ──────────────────────────────────

async def _fetch_platform_records(url: str, api_key: str, flow_id: str) -> list[dict]:
    """Fetch all records from the Integration Platform Data API."""
    all_records: list[dict] = []
    page = 1
    async with httpx.AsyncClient(timeout=30.0) as client:
        while True:
            resp = await client.get(
                f"{url}/data/{flow_id}/records",
                headers={"X-Api-Key": api_key},
                params={"page": page, "page_size": 500},
            )
            if resp.status_code != 200:
                raise ValueError(f"Platform API error ({resp.status_code}): {resp.text[:300]}")
            data = resp.json()
            records = data.get("records", [])
            all_records.extend(records)
            if page * data.get("page_size", 500) >= data.get("total", 0):
                break
            page += 1
    return all_records


def _apply_mapping(record_data: dict, mappings: list[FieldMapping]) -> dict[str, Any]:
    """Apply field mappings to a platform record, producing EA node fields."""
    name = ""
    description = None
    attributes: dict[str, Any] = {}

    for m in mappings:
        value = record_data.get(m.source_field)
        if value is None:
            continue
        if m.target == "name":
            name = str(value)
        elif m.target == "description":
            description = str(value)
        elif m.target.startswith("attr:"):
            attr_name = m.target[5:]
            attributes[attr_name] = value

    return {"name": name, "description": description, "attributes": attributes}


# ── Endpoints ─────────────────────────────────────────────────────────────────

class PlatformConnectionInfo(_PlatformTarget):
    platform_api_key: str = Field(...)


@router.post("/sources", response_model=list[PlatformSourceInfo], dependencies=[Depends(require_admin)])
async def list_platform_sources(body: PlatformConnectionInfo):
    """List available data sources from the Integration Platform."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{body.platform_url}/data/sources",
                headers={"X-Api-Key": body.platform_api_key},
            )
            if resp.status_code != 200:
                raise HTTPException(status_code=resp.status_code, detail=f"Platform API error: {resp.text[:300]}")
            return resp.json()
    except httpx.ConnectError:
        raise HTTPException(status_code=502, detail=f"Cannot connect to Integration Platform at {body.platform_url}")


class PlatformFieldsRequest(_PlatformTarget):
    platform_api_key: str = Field(...)
    flow_id: str = Field(...)


@router.post("/sources/fields", dependencies=[Depends(require_admin)])
async def get_source_fields(body: PlatformFieldsRequest):
    """Get the available fields from a platform data source (samples the first page)."""
    # A sync profile's key reaches the browser masked: use the stored profile
    # (its key and address) instead, so the key is never sent anywhere else.
    if is_masked(body.platform_api_key):
        profile = stored_profile(body.flow_id)
        if not profile or not profile.platform_api_key:
            raise HTTPException(status_code=404, detail="Ingen sparad nyckel för flödet")
        body = PlatformFieldsRequest(
            platform_url=profile.platform_url, platform_api_key=profile.platform_api_key, flow_id=body.flow_id,
        )
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{body.platform_url}/data/{body.flow_id}/records",
                headers={"X-Api-Key": body.platform_api_key},
                params={"page": 1, "page_size": 10},
            )
            if resp.status_code != 200:
                raise HTTPException(status_code=resp.status_code, detail=f"Platform API error: {resp.text[:300]}")

            records = resp.json().get("records", [])
            # Collect all unique field names from the data
            field_names: dict[str, str] = {}  # field_name → sample_value
            for rec in records:
                data = rec.get("data", {})
                for key, val in data.items():
                    if key not in field_names and val is not None:
                        field_names[key] = str(val)[:100]

            return {
                "fields": [
                    {"name": k, "sample": v}
                    for k, v in sorted(field_names.items())
                ],
                "record_count": resp.json().get("total", 0),
            }
    except httpx.ConnectError:
        raise HTTPException(status_code=502, detail=f"Cannot connect to Integration Platform at {body.platform_url}")


@router.get("/node-types", dependencies=[Depends(require_user)])
async def get_node_types():
    """List available EA node types with their core and suggested attribute fields."""
    own_lists = [
        {
            "type": f"{CUSTOM_TYPE}:{c.key}",
            "label": c.name,
            "core_fields": [
                {"target": "name", "label": "Name", "required": True},
                {"target": "description", "label": "Description"},
            ],
            "suggested_attributes": [{"target": f"attr:{f.key}", "label": f.label} for f in c.fields],
        }
        for c in parse_lists(org_settings.domain_lists()).custom
    ]
    return {
        "node_types": [*own_lists,
            {
                "type": "Application",
                "core_fields": [
                    {"target": "name", "label": "Name", "required": True},
                    {"target": "description", "label": "Description"},
                ],
                "suggested_attributes": [
                    {"target": "attr:leverantör", "label": "Leverantör"},
                    {"target": "attr:kategori", "label": "Kategori"},
                    {"target": "attr:avdelning", "label": "Avdelning/enhet"},
                    {"target": "attr:systemägare", "label": "Systemägare"},
                    {"target": "attr:systemförvaltare", "label": "Systemförvaltare"},
                    {"target": "attr:systemadministratör", "label": "Systemadministratör"},
                    {"target": "attr:driftform", "label": "Driftform"},
                    {"target": "attr:status", "label": "Status"},
                ],
            },
            {
                "type": "Process",
                "core_fields": [
                    {"target": "name", "label": "Name", "required": True},
                    {"target": "description", "label": "Description"},
                ],
                "suggested_attributes": [
                    {"target": "attr:prefix", "label": "Prefix (hierarki-position)"},
                    {"target": "attr:parent_prefix", "label": "Förälderns prefix"},
                    {"target": "attr:parent_name", "label": "Huvudprocess (namn)"},
                    {"target": "attr:ägare", "label": "Ägare"},
                    {"target": "attr:kategori", "label": "Kategori"},
                    {"target": "attr:frekvens", "label": "Frekvens"},
                    {"target": "attr:status", "label": "Status"},
                ],
            },
            {
                "type": "InformationObject",
                "core_fields": [
                    {"target": "name", "label": "Name", "required": True},
                    {"target": "description", "label": "Description"},
                ],
                "suggested_attributes": [
                    {"target": "attr:definition", "label": "Definition"},
                    {"target": "attr:data_owner", "label": "Data owner"},
                    {"target": "attr:klassificering", "label": "Klassificering"},
                ],
            },
            {
                "type": "InformationSource",
                "core_fields": [
                    {"target": "name", "label": "Name", "required": True},
                    {"target": "description", "label": "Description"},
                ],
                "suggested_attributes": [
                    {"target": "attr:system", "label": "System"},
                    {"target": "attr:typ", "label": "Typ"},
                ],
            },
            {
                "type": "TechnologyComponent",
                "core_fields": [
                    {"target": "name", "label": "Name", "required": True},
                    {"target": "description", "label": "Description"},
                ],
                "suggested_attributes": [
                    {"target": "attr:leverantör", "label": "Leverantör"},
                    {"target": "attr:komponenttyp", "label": "Komponenttyp"},
                    {"target": "attr:hosting", "label": "Hosting"},
                    {"target": "attr:plattform", "label": "Plattform"},
                ],
            },
        ]
    }


@router.post("/execute", response_model=PlatformImportResult, dependencies=[Depends(require_admin)])
async def execute_platform_import(
    body: PlatformImportRequest,
    repo: GraphRepository = Depends(get_repository),
):
    """Import records from the Integration Platform into EA nodes."""
    # Validate node type
    try:
        node_type, list_key = sync_target(body.node_type)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid node_type: {body.node_type}")
    if list_key and not any(c.key == list_key for c in parse_lists(org_settings.domain_lists()).custom):
        raise HTTPException(status_code=400, detail=f"Listan {list_key} finns inte")

    # Check that 'name' mapping exists
    has_name = any(m.target == "name" for m in body.mappings)
    if not has_name:
        raise HTTPException(status_code=400, detail="At least one mapping must target 'name'")

    # Determine external source
    source_map = {
        "sharepoint": ExternalSource.SHAREPOINT,
        "2c8": ExternalSource.TWO_C8,
    }
    external_source = source_map.get(body.external_source_label.lower(), ExternalSource.NONE)
    # Use a generic label for platform imports
    external_source_str = body.external_source_label.upper()

    # Fetch records from the platform
    try:
        platform_records = await _fetch_platform_records(body.platform_url, body.platform_api_key, body.flow_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch from Integration Platform: {e}")

    # Get flow name for the result
    flow_name = body.flow_id
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                f"{body.platform_url}/data/sources",
                headers={"X-Api-Key": body.platform_api_key},
            )
            if resp.status_code == 200:
                for src in resp.json():
                    if src.get("flow_id") == body.flow_id:
                        flow_name = src.get("flow_name", body.flow_id)
                        break
    except Exception:
        pass

    # Import records
    created = updated = 0
    errors: list[str] = []

    for rec in platform_records:
        record_data = rec.get("data", {})
        external_id = rec.get("external_id", record_data.get("external_id", ""))
        # Namespace by flow_id so records from different flows can't collide on the
        # (external_source, external_id) unique key — each SharePoint list numbers its
        # rows 1, 2, 3..., so without this prefix Teknikkomponenter/1 would overwrite
        # Systemlistan/1 in EA.
        namespaced_id = f"{body.flow_id}:{external_id}"

        try:
            mapped = _apply_mapping(record_data, body.mappings)
            if not mapped["name"]:
                errors.append(f"Record {external_id}: name is empty after mapping")
                continue

            node_data = NodeCreate(
                type=node_type,
                name=mapped["name"],
                description=mapped["description"],
                external_source=external_source,
                external_id=namespaced_id,
                attributes={**mapped["attributes"], **({LIST_KEY: list_key} if list_key else {})},
            )

            _, was_created = await repo.upsert_node_by_external(
                external_source_str,
                namespaced_id,
                node_data,
            )
            if was_created:
                created += 1
            else:
                updated += 1

        except Exception as exc:
            log.error("platform.import.error", external_id=external_id, error=str(exc))
            errors.append(f"{external_id}: {exc}")

    # Post-import: resolve parent_name → parent_id for Process nodes
    if node_type == NodeType.PROCESS:
        try:
            all_processes = await repo.list_nodes(node_type="Process")
            name_to_id: dict[str, str] = {p.name: str(p.id) for p in all_processes}
            for proc in all_processes:
                parent_name = proc.attributes.get("parent_name", "")
                if parent_name and "parent_id" not in proc.attributes:
                    parent_id = name_to_id.get(parent_name)
                    if parent_id:
                        new_attrs = {**proc.attributes, "parent_id": parent_id}
                        del new_attrs["parent_name"]
                        from app.schemas.node import NodeUpdate
                        await repo.update_node(proc.id, NodeUpdate(attributes=new_attrs))
        except Exception as exc:
            log.warning("platform.import.parent_resolve_error", error=str(exc))

    log.info("platform.import.done", flow=flow_name, node_type=node_type.value,
             created=created, updated=updated, errors=len(errors))

    return PlatformImportResult(
        source=external_source_str,
        flow_name=flow_name,
        total=len(platform_records),
        created=created,
        updated=updated,
        errors=errors,
    )
