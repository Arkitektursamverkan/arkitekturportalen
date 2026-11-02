"""Behörigheter — roles, groups and grants, and explaining who may do what.

Managing roles, groups and grants is for admins. "Vem har åtkomst?" on an
object is also open to those who manage the object's content, so a
förvaltare can see who else reaches what they are responsible for.
"""
from __future__ import annotations

import re
import unicodedata
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.exc import IntegrityError

from app.access import PERMISSIONS, load_policy
from app.auth import CurrentUser
from app.authz import node_permissions
from app.dal.access_repository import GrantView
from app.dal.postgres_repository import PostgresRepository
from app.dependencies import get_repository, require_admin, require_user
from app.schemas.access import (
    AccessCheck,
    AccessMeta,
    GrantCreate,
    GrantReach,
    GrantRead,
    GroupCreate,
    GroupMembers,
    GroupRead,
    GroupUpdate,
    NodeAccess,
    RoleCreate,
    RoleRead,
    RoleUpdate,
    UserBrief,
)

router = APIRouter(prefix="/access", tags=["access"])

# How the audit log and error messages name the principals and types.
_ROLE_NAMES = {"user": "Användare", "superuser": "Superanvändare"}
_TYPE_NAMES = {
    "Process": "Processer", "Application": "Applikationer", "InformationObject": "Informationsobjekt",
    "InformationSource": "Informationskällor", "TechnologyComponent": "Teknikkomponenter",
    "Server": "Servrar och servertjänster", "ArchitecturePrinciple": "Arkitekturprinciper",
    "CustomObject": "Egna listor",
}


def _pg_repo() -> PostgresRepository:
    repo = get_repository()
    if not isinstance(repo, PostgresRepository):
        raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Kräver PostgreSQL-backend")
    return repo


def _actor(user: CurrentUser) -> str | None:
    return user.email or user.name or None


def _grant_read(g: GrantView) -> GrantRead:
    return GrantRead(**{k: getattr(g, k) for k in GrantRead.model_fields})


def _summary(g: GrantView) -> str:
    """One line for the audit log: who → role → what."""
    who = {
        "everyone": "Alla inloggade",
        "role": f"Global roll {_ROLE_NAMES.get(g.principal_role or '', g.principal_role)}",
    }.get(g.principal_type) or g.principal_name or "?"
    if g.scope_type == "all":
        what = "alla objekt"
    elif g.scope_type == "types":
        what = ", ".join(_TYPE_NAMES.get(t, t) for t in g.node_types)
    else:
        what = (g.node_name or str(g.node_id)) + (" med underprocesser" if g.include_children else "")
    return f"{who} → {g.role_name} → {what}"


def _slug(name: str) -> str:
    folded = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "_", folded).strip("_")[:40] or "roll"


# ── Meta ────────────────────────────────────────────────────────────────────

@router.get("/meta", response_model=AccessMeta)
async def meta(_user: CurrentUser = Depends(require_user)) -> AccessMeta:
    """The fixed vocabulary: permission keys, object types, global roles."""
    return AccessMeta()


# ── Roles ───────────────────────────────────────────────────────────────────

def _role_read(r: Any, count: int = 0) -> RoleRead:
    return RoleRead(
        id=r.id, key=r.key, name=r.name, description=r.description, permissions=list(r.permissions or []),
        builtin=r.builtin, sort_order=r.sort_order, grant_count=count,
    )


@router.get("/roles", response_model=list[RoleRead])
async def list_roles(_admin: CurrentUser = Depends(require_admin)) -> list[RoleRead]:
    return [_role_read(r, n) for r, n in await _pg_repo().access.list_roles()]


@router.post("/roles", response_model=RoleRead, status_code=status.HTTP_201_CREATED)
async def create_role(data: RoleCreate, admin: CurrentUser = Depends(require_admin)) -> RoleRead:
    repo = _pg_repo()
    existing = {r.key for r, _ in await repo.access.list_roles()}
    key, n = _slug(data.name), 2
    while key in existing:
        key, n = f"{_slug(data.name)[:36]}_{n}", n + 1
    row = await repo.access.create_role(
        {"key": key, "name": data.name.strip(), "description": data.description.strip(),
         "permissions": data.permissions, "sort_order": 100},
        _actor(admin),
    )
    return _role_read(row)


@router.patch("/roles/{role_id}", response_model=RoleRead)
async def update_role(role_id: UUID, data: RoleUpdate, admin: CurrentUser = Depends(require_admin)) -> RoleRead:
    fields = data.model_dump(exclude_none=True)
    if "name" in fields:
        fields["name"] = fields["name"].strip()
    row = await _pg_repo().access.update_role(role_id, fields, _actor(admin))
    if row is None:
        raise HTTPException(status_code=404, detail="Rollen finns inte")
    return _role_read(row)


