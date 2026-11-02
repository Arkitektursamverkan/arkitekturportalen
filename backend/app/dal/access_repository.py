"""Data access for roles, groups and grants (app/models/access.py).

Exposed as `repo.access`. Decisions are app/access.py's; this module only
reads and writes rows, and writes the audit entries for changes to them.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.auth import CurrentUser
from app.models.access import AccessGrantORM, GroupMemberORM, GroupORM, RoleORM
from app.models.audit import AuditLogORM
from app.models.node import NodeORM
from app.models.user import UserORM

# The roles a fresh database starts with. Admins may adjust their permissions
# afterwards; the keys stay.
DEFAULT_ROLES: list[dict[str, Any]] = [
    {
        "key": "lasare", "name": "Läsare", "sort_order": 10,
        "description": "Ser objektet, läser dess dokument och delade anteckningar.",
        "permissions": ["object.read", "documents.read", "notes.read"],
    },
    {
        "key": "bidragsgivare", "name": "Bidragsgivare", "sort_order": 20,
        "description": "Som Läsare, och laddar upp dokument och skriver anteckningar.",
        "permissions": ["object.read", "documents.read", "notes.read", "documents.write", "notes.write"],
    },
    {
        "key": "forvaltare", "name": "Förvaltare", "sort_order": 30,
        "description": "Som Bidragsgivare, och redigerar objektet och dess kopplingar, "
                       "läser Begränsade dokument och hanterar allas dokument och anteckningar.",
        "permissions": [
            "object.read", "object.edit", "documents.read", "documents.read_restricted",
            "documents.write", "notes.read", "notes.write", "content.manage",
        ],
    },
]

# Everything but Servrar is readable by everyone and maintained by
# superusers — what the portal did before grants existed.
OPEN_TYPES = [
    "Process", "Application", "InformationObject", "InformationSource",
    "TechnologyComponent", "ArchitecturePrinciple", "CustomObject",
]


@dataclass
class GrantView:
    """A grant with its role resolved — what the policy and the UI read."""

    id: UUID
    principal_type: str
    principal_role: str | None
    group_id: UUID | None
    user_id: UUID | None
    role_id: UUID
    role_key: str
    role_name: str
    permissions: list[str]
    scope_type: str
    node_types: list[str]
    node_id: UUID | None
    include_children: bool
    note: str
    created_at: datetime
    created_by: str | None
    # Filled in for display.
    principal_name: str | None = None
    node_name: str | None = None
    node_type: str | None = None
    extra: dict[str, Any] = field(default_factory=dict)


def _audit(s: AsyncSession, action: str, entity_id: UUID, name: str, subtype: str, actor: str | None, note: str | None = None) -> None:
    s.add(AuditLogORM(
        id=uuid.uuid4(), action=action, entity_type="access", entity_id=entity_id,
        entity_name=name[:255], entity_subtype=subtype, user_name=actor, change_note=note,
    ))


class AccessRepository:
    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory

    # ── Defaults ────────────────────────────────────────────────────────────

    async def ensure_defaults(self) -> None:
        """Seed the built-in roles and the default grants into an empty
        database. Alembic does this for real databases (0055); this covers
        databases created straight from the models, such as the tests'."""
        async with self._session_factory() as s:
            if (await s.execute(select(func.count()).select_from(RoleORM))).scalar():
                return
            roles = {}
            for r in DEFAULT_ROLES:
                row = RoleORM(id=uuid.uuid4(), builtin=True, **r)
                s.add(row)
                roles[r["key"]] = row.id
            # No ORM relationship orders the inserts, so the roles go first.
            await s.flush()
            s.add(AccessGrantORM(
                id=uuid.uuid4(), principal_type="everyone", role_id=roles["lasare"],
                scope_type="types", node_types=OPEN_TYPES,
            ))
            s.add(AccessGrantORM(
                id=uuid.uuid4(), principal_type="role", principal_role="superuser",
                role_id=roles["forvaltare"], scope_type="types", node_types=OPEN_TYPES,
            ))
            await s.commit()

    # ── What the policy needs ───────────────────────────────────────────────

    async def grants_for(self, user: CurrentUser | None) -> list[GrantView]:
        conds = [AccessGrantORM.principal_type == "everyone"]
        if user is not None:
            conds.append((AccessGrantORM.principal_type == "role") & (AccessGrantORM.principal_role == user.role))
            try:
                uid = UUID(user.id)
            except (TypeError, ValueError):
                uid = None
            if uid is not None:
                conds.append((AccessGrantORM.principal_type == "user") & (AccessGrantORM.user_id == uid))
                conds.append(
                    (AccessGrantORM.principal_type == "group")
                    & AccessGrantORM.group_id.in_(select(GroupMemberORM.group_id).where(GroupMemberORM.user_id == uid))
                )
        return await self._grants(or_(*conds))

    async def process_parents(self) -> dict[str, str | None]:
        """Every process (archived too) → the process above it."""
        async with self._session_factory() as s:
            rows = (await s.execute(
                select(NodeORM.id, NodeORM.attributes["parent_id"].astext).where(NodeORM.type == "Process")
            )).all()
            return {str(i): (p or None) for i, p in rows}

    # ── Grants ──────────────────────────────────────────────────────────────

    async def _grants(self, where: Any = None) -> list[GrantView]:
        async with self._session_factory() as s:
            q = select(AccessGrantORM, RoleORM).join(RoleORM, AccessGrantORM.role_id == RoleORM.id)
            if where is not None:
                q = q.where(where)
            q = q.order_by(AccessGrantORM.created_at)
            return [
                GrantView(
                    id=g.id, principal_type=g.principal_type, principal_role=g.principal_role,
                    group_id=g.group_id, user_id=g.user_id, role_id=r.id, role_key=r.key, role_name=r.name,
                    permissions=list(r.permissions or []), scope_type=g.scope_type,
                    node_types=list(g.node_types or []), node_id=g.node_id,
                    include_children=g.include_children, note=g.note,
                    created_at=g.created_at, created_by=g.created_by,
                )
                for g, r in (await s.execute(q)).all()
            ]

    async def list_grants(self) -> list[GrantView]:
        return await self.describe(await self._grants())

    async def describe(self, grants: list[GrantView]) -> list[GrantView]:
        """Fill in the names of the groups, users and objects grants point at."""
        group_ids = {g.group_id for g in grants if g.group_id}
        user_ids = {g.user_id for g in grants if g.user_id}
        node_ids = {g.node_id for g in grants if g.node_id}
        async with self._session_factory() as s:
            groups = dict((await s.execute(select(GroupORM.id, GroupORM.name).where(GroupORM.id.in_(group_ids)))).tuples().all()) if group_ids else {}
            users = dict((await s.execute(select(UserORM.id, UserORM.name).where(UserORM.id.in_(user_ids)))).tuples().all()) if user_ids else {}
            nodes = {i: (n, t) for i, n, t in (await s.execute(
                select(NodeORM.id, NodeORM.name, NodeORM.type).where(NodeORM.id.in_(node_ids))
            )).all()} if node_ids else {}
        for g in grants:
            if g.group_id:
                g.principal_name = groups.get(g.group_id)
            elif g.user_id:
                g.principal_name = users.get(g.user_id)
            if g.node_id and g.node_id in nodes:
                g.node_name, g.node_type = nodes[g.node_id]
        return grants

    async def create_grant(self, fields: dict[str, Any], actor: str | None, summary: str) -> UUID:
        async with self._session_factory() as s:
            row = AccessGrantORM(id=uuid.uuid4(), created_by=actor, **fields)
            s.add(row)
            _audit(s, "CREATE", row.id, summary, "Tilldelning", actor)
            await s.commit()
            return row.id

    async def get_grant(self, grant_id: UUID) -> GrantView | None:
        rows = await self._grants(AccessGrantORM.id == grant_id)
        return rows[0] if rows else None

    async def delete_grant(self, grant_id: UUID, actor: str | None, summary: str) -> bool:
        async with self._session_factory() as s:
            row = await s.get(AccessGrantORM, grant_id)
            if row is None:
                return False
            _audit(s, "DELETE", grant_id, summary, "Tilldelning", actor)
            await s.delete(row)
            await s.commit()
            return True

    # ── Roles ───────────────────────────────────────────────────────────────

    async def list_roles(self) -> list[tuple[RoleORM, int]]:
        """Roles with how many grants use each."""
        async with self._session_factory() as s:
            used = dict((await s.execute(
                select(AccessGrantORM.role_id, func.count()).group_by(AccessGrantORM.role_id)
            )).tuples().all())
            roles = (await s.execute(select(RoleORM).order_by(RoleORM.sort_order, RoleORM.name))).scalars().all()
            return [(r, used.get(r.id, 0)) for r in roles]

    async def get_role(self, role_id: UUID) -> RoleORM | None:
        async with self._session_factory() as s:
            return await s.get(RoleORM, role_id)

    async def create_role(self, fields: dict[str, Any], actor: str | None) -> RoleORM:
        async with self._session_factory() as s:
            row = RoleORM(id=uuid.uuid4(), updated_by=actor, **fields)
            s.add(row)
            _audit(s, "CREATE", row.id, row.name, "Roll", actor, ", ".join(row.permissions))
            await s.commit()
            await s.refresh(row)
            return row

    async def update_role(self, role_id: UUID, fields: dict[str, Any], actor: str | None) -> RoleORM | None:
        async with self._session_factory() as s:
            row = await s.get(RoleORM, role_id)
            if row is None:
                return None
            for k, v in fields.items():
                setattr(row, k, v)
            row.updated_by = actor
            _audit(s, "UPDATE", row.id, row.name, "Roll", actor, ", ".join(row.permissions))
            await s.commit()
            await s.refresh(row)
            return row

    async def delete_role(self, role_id: UUID, actor: str | None) -> None:
        async with self._session_factory() as s:
            row = await s.get(RoleORM, role_id)
            if row is not None:
                _audit(s, "DELETE", row.id, row.name, "Roll", actor)
                await s.delete(row)
                await s.commit()

    # ── Groups ──────────────────────────────────────────────────────────────

    async def list_groups(self) -> list[tuple[GroupORM, list[UserORM]]]:
        async with self._session_factory() as s:
            groups = (await s.execute(select(GroupORM).order_by(func.lower(GroupORM.name)))).scalars().all()
            members = (await s.execute(
                select(GroupMemberORM.group_id, UserORM)
                .join(UserORM, GroupMemberORM.user_id == UserORM.id)
                .order_by(func.lower(UserORM.name))
            )).all()
            by_group: dict[UUID, list[UserORM]] = {}
            for gid, u in members:
                by_group.setdefault(gid, []).append(u)
            return [(g, by_group.get(g.id, [])) for g in groups]

    async def get_group(self, group_id: UUID) -> GroupORM | None:
        async with self._session_factory() as s:
            return await s.get(GroupORM, group_id)

    async def group_name_taken(self, name: str, except_id: UUID | None = None) -> bool:
        async with self._session_factory() as s:
            q = select(GroupORM.id).where(func.lower(GroupORM.name) == name.lower())
            if except_id:
                q = q.where(GroupORM.id != except_id)
            return (await s.execute(q)).first() is not None

    async def create_group(self, name: str, description: str, actor: str | None) -> GroupORM:
        async with self._session_factory() as s:
            row = GroupORM(id=uuid.uuid4(), name=name, description=description, created_by=actor)
            s.add(row)
            _audit(s, "CREATE", row.id, name, "Grupp", actor)
            await s.commit()
            await s.refresh(row)
            return row

    async def update_group(self, group_id: UUID, fields: dict[str, Any], actor: str | None) -> GroupORM | None:
        async with self._session_factory() as s:
            row = await s.get(GroupORM, group_id)
            if row is None:
                return None
            for k, v in fields.items():
                setattr(row, k, v)
            _audit(s, "UPDATE", row.id, row.name, "Grupp", actor)
            await s.commit()
            await s.refresh(row)
            return row

    async def delete_group(self, group_id: UUID, actor: str | None) -> bool:
        """Deleting a group also removes the grants given to it."""
        async with self._session_factory() as s:
            row = await s.get(GroupORM, group_id)
            if row is None:
                return False
            _audit(s, "DELETE", row.id, row.name, "Grupp", actor)
            await s.delete(row)
            await s.commit()
            return True

    async def set_group_members(self, group_id: UUID, user_ids: list[UUID], actor: str | None) -> None:
        async with self._session_factory() as s:
            group = await s.get(GroupORM, group_id)
            if group is None:
                return
            before = set((await s.execute(
                select(GroupMemberORM.user_id).where(GroupMemberORM.group_id == group_id)
            )).scalars().all())
            after = set(user_ids)
            if before == after:
                return
            await s.execute(delete(GroupMemberORM).where(GroupMemberORM.group_id == group_id))
            for uid in after:
                s.add(GroupMemberORM(group_id=group_id, user_id=uid))
            names = dict((await s.execute(
                select(UserORM.id, UserORM.name).where(UserORM.id.in_(before ^ after))
            )).tuples().all())
            added = ", ".join(sorted(names[u] for u in after - before if u in names))
            removed = ", ".join(sorted(names[u] for u in before - after if u in names))
            note = "; ".join(p for p in (f"Tillagda: {added}" if added else "", f"Borttagna: {removed}" if removed else "") if p)
            _audit(s, "UPDATE", group_id, group.name, "Grupp", actor, note)
            await s.commit()

    async def groups_of(self, user_id: UUID) -> list[GroupORM]:
        async with self._session_factory() as s:
            return list((await s.execute(
                select(GroupORM).join(GroupMemberORM, GroupMemberORM.group_id == GroupORM.id)
                .where(GroupMemberORM.user_id == user_id).order_by(GroupORM.name)
            )).scalars().all())

    async def existing_user_ids(self, user_ids: list[UUID]) -> set[UUID]:
        if not user_ids:
            return set()
        async with self._session_factory() as s:
            return set((await s.execute(select(UserORM.id).where(UserORM.id.in_(user_ids)))).scalars().all())

    async def get_user(self, user_id: UUID) -> UserORM | None:
        async with self._session_factory() as s:
            return await s.get(UserORM, user_id)
