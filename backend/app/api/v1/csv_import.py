"""CSV import endpoints — template download + file upload for all node types."""
from __future__ import annotations

import csv
import io
import uuid
from dataclasses import dataclass, field

import structlog
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from app.access import filter_nodes, get_optional_user
from app.auth import CurrentUser
from app.csv_safety import safe_writer, unescape_cell
from app.dal.graph_repository import GraphRepository
from app.dependencies import get_repository, require_admin
from app.schemas.common import EdgeType, ExternalSource, NodeType
from app.schemas.edge import EdgeCreate
from app.schemas.node import NodeCreate, NodeUpdate

log = structlog.get_logger(__name__)

router = APIRouter(prefix="/import/csv", tags=["csv-import"])


# ── Entity configuration ───────────────────────────────────────────────────────

@dataclass
class EntityConfig:
    node_type: NodeType
    columns: list[str]           # ordered CSV columns (starts with name, description)
    attr_map: dict[str, str]     # csv_column → Swedish attribute key
    filename: str                # suggested download filename
    template_rows: list[list[str]] = field(default_factory=list)


ENTITY_CONFIGS: dict[str, EntityConfig] = {
    "processes": EntityConfig(
        node_type=NodeType.PROCESS,
        columns=["name", "description", "owner", "category", "frequency", "parent_id"],
        attr_map={"owner": "ägare", "category": "kategori", "frequency": "frekvens"},
        filename="processer_mall.csv",
        template_rows=[
            ["Ekonomiprocesser", "Övergripande ekonomiprocess", "Ekonomi", "Ekonomi", "", ""],
            ["Fakturahantering", "Ta emot, granska och bokföra leverantörsfakturor", "Ekonomi", "Leverantörsreskontra", "dagligen", "Ekonomiprocesser"],
            ["Lönekörning", "Månadsvis löneberäkning och utbetalning", "HR", "Lön", "månadsvis", "Ekonomiprocesser"],
            ["Min nya process", "Beskriv processen här", "IT", "ITSM", "löpande", ""],
        ],
    ),
    "applications": EntityConfig(
        node_type=NodeType.APPLICATION,
        columns=["name", "description", "vendor", "category", "application_owner", "business_owner", "lifecycle_stage", "hosting"],
        attr_map={"vendor": "leverantör", "category": "kategori", "application_owner": "application_owner", "business_owner": "business_owner", "lifecycle_stage": "lifecycle_stage", "hosting": "hosting"},
        filename="applikationer_mall.csv",
        template_rows=[
            ["SAP S/4HANA", "ERP-system för ekonomi och logistik", "SAP", "ERP", "IT-avdelningen", "Ekonomichef", "I drift", "OnPrem"],
            ["Workday", "HR och lönesystem", "Workday", "HCM", "HR-IT", "HR-chef", "I drift", "SaaS"],
            ["Min applikation", "Beskriv systemet här", "Leverantör", "Kategori", "Systemägare", "Verksamhetsägare", "I drift", "Cloud"],
        ],
    ),
    "information-objects": EntityConfig(
        node_type=NodeType.INFORMATION_OBJECT,
        columns=["name", "description", "definition", "data_owner", "classification", "domain"],
        attr_map={"definition": "definition", "data_owner": "data_owner", "classification": "klassificering", "domain": "domain"},
        filename="informationsobjekt_mall.csv",
        template_rows=[
            ["Faktura", "Leverantörsfaktura med betalningsinformation", "Dokument som specificerar belopp och betalningsvillkor", "Ekonomi", "Intern", "Ekonomi"],
            ["Medarbetarpost", "HR-data för anställda", "Samlad information om en anställds personuppgifter och anställning", "HR", "Konfidentiell", "HR"],
            ["Mitt informationsobjekt", "Beskriv objektet här", "Definition av objektet", "Dataägare", "Klassificering", "Domän"],
        ],
    ),
    "information-sources": EntityConfig(
        node_type=NodeType.INFORMATION_SOURCE,
        columns=["name", "description", "system", "source_type", "classification"],
        attr_map={"system": "system", "source_type": "typ", "classification": "klassificering"},
        filename="informationskallor_mall.csv",
        template_rows=[
            ["SAP FI-modul", "Finansmodul i SAP S/4HANA", "SAP S/4HANA", "Databas", "Intern"],
            ["Workday HR", "HR-data från Workday", "Workday", "API", "Konfidentiell"],
            ["Min informationskälla", "Beskriv källan här", "System", "Typ", "Klassificering"],
        ],
    ),
    "tech-components": EntityConfig(
        node_type=NodeType.TECHNOLOGY_COMPONENT,
        columns=["name", "description", "vendor", "component_type", "hosting", "platform", "version", "capacity", "technical_owner", "support_team", "maintenance_schedule", "security_classification"],
        attr_map={"vendor": "leverantör", "component_type": "komponenttyp", "hosting": "hosting", "platform": "plattform", "version": "version", "capacity": "kapacitet", "technical_owner": "teknisk_ägare", "support_team": "supportteam", "maintenance_schedule": "underhållsschema", "security_classification": "säkerhetsklassificering"},
        filename="teknikkomponenter_mall.csv",
        template_rows=[
            ["Azure SQL", "Hanterad relationsdatabas i Azure", "Microsoft", "Database", "Azure", "Azure Service", "v12", "S2 Standard", "IT-drift", "Infrastruktur", "Månadsvis", "Intern"],
            ["VMware-kluster", "Virtualiseringsplattform för servrar", "VMware", "Compute", "OnPrem", "ESXi 8.0", "8.0", "128 vCPU / 512 GB", "IT-drift", "Infrastruktur", "Kvartalsvis", "Intern"],
            ["Min teknikkomponent", "Beskriv komponenten här", "Leverantör", "Database", "OnPrem", "Linux", "", "", "Ägare", "Team", "", ""],
        ],
    ),
}


