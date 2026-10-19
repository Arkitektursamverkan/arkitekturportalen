"""Content packs: an organisation's own content as files, outside the migrations.

A pack is a directory with pack.json and one JSON file per kind of content
(see KINDS). A file that is missing means the pack leaves that kind alone, so
a pack can carry just a glossary or just the principles.

Each kind belongs to a module (app.modules) or the core. Import skips the
kinds of a module that is switched off and says so.

Import adds and updates, never deletes: each item is matched on a natural key
(a principle's identifier, a glossary term, a home block's key, ...) and
written only when it differs. Running the same pack twice changes nothing the
second time. The documents with version history (principle document, target
architecture, current-state and GAP analysis) are written through the
repository, so the import shows up in their history like any other edit.

    python -m app.services.content_pack list
    python -m app.services.content_pack export <dir> [--name NAME]
    python -m app.services.content_pack import <dir or bundled pack> [--dry-run]

Neutral example packs ship with the app in content_packs/ (one per module);
`list` shows them and `import` takes their name as well as a directory.
"""
from __future__ import annotations

import argparse
import asyncio
import json
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Awaitable, Callable

from sqlalchemy import select

from app import modules as module_catalog
from app.dal.postgres_repository import PostgresRepository
from app.models.document_metadata import DocumentMetadataORM
from app.models.gap_task import GapTaskORM
from app.models.glossary_term import GlossaryTermORM
from app.models.home_banner import HomeBannerORM
from app.models.home_block import HomeBlockORM
from app.models.report_tag import ReportTagLinkORM, ReportTagORM
from app.models.workspace import WorkspaceORM
from app.schemas.architecture_journey import JourneyContent
from app.schemas.common import NodeType
from app.schemas.node import NodeCreate, NodeUpdate
from app.services import architecture_journey, org_settings

FORMAT = "arkitekturportalen.content-pack"
BUNDLED_DIR = Path(__file__).resolve().parents[2] / "content_packs"
VERSION = 1
MANIFEST = "pack.json"
UPDATED_BY = "innehållspaket"


class ContentPackError(ValueError):
    pass


@dataclass
class KindResult:
    created: int = 0
    updated: int = 0
    unchanged: int = 0
    notes: list[str] = field(default_factory=list)
    # Why the kind was not imported at all, e.g. its module is off.
    skipped: str | None = None

    def count(self, before: Any, after: Any) -> bool:
        """Tally one item; True when it needs writing."""
        if before is None:
            self.created += 1
            return True
        if before != after:
            self.updated += 1
            return True
        self.unchanged += 1
        return False


# ── Principles ────────────────────────────────────────────────────────────────

async def _principle_nodes(repo: PostgresRepository) -> dict[str, Any]:
    nodes = await repo.list_nodes(node_type=NodeType.ARCHITECTURE_PRINCIPLE.value, limit=100_000)
    return {str(n.attributes.get("identifier") or n.name): n for n in nodes}


def _principle_item(node: Any) -> dict[str, Any]:
    return {"name": node.name, "description": node.description or "", "attributes": dict(node.attributes or {})}


async def export_principles(repo: PostgresRepository) -> list[dict[str, Any]]:
    by_id = await _principle_nodes(repo)
    return [_principle_item(by_id[k]) for k in sorted(by_id)]


async def import_principles(repo: PostgresRepository, items: list[dict[str, Any]], apply: bool) -> KindResult:
    result = KindResult()
    existing = await _principle_nodes(repo)
    for item in items:
        attrs = dict(item.get("attributes") or {})
        key = str(attrs.get("identifier") or item["name"])
        node = existing.get(key)
        wanted = {"name": item["name"], "description": item.get("description") or "", "attributes": attrs}
        if not result.count(_principle_item(node) if node else None, wanted) or not apply:
            continue
        if node is None:
            await repo.create_node(NodeCreate(type=NodeType.ARCHITECTURE_PRINCIPLE, **wanted))
        else:
            await repo.update_node(node.id, NodeUpdate(**wanted))
    if apply and (result.created or result.updated):
        await repo.touch_principle_document()
    return result