@router.delete("/roles/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_role(role_id: UUID, admin: CurrentUser = Depends(require_admin)) -> Response:
    repo = _pg_repo()
    row = await repo.access.get_role(role_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Rollen finns inte")
    if row.builtin:
        raise HTTPException(status_code=400, detail="En inbyggd roll kan inte tas bort")
    try:
        await repo.access.delete_role(role_id, _actor(admin))
    except IntegrityError:
        raise HTTPException(status_code=409, detail="Rollen används i tilldelningar – ta bort dem först")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── Groups ──────────────────────────────────────────────────────────────────

def _group_read(g: Any, members: list[Any]) -> GroupRead:
    return GroupRead(
        id=g.id, name=g.name, description=g.description,
        members=[UserBrief(id=u.id, name=u.name, email=u.email) for u in members],
    )


async def _group(group_id: UUID) -> GroupRead:
    for g, members in await _pg_repo().access.list_groups():
        if g.id == group_id:
            return _group_read(g, members)
    raise HTTPException(status_code=404, detail="Gruppen finns inte")


async def _check_members(user_ids: list[UUID]) -> list[UUID]:
    ids = list(dict.fromkeys(user_ids))
    if set(ids) - await _pg_repo().access.existing_user_ids(ids):
        raise HTTPException(status_code=400, detail="En eller flera användare finns inte")
    return ids


@router.get("/groups", response_model=list[GroupRead])
async def list_groups(_admin: CurrentUser = Depends(require_admin)) -> list[GroupRead]:
    return [_group_read(g, m) for g, m in await _pg_repo().access.list_groups()]


@router.post("/groups", response_model=GroupRead, status_code=status.HTTP_201_CREATED)
async def create_group(data: GroupCreate, admin: CurrentUser = Depends(require_admin)) -> GroupRead:
    repo = _pg_repo()
    name = data.name.strip()
    if await repo.access.group_name_taken(name):
        raise HTTPException(status_code=400, detail="Det finns redan en grupp med det namnet")
    members = await _check_members(data.member_ids)
    row = await repo.access.create_group(name, data.description.strip(), _actor(admin))
    if members:
        await repo.access.set_group_members(row.id, members, _actor(admin))
    return await _group(row.id)


@router.patch("/groups/{group_id}", response_model=GroupRead)
async def update_group(group_id: UUID, data: GroupUpdate, admin: CurrentUser = Depends(require_admin)) -> GroupRead:
    repo = _pg_repo()
    fields = {k: v.strip() for k, v in data.model_dump(exclude_none=True).items()}
    if "name" in fields and await repo.access.group_name_taken(fields["name"], except_id=group_id):
        raise HTTPException(status_code=400, detail="Det finns redan en grupp med det namnet")
    if await repo.access.update_group(group_id, fields, _actor(admin)) is None:
        raise HTTPException(status_code=404, detail="Gruppen finns inte")
    return await _group(group_id)


@router.put("/groups/{group_id}/members", response_model=GroupRead)
async def set_members(group_id: UUID, data: GroupMembers, admin: CurrentUser = Depends(require_admin)) -> GroupRead:
    repo = _pg_repo()
    if await repo.access.get_group(group_id) is None:
        raise HTTPException(status_code=404, detail="Gruppen finns inte")
    await repo.access.set_group_members(group_id, await _check_members(data.user_ids), _actor(admin))
    return await _group(group_id)


@router.delete("/groups/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_group(group_id: UUID, admin: CurrentUser = Depends(require_admin)) -> Response:
    if not await _pg_repo().access.delete_group(group_id, _actor(admin)):
        raise HTTPException(status_code=404, detail="Gruppen finns inte")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── Grants ──────────────────────────────────────────────────────────────────

@router.get("/grants", response_model=list[GrantRead])
async def list_grants(_admin: CurrentUser = Depends(require_admin)) -> list[GrantRead]:
    return [_grant_read(g) for g in await _pg_repo().access.list_grants()]


@router.post("/grants", response_model=GrantRead, status_code=status.HTTP_201_CREATED)
async def create_grant(data: GrantCreate, admin: CurrentUser = Depends(require_admin)) -> GrantRead:
    repo = _pg_repo()
    if await repo.access.get_role(data.role_id) is None:
        raise HTTPException(status_code=400, detail="Rollen finns inte")
    if data.group_id and await repo.access.get_group(data.group_id) is None:
        raise HTTPException(status_code=400, detail="Gruppen finns inte")
    if data.user_id and not await repo.access.existing_user_ids([data.user_id]):
        raise HTTPException(status_code=400, detail="Användaren finns inte")
    if data.node_id:
        node = await repo.get_node(data.node_id)
        if node is None:
            raise HTTPException(status_code=400, detail="Objektet finns inte")
        if data.include_children and str(getattr(node.type, "value", node.type)) != "Process":
            raise HTTPException(status_code=400, detail="Bara en process har underprocesser")

    fields = data.model_dump()
    fields["note"] = fields["note"].strip()
    # Describe it before it exists, for the audit line.
    role = await repo.access.get_role(data.role_id)
    draft = GrantView(
        id=UUID(int=0), created_at=None, created_by=None, role_key=role.key, role_name=role.name,  # type: ignore[arg-type, union-attr]
        permissions=[], **fields,
    )
    await repo.access.describe([draft])
    grant_id = await repo.access.create_grant(fields, _actor(admin), _summary(draft))
    created = await repo.access.get_grant(grant_id)
    return _grant_read((await repo.access.describe([created]))[0])  # type: ignore[list-item]


@router.delete("/grants/{grant_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_grant(grant_id: UUID, admin: CurrentUser = Depends(require_admin)) -> Response:
    repo = _pg_repo()
    grant = await repo.access.get_grant(grant_id)
    if grant is None:
        raise HTTPException(status_code=404, detail="Tilldelningen finns inte")
    await repo.access.describe([grant])
    await repo.access.delete_grant(grant_id, _actor(admin), _summary(grant))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── Explaining ──────────────────────────────────────────────────────────────

async def _ancestors(node: Any) -> list[tuple[str, str]]:
    """(id, name) of the processes above the object, nearest first."""
    if str(getattr(node.type, "value", node.type)) != "Process":
        return []
    repo = _pg_repo()
    parents = await repo.access.process_parents()
    out: list[tuple[str, str]] = []
    seen = {str(node.id)}
    parent = parents.get(str(node.id))
    while parent and parent not in seen:
        seen.add(parent)
        p = await repo.get_node(UUID(parent))
        if p is None:
            break
        out.append((parent, p.name))
        parent = parents.get(parent)
    return out


def _reach(g: GrantView, node: Any, ancestors: list[tuple[str, str]]) -> GrantReach | None:
    node_type = str(getattr(node.type, "value", node.type))
    if g.scope_type == "all":
        return GrantReach(grant=_grant_read(g), via="all")
    if g.scope_type == "types" and node_type in g.node_types:
        return GrantReach(grant=_grant_read(g), via="type")
    if g.scope_type == "node" and g.node_id is not None:
        if str(g.node_id) == str(node.id):
            return GrantReach(grant=_grant_read(g), via="node")
        if g.include_children:
            for aid, aname in ancestors:
                if aid == str(g.node_id):
                    return GrantReach(grant=_grant_read(g), via="inherited", inherited_from_id=UUID(aid), inherited_from_name=aname)
    return None


async def _node_or_404(node_id: UUID) -> Any:
    node = await _pg_repo().get_node(node_id)
    if node is None:
        raise HTTPException(status_code=404, detail="Node not found")
    return node


@router.get("/nodes/{node_id}", response_model=NodeAccess)
async def node_access(node_id: UUID, user: CurrentUser = Depends(require_user)) -> NodeAccess:
    """Vem har åtkomst? — every grant reaching the object, and the admins."""
    repo = _pg_repo()
    node = await _node_or_404(node_id)
    policy = await load_policy(user)
    policy.ensure_visible(node)
    if not (policy.full or node_permissions(policy, node).manage):
        raise HTTPException(status_code=403, detail="Behörighet saknas")

    ancestors = await _ancestors(node)
    grants = await repo.access.describe(await repo.access.list_grants())
    reaches = [r for g in grants if (r := _reach(g, node, ancestors))]
    admins = [UserBrief(id=u.id, name=u.name, email=u.email) for u in await repo.list_users() if u.role == "admin"]
    return NodeAccess(
        node_id=node.id, node_name=node.name, node_type=str(getattr(node.type, "value", node.type)),
        grants=reaches, admins=admins,
    )


@router.get("/check", response_model=AccessCheck)
async def check_access(user_id: UUID, node_id: UUID, _admin: CurrentUser = Depends(require_admin)) -> AccessCheck:
    """Kontrollera åtkomst — what one user may do with one object, and why."""
    repo = _pg_repo()
    target = await repo.access.get_user(user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="Användaren finns inte")
    node = await _node_or_404(node_id)
    as_user = CurrentUser(id=str(target.id), entra_oid=target.entra_oid or "", name=target.name, email=target.email, role=target.role)

    policy = await load_policy(as_user)
    ancestors = await _ancestors(node)
    grants = await repo.access.describe(await repo.access.grants_for(as_user))
    return AccessCheck(
        user=UserBrief(id=target.id, name=target.name, email=target.email),
        user_role=target.role,
        is_admin=policy.full,
        groups=[g.name for g in await repo.access.groups_of(target.id)],
        permissions=[p for p in PERMISSIONS if p in policy.perms(node.id, node.type)],
        grants=[r for g in grants if (r := _reach(g, node, ancestors))],
    )