def _get_config(entity: str) -> EntityConfig:
    cfg = ENTITY_CONFIGS.get(entity)
    if not cfg:
        raise HTTPException(status_code=404, detail=f"Unknown entity type: '{entity}'. Valid: {', '.join(ENTITY_CONFIGS)}")
    return cfg


# ── CSV parsing ────────────────────────────────────────────────────────────────

def _parse_csv(content: bytes, cfg: EntityConfig) -> tuple[list[dict], list[str]]:
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    delimiter = _detect_delimiter(text)
    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)

    if not reader.fieldnames:
        return [], ["Filen verkar vara tom eller saknar rubrikrad."]

    fieldnames_norm = [f.strip().lower() for f in reader.fieldnames]

    if "name" not in fieldnames_norm:
        return [], [f"Obligatorisk kolumn 'name' saknas. Hittade: {', '.join(reader.fieldnames)}"]

    rows: list[dict] = []
    errors: list[str] = []

    for i, raw_row in enumerate(reader, start=2):
        row = {k.strip().lower(): unescape_cell((v or "").strip()).strip() for k, v in raw_row.items() if k}

        name = row.get("name", "")
        if not name:
            errors.append(f"Rad {i}: 'name' är obligatoriskt och får inte vara tomt.")
            continue

        parsed: dict = {
            "id": f"csv-{uuid.uuid4().hex[:8]}",
            "name": name,
            "description": row.get("description", ""),
        }
        # Extra entity-specific columns
        for col in cfg.columns:
            if col not in ("name", "description"):
                parsed[col] = row.get(col, "")

        rows.append(parsed)

    return rows, errors


# ── Unified CSV endpoints (must be before parameterized routes) ────────────────

def _all_attr_columns() -> list[str]:
    """Collect all unique attribute columns across all entity configs, preserving order."""
    seen: set[str] = set()
    cols: list[str] = []
    for cfg in ENTITY_CONFIGS.values():
        for col in cfg.columns:
            if col not in ("name", "description") and col not in seen:
                seen.add(col)
                cols.append(col)
    return cols


# Reverse mapping: Swedish attribute key → CSV column name (built from all entity configs)
_ATTR_TO_COL: dict[str, str] = {}
for _cfg in ENTITY_CONFIGS.values():
    for _csv_col, _attr_key in _cfg.attr_map.items():
        _ATTR_TO_COL[_attr_key] = _csv_col
        _ATTR_TO_COL[_csv_col] = _csv_col  # identity mapping for English keys