# ── Versioned documents ───────────────────────────────────────────────────────

async def export_principle_document(repo: PostgresRepository) -> dict[str, Any] | None:
    row = await repo.get_principle_document()
    return {"sections": dict(row.sections or {})} if row else None


async def import_principle_document(repo: PostgresRepository, data: dict[str, Any], apply: bool) -> KindResult:
    result = KindResult()
    row = await repo.get_principle_document()
    sections = {str(k): str(v) for k, v in (data.get("sections") or {}).items()}
    current = dict(row.sections or {}) if row else None
    # Sections the pack does not name are kept, as an edit in the app keeps them.
    if result.count(current, {**(current or {}), **sections}) and apply:
        await repo.update_principle_document(sections, updated_by=UPDATED_BY, change_note="Importerat från innehållspaket")
    return result


@dataclass(frozen=True)
class _Document:
    get: str
    update: str


_DOCUMENTS = {
    "target-architecture": _Document("get_target_architecture", "update_target_architecture"),
    "current-state-analysis": _Document("get_nulaagesanalys", "update_nulaagesanalys"),
    "gap-analysis": _Document("get_gap_analys", "update_gap_analys"),
}


def _document_kind(doc: _Document) -> tuple[Callable[..., Awaitable[Any]], Callable[..., Awaitable[KindResult]]]:
    async def export(repo: PostgresRepository) -> dict[str, Any] | None:
        row = await getattr(repo, doc.get)()
        return {"content": row.content} if row else None

    async def import_(repo: PostgresRepository, data: dict[str, Any], apply: bool) -> KindResult:
        result = KindResult()
        row = await getattr(repo, doc.get)()
        if result.count(row.content if row else None, data["content"]) and apply:
            await getattr(repo, doc.update)(
                data["content"], updated_by=UPDATED_BY, change_note="Importerat från innehållspaket",
            )
        return result

    return export, import_


# ── Plain tables ──────────────────────────────────────────────────────────────

def _iso(d: date | None) -> str | None:
    return d.isoformat() if d else None


async def export_gap_tasks(repo: PostgresRepository) -> list[dict[str, Any]]:
    async with repo._session_factory() as s:
        rows = (await s.execute(select(GapTaskORM).order_by(GapTaskORM.gap_item_id, GapTaskORM.created_at))).scalars()
        return [_gap_task_item(r) for r in rows]


def _gap_task_item(r: GapTaskORM) -> dict[str, Any]:
    return {
        "gap_item_id": r.gap_item_id, "title": r.title, "description": r.description, "status": r.status,
        "assigned_to": r.assigned_to, "due_date": _iso(r.due_date), "horizon": r.horizon, "weight": r.weight,
    }


async def import_gap_tasks(repo: PostgresRepository, items: list[dict[str, Any]], apply: bool) -> KindResult:
    result = KindResult()
    async with repo._session_factory() as s:
        rows = {(r.gap_item_id, r.title): r for r in (await s.execute(select(GapTaskORM))).scalars()}
        for item in items:
            wanted = {
                "gap_item_id": item["gap_item_id"], "title": item["title"],
                "description": item.get("description", ""), "status": item.get("status", "todo"),
                "assigned_to": item.get("assigned_to", ""), "due_date": item.get("due_date"),
                "horizon": item.get("horizon", ""), "weight": int(item.get("weight", 1)),
            }
            row = rows.get((wanted["gap_item_id"], wanted["title"]))
            if not result.count(_gap_task_item(row) if row else None, wanted) or not apply:
                continue
            values = {**wanted, "due_date": date.fromisoformat(wanted["due_date"]) if wanted["due_date"] else None}
            if row is None:
                row = GapTaskORM(created_by=UPDATED_BY, **values)
                s.add(row)
                rows[(row.gap_item_id, row.title)] = row
            else:
                for k, v in values.items():
                    setattr(row, k, v)
        if apply:
            await s.commit()
    return result


