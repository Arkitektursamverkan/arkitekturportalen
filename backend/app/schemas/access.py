"""Schemas for Behörigheter — roles, groups, grants and access explanations."""
from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from app.access import MANAGED_TYPES, PERMISSIONS, PRINCIPAL_ROLES

PrincipalType = Literal["everyone", "role", "group", "user"]
ScopeType = Literal["all", "types", "node"]
# How a grant reaches an object: all objects, the object's type, the object
# itself, or a process above it whose grant includes sub-processes.
Via = Literal["all", "type", "node", "inherited"]


class AccessMeta(BaseModel):
    permissions: list[str] = list(PERMISSIONS)
    node_types: list[str] = list(MANAGED_TYPES)
    principal_roles: list[str] = list(PRINCIPAL_ROLES)


def _check_permissions(perms: list[str]) -> list[str]:
    unknown = [p for p in perms if p not in PERMISSIONS]
    if unknown:
        raise ValueError(f"Okända rättigheter: {', '.join(unknown)}")
    # Keep the canonical order so the matrix reads the same everywhere.
    return [p for p in PERMISSIONS if p in perms]


# ── Roles ───────────────────────────────────────────────────────────────────

class RoleRead(BaseModel):
    id: UUID
    key: str
    name: str
    description: str
    permissions: list[str]
    builtin: bool
    sort_order: int
    grant_count: int = 0


class RoleCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: str = ""
    permissions: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def _perms(self) -> RoleCreate:
        self.permissions = _check_permissions(self.permissions)
        return self


class RoleUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    description: str | None = None
    permissions: list[str] | None = None

    @model_validator(mode="after")
    def _perms(self) -> RoleUpdate:
        if self.permissions is not None:
            self.permissions = _check_permissions(self.permissions)
        return self


# ── Groups ──────────────────────────────────────────────────────────────────

class UserBrief(BaseModel):
    id: UUID
    name: str
    email: str


class GroupRead(BaseModel):
    id: UUID
    name: str
    description: str
    members: list[UserBrief]


class GroupCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=150)
    description: str = ""
    member_ids: list[UUID] = Field(default_factory=list, max_length=1000)


class GroupUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=150)
    description: str | None = None


class GroupMembers(BaseModel):
    user_ids: list[UUID] = Field(default_factory=list, max_length=1000)


# ── Grants ──────────────────────────────────────────────────────────────────

class GrantRead(BaseModel):
    id: UUID
    principal_type: PrincipalType
    principal_role: str | None
    group_id: UUID | None
    user_id: UUID | None
    principal_name: str | None
    role_id: UUID
    role_key: str
    role_name: str
    permissions: list[str]
    scope_type: ScopeType
    node_types: list[str]
    node_id: UUID | None
    node_name: str | None
    node_type: str | None
    include_children: bool
    note: str
    created_at: datetime
    created_by: str | None


class GrantCreate(BaseModel):
    principal_type: PrincipalType
    principal_role: str | None = None
    group_id: UUID | None = None
    user_id: UUID | None = None
    role_id: UUID
    scope_type: ScopeType
    node_types: list[str] = Field(default_factory=list)
    node_id: UUID | None = None
    include_children: bool = False
    note: str = ""

    @model_validator(mode="after")
    def _consistent(self) -> GrantCreate:
        # Exactly the fields the principal and scope need — nothing left over
        # that could later be read as meaning something.
        if self.principal_type == "role":
            if self.principal_role not in PRINCIPAL_ROLES:
                raise ValueError("Ange en global roll")
        else:
            self.principal_role = None
        if self.principal_type == "group" and not self.group_id:
            raise ValueError("Ange en grupp")
        if self.principal_type != "group":
            self.group_id = None
        if self.principal_type == "user" and not self.user_id:
            raise ValueError("Ange en användare")
        if self.principal_type != "user":
            self.user_id = None

        if self.scope_type == "types":
            unknown = [t for t in self.node_types if t not in MANAGED_TYPES]
            if unknown or not self.node_types:
                raise ValueError("Ange minst en objekttyp")
            self.node_types = [t for t in MANAGED_TYPES if t in self.node_types]
        else:
            self.node_types = []
        if self.scope_type == "node" and not self.node_id:
            raise ValueError("Ange ett objekt")
        if self.scope_type != "node":
            self.node_id = None
            self.include_children = False
        return self


# ── Explanations ────────────────────────────────────────────────────────────

class GrantReach(BaseModel):
    """A grant that reaches an object, and how."""

    grant: GrantRead
    via: Via
    # For `inherited`: the process the grant is on.
    inherited_from_id: UUID | None = None
    inherited_from_name: str | None = None


class NodeAccess(BaseModel):
    """Vem har åtkomst? — every grant reaching the object."""

    node_id: UUID
    node_name: str
    node_type: str
    grants: list[GrantReach]
    # Admins have full access without any grant.
    admins: list[UserBrief]


class AccessCheck(BaseModel):
    """Kontrollera åtkomst — one user on one object."""

    user: UserBrief
    user_role: str
    is_admin: bool
    groups: list[str]
    permissions: list[str]
    grants: list[GrantReach]