@router.get("/template/unified")
async def download_unified_template() -> StreamingResponse:
    """Return a unified CSV template with all node types + connections."""
    attr_cols = _all_attr_columns()
    header = ["type", "name", "description"] + attr_cols

    buf = io.StringIO()
    buf.write("# EA-applikation — Komplett import\n")
    buf.write("# Alla objekttyper och kopplingar i en fil\n\n")
    buf.write("[NODES]\n")
    writer = safe_writer(buf)
    writer.writerow(header)

    # Write example rows from each entity config
    for cfg in ENTITY_CONFIGS.values():
        for template_row in cfg.template_rows[:1]:  # first example row per type
            row_dict: dict[str, str] = {}
            row_dict["type"] = cfg.node_type.value
            # template_row matches cfg.columns order
            for i, col in enumerate(cfg.columns):
                if i < len(template_row):
                    row_dict[col] = template_row[i]
            csv_row = [row_dict.get("type", ""), row_dict.get("name", ""), row_dict.get("description", "")]
            for ac in attr_cols:
                csv_row.append(row_dict.get(ac, ""))
            writer.writerow(csv_row)

    buf.write("\n")
    buf.write("[CONNECTIONS]\n")
    writer.writerow(["source", "target", "type"])
    writer.writerow(["SAP S/4HANA", "Ekonomiprocesser", "SUPPORTS"])
    writer.writerow(["Workday", "Fakturahantering", "SUPPORTS"])
    writer.writerow(["Ekonomiprocesser", "Faktura", "USES"])
    writer.writerow(["SAP S/4HANA", "Faktura", "HANDLES"])
    writer.writerow(["SAP FI-modul", "Faktura", "REALIZES"])
    writer.writerow(["SAP S/4HANA", "SAP FI-modul", "CONTAINS"])
    writer.writerow(["SAP S/4HANA", "Azure SQL", "RUNS_ON"])
    writer.writerow(["SAP S/4HANA", "Workday", "INTEGRATES_WITH"])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=ea_komplett_mall.csv"},
    )


@router.get("/export")
async def export_csv(user: CurrentUser | None = Depends(get_optional_user)) -> StreamingResponse:
    """Export all nodes and connections as a unified CSV, re-importable via /import/csv/unified."""
    repo: GraphRepository = get_repository()
    # Connections are written only between exported nodes, so hiding a node
    # hides its connections too.
    nodes = await filter_nodes(user, await repo.list_nodes(limit=100_000))
    edges = await repo.list_edges()

    attr_cols = _all_attr_columns()
    header = ["type", "name", "description"] + attr_cols

    # Build a map from node UUID → name (for parent_id and connection resolution)
    id_to_name: dict[str, str] = {}
    for n in nodes:
        id_to_name[str(n.id)] = n.name

    buf = io.StringIO()
    buf.write("[NODES]\n")
    writer = safe_writer(buf)
    writer.writerow(header)

    for n in nodes:
        if n.archived:
            continue
        # Map attributes back to columns
        col_vals: dict[str, str] = {}
        for attr_key, attr_val in (n.attributes or {}).items():
            if attr_key == "parent_id":
                # Resolve parent UUID to name
                col_vals["parent_id"] = id_to_name.get(str(attr_val), str(attr_val))
                continue
            col = _ATTR_TO_COL.get(attr_key, attr_key)
            col_vals[col] = str(attr_val)

        node_type = n.type.value if hasattr(n.type, "value") else str(n.type)
        csv_row = [node_type, n.name, n.description or ""]
        for ac in attr_cols:
            csv_row.append(col_vals.get(ac, ""))
        writer.writerow(csv_row)

    buf.write("\n[CONNECTIONS]\n")
    writer.writerow(["source", "target", "type"])
    for e in edges:
        source_name = id_to_name.get(str(e.source_id))
        target_name = id_to_name.get(str(e.target_id))
        if source_name and target_name:
            edge_type = e.type.value if hasattr(e.type, "value") else str(e.type)
            writer.writerow([source_name, target_name, edge_type])

    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=ea_export.csv"},
    )


@router.post("/preview/unified", dependencies=[Depends(require_admin)])
async def preview_unified_csv(file: UploadFile = File(...)) -> dict:
    """Parse a unified CSV and return what would be imported."""
    content = await file.read()
    nodes, edges, errors = _parse_unified_csv(content)
    return {
        "nodes": [{"id": n["id"], "type": n["type"].value, "name": n["name"], "description": n["description"], **n["attributes"]} for n in nodes],
        "edges": edges,
        "errors": errors,
        "total_nodes": len(nodes),
        "total_edges": len(edges),
    }


