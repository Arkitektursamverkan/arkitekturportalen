"""The business calendar as a synchronisation target.

A flow in the Integration Platform can fill the calendar the same way it
fills an object list: each record becomes one event on one date, e.g. the
dates another system plans by. The target is named "CalendarEvent" where an
object type would otherwise stand.

- An event is matched on (external_source, external_id), like a synced object.
- A new event is approved at once: the source is where it was decided.
- Only the mapped fields are written. What an editor adds in the portal –
  linked objects, change freeze, other dependencies – stays.
- An event the source no longer sends is removed, as when an editor removes
  one; the audit log keeps what it was.
- A record without a readable date is reported as an error and skipped.
"""
from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Any

from sqlalchemy import select

from app.dal.graph_repository import GraphRepository
from app.dal.postgres_repository import SYNC_AUDIT_USER, PostgresRepository
from app.models.calendar_event import CalendarEventNodeORM, CalendarEventORM

TARGET = "CalendarEvent"

# What a mapping may fill, as the import wizard lists it.
FIELDS: list[dict[str, Any]] = [
    {"target": "attr:start_date", "label": "Datum (ÅÅÅÅ-MM-DD)", "required": True},
    {"target": "attr:duration_days", "label": "Antal dagar"},
    {"target": "attr:responsible", "label": "Ansvarig"},
    {"target": "attr:departments", "label": "Avdelningar (kommaseparerade)"},
]

_SNAPSHOT_FIELDS = (
    "title", "description", "recurrence", "start_date", "duration_days", "end_date",
    "start_time", "end_time", "change_freeze", "responsible", "other_dependencies", "departments",
)


def _snapshot(e: CalendarEventORM, node_ids: list[Any]) -> dict[str, Any]:
    snap: dict[str, Any] = {}
    for f in _SNAPSHOT_FIELDS:
        v = getattr(e, f)
        snap[f] = v.isoformat() if hasattr(v, "isoformat") else v
    snap["status"] = e.status
    snap["proposed_by"] = e.proposed_by
    snap["node_ids"] = sorted(str(n) for n in node_ids)
    return snap


def _as_date(value: Any) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    # "2026-11-30" or a timestamp that starts with the date.
    return date.fromisoformat(str(value).strip()[:10])


def _mapped(record: dict[str, Any], mappings: list[dict[str, Any]]) -> dict[str, Any]:
    """The event fields a record gives. Raises ValueError (in Swedish, shown
    to the admin) when the record cannot become an event."""
    out: dict[str, Any] = {}
    for m in mappings:
        value = record.get(m["source_field"])
        if value is None:
            continue
        target = m["target"]
        if target == "name":
            out["title"] = str(value).strip()[:255]
        elif target == "description":
            out["description"] = str(value)[:4000]
        elif target == "attr:start_date":
            try:
                out["start_date"] = _as_date(value)
            except ValueError:
                raise ValueError(f"datumet går inte att läsa: {str(value)[:40]}") from None
        elif target == "attr:duration_days":
            try:
                days = int(value)
            except (TypeError, ValueError):
                raise ValueError(f"antal dagar är inte ett heltal: {str(value)[:40]}") from None
            if not 1 <= days <= 366:
                raise ValueError("antal dagar ska vara 1–366")
            out["duration_days"] = days
        elif target == "attr:responsible":
            out["responsible"] = str(value).strip()[:255]
        elif target == "attr:departments":
            parts = value if isinstance(value, list) else str(value).split(",")
            cleaned = [str(p).strip()[:255] for p in parts if str(p).strip()]
            out["departments"] = list(dict.fromkeys(cleaned))[:50]
    if not out.get("title"):
        raise ValueError("namnet är tomt")
    if "start_date" not in out:
        raise ValueError("datum saknas")
    return out


async def sync_events(
    repo: GraphRepository,
    *,
    flow_id: str,
    external_source: str,
    mappings: list[dict[str, Any]],
    records: list[dict[str, Any]],
    prune: bool,
) -> dict[str, Any]:
    """Upsert one event per record; with `prune`, remove the flow's events
    that the source no longer sends. Returns counts and the first errors."""
    if not isinstance(repo, PostgresRepository):
        raise TypeError("The calendar requires PostgreSQL backend")
    created = updated = removed = 0
    errors: list[str] = []
    sent: set[str] = set()
    prefix = f"{flow_id}:"

    async with repo._session_factory() as s:
        existing = {
            e.external_id: e
            for e in (
                await s.execute(
                    select(CalendarEventORM).where(
                        CalendarEventORM.external_source == external_source,
                        CalendarEventORM.external_id.like(f"{prefix}%"),
                    )
                )
            ).scalars()
        }

        async def node_ids(e: CalendarEventORM) -> list[Any]:
            return list(
                (
                    await s.execute(
                        select(CalendarEventNodeORM.node_id).where(CalendarEventNodeORM.event_id == e.id)
                    )
                ).scalars()
            )

        for rec in records:
            data = rec.get("data", {})
            ext = rec.get("external_id", data.get("external_id", ""))
            if not ext:
                errors.append("En post saknar id och hoppades över")
                continue
            key = f"{prefix}{ext}"
            # Sent, even if it turns out unreadable: a record with a bad date
            # must not take a good event off the calendar.
            sent.add(key)
            try:
                fields = _mapped(data, mappings)
            except ValueError as exc:
                errors.append(f"{ext}: {exc}")
                continue

            e = existing.get(key)
            if e is None:
                e = CalendarEventORM(
                    recurrence="once",
                    status="approved",
                    proposed_by=SYNC_AUDIT_USER,
                    resolved_by=SYNC_AUDIT_USER,
                    resolved_at=datetime.now(UTC),
                    external_source=external_source,
                    external_id=key,
                    **{
                        "description": "", "duration_days": 1, "responsible": "",
                        "other_dependencies": "", "departments": [], "change_freeze": False,
                        **fields,
                    },
                )
                s.add(e)
                await s.flush()
                existing[key] = e
                await repo._audit(
                    s, "CREATE", "calendar_event", e.id, entity_name=e.title,
                    snapshot_after=_snapshot(e, []), user_name=SYNC_AUDIT_USER,
                )
                created += 1
                continue

            changed = {f: v for f, v in fields.items() if getattr(e, f) != v}
            # An event someone rejected or withdrew by hand comes back: the
            # source says it is on.
            if e.status != "approved":
                changed["status"] = "approved"
            if not changed:
                continue
            ids = await node_ids(e)
            before = _snapshot(e, ids)
            for f, v in changed.items():
                setattr(e, f, v)
            await repo._audit(
                s, "UPDATE", "calendar_event", e.id, entity_name=e.title,
                snapshot_before=before, snapshot_after=_snapshot(e, ids), user_name=SYNC_AUDIT_USER,
            )
            updated += 1

        # An empty answer is more likely a source that is down than a calendar
        # that should be emptied – the object sync holds back the same way.
        if prune and sent:
            for key, e in existing.items():
                if key in sent:
                    continue
                await repo._audit(
                    s, "DELETE", "calendar_event", e.id, entity_name=e.title,
                    snapshot_before=_snapshot(e, await node_ids(e)), user_name=SYNC_AUDIT_USER,
                )
                await s.delete(e)
                removed += 1

        await s.commit()

    return {"created": created, "updated": updated, "removed": removed, "errors": errors}