async def export_glossary(repo: PostgresRepository) -> list[dict[str, Any]]:
    async with repo._session_factory() as s:
        rows = (await s.execute(select(GlossaryTermORM).order_by(GlossaryTermORM.term))).scalars()
        return [{"term": r.term, "definition": r.definition} for r in rows]


async def import_glossary(repo: PostgresRepository, items: list[dict[str, Any]], apply: bool) -> KindResult:
    result = KindResult()
    async with repo._session_factory() as s:
        rows = {r.term: r for r in (await s.execute(select(GlossaryTermORM))).scalars()}
        for item in items:
            row = rows.get(item["term"])
            definition = item.get("definition", "")
            if not result.count(row.definition if row else None, definition) or not apply:
                continue
            if row is None:
                rows[item["term"]] = row = GlossaryTermORM(term=item["term"], definition=definition, updated_by=UPDATED_BY)
                s.add(row)
            else:
                row.definition = definition
                row.updated_by = UPDATED_BY
        if apply:
            await s.commit()
    return result


async def export_home_blocks(repo: PostgresRepository) -> list[dict[str, Any]]:
    async with repo._session_factory() as s:
        rows = (await s.execute(select(HomeBlockORM).order_by(HomeBlockORM.key))).scalars()
        return [{"key": r.key, "body": r.body, "enabled": r.enabled} for r in rows]


async def import_home_blocks(repo: PostgresRepository, items: list[dict[str, Any]], apply: bool) -> KindResult:
    result = KindResult()
    async with repo._session_factory() as s:
        for item in items:
            row = await s.get(HomeBlockORM, item["key"])
            wanted = {"body": item.get("body", ""), "enabled": bool(item.get("enabled", True))}
            if not result.count({"body": row.body, "enabled": row.enabled} if row else None, wanted) or not apply:
                continue
            if row is None:
                s.add(HomeBlockORM(key=item["key"], updated_by=UPDATED_BY, **wanted))
            else:
                row.body, row.enabled, row.updated_by = wanted["body"], wanted["enabled"], UPDATED_BY
        if apply:
            await s.commit()
    return result


async def export_home_banners(repo: PostgresRepository) -> list[dict[str, Any]]:
    async with repo._session_factory() as s:
        rows = (await s.execute(select(HomeBannerORM).order_by(HomeBannerORM.created_at))).scalars()
        return [{"body": r.body, "severity": r.severity, "enabled": r.enabled} for r in rows]


async def import_home_banners(repo: PostgresRepository, items: list[dict[str, Any]], apply: bool) -> KindResult:
    result = KindResult()
    async with repo._session_factory() as s:
        rows = {r.body: r for r in (await s.execute(select(HomeBannerORM))).scalars()}
        for item in items:
            row = rows.get(item["body"])
            wanted = {"severity": item.get("severity", "info"), "enabled": bool(item.get("enabled", True))}
            if not result.count({"severity": row.severity, "enabled": row.enabled} if row else None, wanted) or not apply:
                continue
            if row is None:
                rows[item["body"]] = row = HomeBannerORM(body=item["body"], updated_by=UPDATED_BY, **wanted)
                s.add(row)
            else:
                row.severity, row.enabled, row.updated_by = wanted["severity"], wanted["enabled"], UPDATED_BY
        if apply:
            await s.commit()
    return result


async def export_workgroups(repo: PostgresRepository) -> list[dict[str, Any]]:
    """The standing working groups by name and purpose. Members, pages and
    meetings are the group's own work, not content to carry to another site."""
    async with repo._session_factory() as s:
        q = select(WorkspaceORM).where(WorkspaceORM.kind == "arbetsgrupp").order_by(WorkspaceORM.name)
        return [{"name": r.name, "description": r.description} for r in (await s.execute(q)).scalars()]