@router.post("/unified", dependencies=[Depends(require_admin)])
async def import_unified_csv(file: UploadFile = File(...)) -> dict:
    """Import all node types + connections from a single CSV file."""
    content = await file.read()
    node_rows, edge_rows, parse_errors = _parse_unified_csv(content)

    repo: GraphRepository = get_repository()
    nodes_created = nodes_updated = edges_created = 0
    import_errors: list[str] = list(parse_errors)

    # Map csv-id → actual UUID for connection resolution
    id_map: dict[str, str] = {}

    # Phase 1: Import nodes
    for row in node_rows:
        try:
            node_data = NodeCreate(
                type=row["type"],
                name=row["name"],
                description=row["description"] or None,
                external_source=ExternalSource.CSV,
                external_id=row["id"],
                attributes=row["attributes"],
            )
            result, was_created = await repo.upsert_node_by_external(
                ExternalSource.CSV.value, row["id"], node_data,
            )
            id_map[row["id"]] = str(result.id)
            id_map[row["name"]] = str(result.id)  # also allow lookup by name
            if was_created:
                nodes_created += 1
            else:
                nodes_updated += 1
        except Exception as exc:
            log.error("unified.import.node.error", row_id=row.get("id"), error=str(exc))
            import_errors.append(f"Node '{row.get('name', '?')}': {exc}")

    # Also build name→id map from existing nodes for connections referencing pre-existing nodes
    existing_nodes = await repo.list_nodes(limit=10_000)
    for n in existing_nodes:
        if n.external_id and n.external_id not in id_map:
            id_map[n.external_id] = str(n.id)
        if n.name not in id_map:
            id_map[n.name] = str(n.id)

    # Phase 1b: Resolve parent_id references (for process hierarchy)
    for row in node_rows:
        parent_csv_id = row["attributes"].get("parent_id")
        if not parent_csv_id:
            continue
        resolved_uuid = id_map.get(parent_csv_id)
        if resolved_uuid and resolved_uuid != row["attributes"].get("parent_id"):
            # Update the node's parent_id attribute to the actual UUID
            try:
                node_uuid = id_map.get(row["id"])
                if node_uuid:
                    await repo.update_node(
                        uuid.UUID(node_uuid),
                        NodeUpdate(attributes={**row["attributes"], "parent_id": resolved_uuid}),
                    )
            except Exception as exc:
                log.warning("unified.import.parent_resolve.error", node=row.get("name"), error=str(exc))

    # Phase 2: Import edges
    for row in edge_rows:
        try:
            source_uuid = id_map.get(row["source"])
            target_uuid = id_map.get(row["target"])
            if not source_uuid:
                import_errors.append(f"Connection row {row.get('line', '?')}: source '{row['source']}' not found")
                continue
            if not target_uuid:
                import_errors.append(f"Connection row {row.get('line', '?')}: target '{row['target']}' not found")
                continue
            edge_data = EdgeCreate(
                source_id=uuid.UUID(source_uuid),
                target_id=uuid.UUID(target_uuid),
                type=EdgeType(row["type"]),
            )
            await repo.create_edge(edge_data)
            edges_created += 1
        except Exception as exc:
            log.error("unified.import.edge.error", source=row.get("source"), target=row.get("target"), error=str(exc))
            import_errors.append(f"Connection '{row.get('source')}' → '{row.get('target')}': {exc}")

    log.info("unified.import.done", nodes_created=nodes_created, nodes_updated=nodes_updated, edges_created=edges_created)
    return {
        "source": "CSV (unified)",
        "nodes_created": nodes_created,
        "nodes_updated": nodes_updated,
        "edges_created": edges_created,
        "errors": import_errors,
    }


# ── Template download ──────────────────────────────────────────────────────────

@router.get("/template/{entity}")
async def download_template(entity: str) -> StreamingResponse:
    """Return a CSV template for the given entity type."""
    cfg = _get_config(entity)
    buf = io.StringIO()
    writer = safe_writer(buf)
    writer.writerow(cfg.columns)
    for row in cfg.template_rows:
        writer.writerow(row)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={cfg.filename}"},
    )


