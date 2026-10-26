"""Changes to the architecture objects over time, read from the audit log.

Every create, update and delete of an object – by hand, by import or by a
synchronisation – leaves a row in ea_audit_log with the object before and
after. This module turns those rows into events:

- added:   created, restored, or brought back out of the archive
- removed: deleted, or archived (e.g. dropped by its synchronisation source)
- updated: anything else that changed the object's name, description,
           source or attributes; rows that changed none of those are skipped

The classification and the changed fields are worked out in SQL, so the
snapshots themselves never leave the database.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

# The BDAT object types – what the statistics are about. Architecture
# principles are nodes too, but they are not part of the landscape.
BDAT_TYPES: tuple[str, ...] = (
    "Process",
    "InformationObject",
    "InformationSource",
    "Application",
    "TechnologyComponent",
    "Server",
    "ServerService",
)

# Top-level snapshot fields worth reporting; the rest (id, type, archived)
# are either fixed or classified separately.
_TOP_FIELDS = ("name", "description", "external_source", "external_id")

_EVENTS_SQL = text(f"""
SELECT l.created_at AS at,
       l.entity_id AS node_id,
       coalesce(l.snapshot_after->>'name', l.snapshot_before->>'name', l.entity_name) AS name,
       l.entity_subtype AS type,
       coalesce(l.snapshot_after->>'external_source', l.snapshot_before->>'external_source', 'NONE') AS source,
       l.user_name AS by,
       CASE
         WHEN l.action = 'CREATE' THEN 'added'
         WHEN l.action = 'DELETE' THEN 'removed'
         WHEN coalesce((l.snapshot_before->>'archived')::boolean, false)
              AND NOT coalesce((l.snapshot_after->>'archived')::boolean, false) THEN 'added'
         WHEN NOT coalesce((l.snapshot_before->>'archived')::boolean, false)
              AND coalesce((l.snapshot_after->>'archived')::boolean, false) THEN 'removed'
         ELSE 'updated'
       END AS kind,
       CASE WHEN l.action = 'UPDATE' THEN ARRAY(
         SELECT f FROM unnest(ARRAY[{", ".join(f"'{f}'" for f in _TOP_FIELDS)}]) AS f
          WHERE l.snapshot_before->f IS DISTINCT FROM l.snapshot_after->f
         UNION ALL
         SELECT coalesce(a.key, b.key)
           FROM jsonb_each(coalesce(l.snapshot_after->'attributes', '{{}}'::jsonb)) a
           FULL JOIN jsonb_each(coalesce(l.snapshot_before->'attributes', '{{}}'::jsonb)) b ON a.key = b.key
          WHERE a.value IS DISTINCT FROM b.value
       ) ELSE ARRAY[]::text[] END AS fields
  FROM ea_audit_log l
 WHERE l.entity_type = 'node'
   AND l.entity_subtype = ANY(:types)
   AND l.created_at >= :since
 ORDER BY l.created_at, l.id
""")


@dataclass
class Event:
    at: datetime
    kind: str
    node_id: str
    name: str | None
    type: str
    source: str
    by: str | None
    fields: list[str] = field(default_factory=list)


async def events_since(
    session_factory: async_sessionmaker[AsyncSession], since: datetime, types: list[str],
) -> list[Event]:
    """Every change to objects of the given types from `since` until now.

    An update that changed nothing reported (e.g. only a visibility flag that
    is not part of the snapshot) is left out."""
    async with session_factory() as s:
        rows = (await s.execute(_EVENTS_SQL, {"since": since, "types": types})).mappings().all()
    out: list[Event] = []
    for r in rows:
        if r["kind"] == "updated" and not r["fields"]:
            continue
        out.append(Event(
            at=r["at"], kind=r["kind"], node_id=str(r["node_id"]), name=r["name"],
            type=r["type"], source=r["source"], by=r["by"], fields=list(r["fields"]),
        ))
    return out


async def current_objects(
    session_factory: async_sessionmaker[AsyncSession], types: list[str],
) -> list[tuple[str, str]]:
    """(id, type) of every object of the given types that is not archived."""
    async with session_factory() as s:
        rows = (await s.execute(
            text("SELECT id, type FROM ea_nodes WHERE NOT archived AND type = ANY(:types)"),
            {"types": types},
        )).all()
    return [(str(r[0]), r[1]) for r in rows]


async def history_from(session_factory: async_sessionmaker[AsyncSession]) -> datetime | None:
    async with session_factory() as s:
        value: Any = (await s.execute(
            text("SELECT min(created_at) FROM ea_audit_log WHERE entity_type = 'node'"),
        )).scalar()
    return value
