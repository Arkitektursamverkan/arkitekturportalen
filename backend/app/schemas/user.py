"""User schemas."""
from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

Role = Literal["user", "superuser", "admin"]
AccessLevel = Literal["none", "read", "edit"]


class UserRead(BaseModel):
    id: UUID
    entra_oid: str | None
    name: str
    email: str
    role: str
    is_local: bool
    is_provisioned: bool
    is_active: bool = True
    created_at: datetime
    last_login_at: datetime | None

    model_config = {"from_attributes": True}


class UserMe(BaseModel):
    id: str
    name: str
    email: str
    role: str
    # Servrar: "read" also when a grant reaches only some servers; the UI
    # decides from it whether to offer the page at all.
    access: dict[str, AccessLevel] = Field(default_factory=dict)
    # Level per object type that holds for every object of the type — what
    # create buttons go by. Per-object rights come with each object.
    type_access: dict[str, AccessLevel] = Field(default_factory=dict)


class UserRoleUpdate(BaseModel):
    role: Role


class LocalUserCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=8, max_length=128)
    role: Role = "user"


class UserActiveUpdate(BaseModel):
    active: bool


class PasswordReset(BaseModel):
    password: str = Field(..., min_length=8, max_length=128)


# ── User provisioning (matchningslista) ─────────────────────────────────────

class ProvisionSource(BaseModel):
    """Where a candidate was found: a node attribute holding a system role."""

    node_id: UUID
    node_name: str
    node_type: str
    attribute_key: str


class ProvisionCandidate(BaseModel):
    name: str
    suggested_email: str
    email_is_guessed: bool
    roles: list[str]
    sources: list[ProvisionSource]
    existing_user_id: UUID | None = None


class ProvisionUserIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    email: str = Field(..., min_length=3, max_length=255)
    role: Role = "user"


class ProvisionRequest(BaseModel):
    users: list[ProvisionUserIn] = Field(..., min_length=1, max_length=500)


class ProvisionSkipped(BaseModel):
    email: str
    reason: str


class ProvisionResult(BaseModel):
    created: list[UserRead]
    skipped: list[ProvisionSkipped]