# ── Preview (dry-run) ──────────────────────────────────────────────────────────

@router.post("/preview/{entity}", dependencies=[Depends(require_admin)])
async def preview_csv(entity: str, file: UploadFile = File(...)) -> dict:
    """Parse a CSV and return rows that would be imported — no database writes."""
    cfg = _get_config(entity)
    content = await file.read()
    rows, errors = _parse_csv(content, cfg)
    return {"rows": rows, "errors": errors, "total": len(rows)}


# ── Import ─────────────────────────────────────────────────────────────────────

@router.post("/{entity}", dependencies=[Depends(require_admin)])
async def import_csv(entity: str, file: UploadFile = File(...)) -> dict:
    """Parse a CSV file and upsert nodes of the given entity type."""
    cfg = _get_config(entity)
    content = await file.read()
    rows, parse_errors = _parse_csv(content, cfg)

    if not rows and parse_errors:
        raise HTTPException(status_code=422, detail=parse_errors)

    repo: GraphRepository = get_repository()
    created = updated = 0
    import_errors: list[str] = list(parse_errors)

    # Map csv-id / name → actual UUID for parent_id resolution
    id_map: dict[str, str] = {}

    for row in rows:
        try:
            attrs: dict = {}
            for csv_col, attr_key in cfg.attr_map.items():
                if row.get(csv_col):
                    attrs[attr_key] = row[csv_col]

            # Store raw parent_id for later resolution
            raw_parent_id = row.get("parent_id", "")
            if raw_parent_id:
                attrs["parent_id"] = raw_parent_id  # placeholder — resolved below

            node_data = NodeCreate(
                type=cfg.node_type,
                name=row["name"],
                description=row["description"] or None,
                external_source=ExternalSource.CSV,
                external_id=row["id"],
                attributes=attrs,
            )
            result, was_created = await repo.upsert_node_by_external(
                ExternalSource.CSV.value,
                row["id"],
                node_data,
            )
            id_map[row["id"]] = str(result.id)
            id_map[row["name"]] = str(result.id)
            if was_created:
                created += 1
            else:
                updated += 1
        except Exception as exc:
            log.error("csv.import.error", entity=entity, row_id=row.get("id"), error=str(exc))
            import_errors.append(f"{row.get('id', '?')}: {exc}")

    # Also index existing nodes so parent_id can reference pre-existing processes
    existing_nodes = await repo.list_nodes(node_type=cfg.node_type.value, limit=10_000)
    for n in existing_nodes:
        if n.external_id and n.external_id not in id_map:
            id_map[n.external_id] = str(n.id)
        if n.name not in id_map:
            id_map[n.name] = str(n.id)

    # Resolve parent_id references (CSV id or name → actual UUID)
    for row in rows:
        raw_parent = row.get("parent_id", "")
        if not raw_parent:
            continue
        resolved = id_map.get(raw_parent)
        if not resolved:
            import_errors.append(f"{row.get('id', '?')}: parent_id '{raw_parent}' not found")
            continue
        node_uuid = id_map.get(row["id"])
        if not node_uuid:
            continue
        try:
            # Re-read current attributes, set resolved parent_id
            current = await repo.get_node(uuid.UUID(node_uuid))
            if current:
                new_attrs = dict(current.attributes)
                new_attrs["parent_id"] = resolved
                await repo.update_node(uuid.UUID(node_uuid), NodeUpdate(attributes=new_attrs))
        except Exception as exc:
            log.warning("csv.import.parent_resolve.error", node=row.get("name"), error=str(exc))

    log.info("csv.import.done", entity=entity, created=created, updated=updated, errors=len(import_errors))
    return {
        "source": "CSV",
        "total": len(rows),
        "created": created,
        "updated": updated,
        "errors": import_errors,
    }


# ── Unified CSV (all types + connections in one file) ─────────────────────────

NODE_TYPE_MAP: dict[str, NodeType] = {
    "process": NodeType.PROCESS,
    "application": NodeType.APPLICATION,
    "informationobject": NodeType.INFORMATION_OBJECT,
    "informationsource": NodeType.INFORMATION_SOURCE,
    "technologycomponent": NodeType.TECHNOLOGY_COMPONENT,
}

EDGE_TYPE_SET = {e.value for e in EdgeType}