async def import_workgroups(repo: PostgresRepository, items: list[dict[str, Any]], apply: bool) -> KindResult:
    result = KindResult()
    async with repo._session_factory() as s:
        q = select(WorkspaceORM).where(WorkspaceORM.kind == "arbetsgrupp")
        rows = {r.name: r for r in (await s.execute(q)).scalars()}
        for item in items:
            row = rows.get(item["name"])
            description = item.get("description", "")
            if not result.count(row.description if row else None, description) or not apply:
                continue
            if row is None:
                rows[item["name"]] = row = WorkspaceORM(
                    name=item["name"], description=description, kind="arbetsgrupp", status="active",
                    visibility="internal", created_by=UPDATED_BY, updated_by=UPDATED_BY,
                )
                s.add(row)
            else:
                row.description, row.updated_by = description, UPDATED_BY
        if apply:
            await s.commit()
    return result


async def export_report_tags(repo: PostgresRepository) -> list[dict[str, Any]]:
    async with repo._session_factory() as s:
        tags = list((await s.execute(select(ReportTagORM).order_by(ReportTagORM.sort_order, ReportTagORM.slug))).scalars())
        links = list((await s.execute(select(ReportTagLinkORM))).scalars())
    reports: dict[Any, list[str]] = {}
    for link in links:
        reports.setdefault(link.tag_id, []).append(link.report_key)
    return [
        {"slug": t.slug, "name": t.name, "color": t.color, "sort_order": t.sort_order,
         "reports": sorted(reports.get(t.id, []))}
        for t in tags
    ]


async def import_report_tags(repo: PostgresRepository, items: list[dict[str, Any]], apply: bool) -> KindResult:
    """Reports are linked to a tag, never unlinked: an admin may have tagged
    a report further since the pack was made."""
    result = KindResult()
    async with repo._session_factory() as s:
        tags = {t.slug: t for t in (await s.execute(select(ReportTagORM))).scalars()}
        links = {(link.tag_id, link.report_key) for link in (await s.execute(select(ReportTagLinkORM))).scalars()}
        for item in items:
            tag = tags.get(item["slug"])
            wanted = {"name": item["name"], "color": item.get("color", "#E65100"), "sort_order": int(item.get("sort_order", 100))}
            current = None
            if tag is not None:
                current = {"name": tag.name, "color": tag.color, "sort_order": tag.sort_order}
            missing = [r for r in item.get("reports", []) if tag is None or (tag.id, r) not in links]
            if not result.count(current, wanted if not missing else {**wanted, "reports": missing}) or not apply:
                continue
            if tag is None:
                tags[item["slug"]] = tag = ReportTagORM(slug=item["slug"], **wanted)
                s.add(tag)
                await s.flush()
            else:
                tag.name, tag.color, tag.sort_order = wanted["name"], wanted["color"], wanted["sort_order"]
            for report_key in missing:
                s.add(ReportTagLinkORM(tag_id=tag.id, report_key=report_key))
                links.add((tag.id, report_key))
        if apply:
            await s.commit()
    return result


async def export_document_metadata(repo: PostgresRepository) -> list[dict[str, Any]]:
    async with repo._session_factory() as s:
        rows = (await s.execute(select(DocumentMetadataORM).order_by(DocumentMetadataORM.document_type))).scalars()
        return [{"document_type": r.document_type, "entries": r.entries} for r in rows]


async def import_document_metadata(repo: PostgresRepository, items: list[dict[str, Any]], apply: bool) -> KindResult:
    result = KindResult()
    async with repo._session_factory() as s:
        for item in items:
            row = await s.get(DocumentMetadataORM, item["document_type"])
            entries = list(item.get("entries") or [])
            if not result.count(row.entries if row else None, entries) or not apply:
                continue
            if row is None:
                s.add(DocumentMetadataORM(document_type=item["document_type"], entries=entries, updated_by=UPDATED_BY))
            else:
                row.entries, row.updated_by = entries, UPDATED_BY
        if apply:
            await s.commit()
    return result


async def export_architecture_journey(repo: PostgresRepository) -> dict[str, Any] | None:
    """The journey as saved; nothing while it is the built-in default."""
    journey = await architecture_journey.read(repo._session_factory)
    return None if journey.is_default else journey.content.model_dump(mode="json")