def _detect_delimiter(text: str) -> str:
    """Auto-detect CSV delimiter (comma or semicolon) from the first data lines."""
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith(("#", "[")):
            continue
        # First real data/header line — check which delimiter produces more columns
        if stripped.count(";") > stripped.count(","):
            return ";"
        return ","
    return ","


def _parse_unified_csv(content: bytes) -> tuple[list[dict], list[dict], list[str]]:
    """Parse a unified CSV. Returns (node_rows, edge_rows, errors)."""
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    if not text.strip():
        return [], [], ["File is empty."]

    delimiter = _detect_delimiter(text)

    # Split text into sections, then parse each with csv.reader for proper multiline handling
    nodes_text = ""
    edges_text = ""
    section = "nodes"

    # Remove comment lines and split by section markers
    clean_lines: list[str] = []
    for raw_line in text.splitlines():
        stripped = raw_line.strip()
        if stripped.upper() in ("[NODES]", "[OBJEKT]"):
            if clean_lines:
                nodes_text = "\n".join(clean_lines)
                clean_lines = []
            section = "nodes"
            continue
        if stripped.upper() in ("[CONNECTIONS]", "[KOPPLINGAR]"):
            if section == "nodes":
                nodes_text = "\n".join(clean_lines)
            clean_lines = []
            section = "edges"
            continue
        if stripped.startswith("#"):
            continue
        clean_lines.append(raw_line)

    if section == "nodes":
        nodes_text = "\n".join(clean_lines)
    elif section == "edges":
        edges_text = "\n".join(clean_lines)

    nodes: list[dict] = []
    edges: list[dict] = []
    errors: list[str] = []

    # Parse nodes section
    if nodes_text.strip():
        reader = csv.DictReader(io.StringIO(nodes_text), delimiter=delimiter)
        if reader.fieldnames:
            fieldnames = [f.strip().lower() for f in reader.fieldnames]
            reader.fieldnames = fieldnames
            if "type" not in fieldnames or "name" not in fieldnames:
                errors.append(f"Node header must include 'type' and 'name'. Got: {', '.join(fieldnames)}")
                return [], [], errors
            for row_num, raw_row in enumerate(reader, start=2):
                row = {k.strip().lower() if k else "": unescape_cell((v or "").strip()).strip() for k, v in raw_row.items() if k}
                name = row.get("name", "")
                node_type_raw = row.get("type", "")
                if not name:
                    errors.append(f"Node row {row_num}: 'name' is required.")
                    continue
                if not node_type_raw:
                    errors.append(f"Node row {row_num}: 'type' is required.")
                    continue
                node_type_key = node_type_raw.lower().replace(" ", "").replace("_", "")
                if node_type_key not in NODE_TYPE_MAP:
                    errors.append(f"Node row {row_num}: Unknown type '{node_type_raw}'. Valid: Process, Application, InformationObject, InformationSource, TechnologyComponent")
                    continue
                nodes.append({
                    "line": row_num,
                    "id": f"csv-{uuid.uuid4().hex[:8]}",
                    "type": NODE_TYPE_MAP[node_type_key],
                    "name": name,
                    "description": row.get("description", "").strip(),
                    "attributes": {k: v for k, v in row.items() if k not in ("id", "type", "name", "description") and v},
                })

    # Parse edges section
    if edges_text.strip():
        reader = csv.DictReader(io.StringIO(edges_text), delimiter=delimiter)
        if reader.fieldnames:
            reader.fieldnames = [f.strip().lower() for f in reader.fieldnames]
            for row_num, raw_row in enumerate(reader, start=2):
                row = {k.strip().lower() if k else "": unescape_cell((v or "").strip()).strip() for k, v in raw_row.items() if k}
                source = row.get("source", "")
                target = row.get("target", "")
                edge_type = row.get("type", "").upper().replace(" ", "_")
                if not source or not target or not edge_type:
                    errors.append(f"Connection row {row_num}: 'source', 'target', and 'type' are required.")
                    continue
                if edge_type not in EDGE_TYPE_SET:
                    errors.append(f"Connection row {row_num}: Unknown type '{edge_type}'. Valid: {', '.join(sorted(EDGE_TYPE_SET))}")
                    continue
                edges.append({
                    "line": row_num,
                    "source": source,
                    "target": target,
                    "type": edge_type,
                })

    return nodes, edges, errors