async def import_architecture_journey(repo: PostgresRepository, data: dict[str, Any], apply: bool) -> KindResult:
    result = KindResult()
    try:
        content = JourneyContent.model_validate(data)
    except ValueError as exc:
        raise ContentPackError(f"architecture-journey.json: {exc}") from exc
    journey = await architecture_journey.read(repo._session_factory)
    current = None if journey.is_default else journey.content.model_dump(mode="json")
    if result.count(current, content.model_dump(mode="json")) and apply:
        await architecture_journey.save(repo._session_factory, content, UPDATED_BY)
    return result


# ── The pack ──────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class Kind:
    file: str
    label: str
    export: Callable[[PostgresRepository], Awaitable[Any]]
    import_: Callable[[PostgresRepository, Any, bool], Awaitable[KindResult]]
    # The optional module (app.modules) the content belongs to; None = core.
    module: str | None = None


def _kinds() -> list[Kind]:
    docs = {name: _document_kind(doc) for name, doc in _DOCUMENTS.items()}
    return [
        Kind("principles.json", "Arkitekturprinciper", export_principles, import_principles, "governance"),
        Kind("principle-document.json", "Principdokumentet", export_principle_document, import_principle_document,
             "governance"),
        Kind("target-architecture.json", "Målarkitektur", *docs["target-architecture"], "governance"),
        Kind("current-state-analysis.json", "Nulägesanalys", *docs["current-state-analysis"], "governance"),
        Kind("gap-analysis.json", "GAP-analys", *docs["gap-analysis"], "governance"),
        Kind("gap-tasks.json", "Handlingsplanens aktiviteter", export_gap_tasks, import_gap_tasks, "governance"),
        Kind("glossary.json", "Ordlista", export_glossary, import_glossary, "glossary"),
        Kind("home-blocks.json", "Startsidans block", export_home_blocks, import_home_blocks),
        Kind("home-banners.json", "Startsidans meddelanden", export_home_banners, import_home_banners),
        Kind("workgroups.json", "Arbetsgrupper", export_workgroups, import_workgroups, "collaboration"),
        Kind("report-tags.json", "Rapporttaggar", export_report_tags, import_report_tags),
        Kind("architecture-journey.json", "Arkitekturresan", export_architecture_journey, import_architecture_journey),
        Kind("document-metadata.json", "Dokumentmetadata", export_document_metadata, import_document_metadata),
    ]


KINDS = _kinds()


def _is_empty(data: Any) -> bool:
    return data is None or data == []


def _pack_modules(files: dict[str, Any]) -> list[str]:
    """The optional modules a pack has content for, in catalogue order."""
    used = {k.module for k in KINDS if k.file in files and k.module}
    return [m for m in module_catalog.KEYS if m in used]


async def export_pack(repo: PostgresRepository, name: str, description: str = "") -> dict[str, Any]:
    """file name → JSON data; kinds with nothing in them are left out. Content
    of a switched-off module is exported too: it is still the installation's."""
    files: dict[str, Any] = {}
    for kind in KINDS:
        data = await kind.export(repo)
        if not _is_empty(data):
            files[kind.file] = data
    files[MANIFEST] = {
        "format": FORMAT, "version": VERSION, "name": name, "description": description,
        "modules": _pack_modules(files),
        "exported_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    return files


async def import_pack(repo: PostgresRepository, files: dict[str, Any], *, apply: bool) -> dict[str, KindResult]:
    """Kind label → what the import did (or, with apply=False, would do).

    Content for a module that is switched off is skipped and said so: it
    would be invisible, and switching the module on and importing again
    brings it in."""
    check_manifest(files.get(MANIFEST))
    unknown = set(files) - {MANIFEST} - {k.file for k in KINDS}
    if unknown:
        raise ContentPackError(f"Okända filer i paketet: {', '.join(sorted(unknown))}")
    results: dict[str, KindResult] = {}
    for kind in KINDS:
        if kind.file not in files:
            continue
        if kind.module and not module_catalog.enabled(kind.module):
            name = next(m.name for m in module_catalog.MODULES if m.key == kind.module)
            results[kind.label] = KindResult(skipped=f"modulen {name} är inte på")
            continue
        results[kind.label] = await kind.import_(repo, files[kind.file], apply)
    return results


def check_manifest(manifest: Any) -> None:
    if not isinstance(manifest, dict) or manifest.get("format") != FORMAT:
        raise ContentPackError(f"{MANIFEST} saknas eller är inte ett innehållspaket")
    if manifest.get("version") != VERSION:
        raise ContentPackError(f"Paketets version {manifest.get('version')} stöds inte (bara {VERSION})")


def write_pack(directory: Path, files: dict[str, Any]) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    for name, data in files.items():
        (directory / name).write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def bundled_packs() -> dict[str, dict[str, Any]]:
    """Name → manifest of the example packs that ship with the app."""
    if not BUNDLED_DIR.is_dir():
        return {}
    return {
        d.name: json.loads((d / MANIFEST).read_text(encoding="utf-8"))
        for d in sorted(BUNDLED_DIR.iterdir()) if (d / MANIFEST).is_file()
    }


def resolve_pack(arg: Path) -> Path:
    """A directory as given, or the bundled pack of that name."""
    if arg.is_dir() or len(arg.parts) > 1:
        return arg
    bundled = BUNDLED_DIR / arg.name
    return bundled if bundled.is_dir() else arg


def read_pack(directory: Path) -> dict[str, Any]:
    if not (directory / MANIFEST).is_file():
        raise ContentPackError(f"{directory} saknar {MANIFEST}")
    return {p.name: json.loads(p.read_text(encoding="utf-8")) for p in sorted(directory.glob("*.json"))}


# ── Command line ──────────────────────────────────────────────────────────────

def _report(results: dict[str, KindResult], apply: bool) -> str:
    verb = ("skapade", "uppdaterade") if apply else ("skulle skapas", "skulle uppdateras")
    lines = [
        f"{label}: hoppas över – {r.skipped}" if r.skipped else
        f"{label}: {r.created} {verb[0]}, {r.updated} {verb[1]}, {r.unchanged} oförändrade"
        for label, r in results.items()
    ]
    return "\n".join(lines) if lines else "Paketet innehåller inget att importera."


async def _main(argv: list[str] | None = None) -> None:
    from app.config import settings

    parser = argparse.ArgumentParser(prog="python -m app.services.content_pack", description=__doc__.split("\n\n")[0])
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("list", help="visa exempelpaketen som följer med")
    exp = sub.add_parser("export", help="skriv installationens innehåll till en katalog")
    exp.add_argument("directory", type=Path)
    exp.add_argument("--name", default="", help="paketets namn (pack.json)")
    imp = sub.add_parser("import", help="läs in ett paket")
    imp.add_argument("directory", type=Path, help="katalog, eller namnet på ett exempelpaket (se list)")
    imp.add_argument("--dry-run", action="store_true", help="visa vad som skulle ändras utan att skriva")
    args = parser.parse_args(argv)

    if args.command == "list":
        names = {m.key: m.name for m in module_catalog.MODULES}
        for name, manifest in bundled_packs().items():
            mods = ", ".join(names.get(k, k) for k in manifest.get("modules", [])) or "kärnan"
            print(f"{name}  ({mods})\n    {manifest.get('description', '')}")
        return

    repo = PostgresRepository(database_url=settings.DATABASE_URL)
    # The module switches live in the organisation settings, which the API
    # loads at startup; this command runs outside it.
    await org_settings.load(repo._session_factory)
    try:
        if args.command == "export":
            files = await export_pack(repo, args.name or args.directory.name)
            write_pack(args.directory, files)
            print(f"Skrev {len(files) - 1} filer till {args.directory}")
        else:
            results = await import_pack(repo, read_pack(resolve_pack(args.directory)), apply=not args.dry_run)
            print(_report(results, apply=not args.dry_run))
    finally:
        await repo.close()


if __name__ == "__main__":
    try:
        asyncio.run(_main())
    except ContentPackError as exc:
        raise SystemExit(str(exc)) from exc
