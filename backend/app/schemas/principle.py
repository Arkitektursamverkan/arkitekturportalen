"""Architecture principle schemas — typed wrapper around Node with attributes JSONB."""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import PrincipleDomain, PrincipleStatus
from app.schemas.node import NodeRead


class PrincipleCreate(BaseModel):
    identifier: str = Field(..., min_length=1, max_length=20)
    domain: PrincipleDomain
    name: str = Field(..., min_length=1, max_length=255)
    purpose: str = ""
    not_: str = Field("", alias="not")
    but: str = ""
    means: str = ""
    status: PrincipleStatus = PrincipleStatus.PROPOSAL

    model_config = {"populate_by_name": True}


class PrincipleUpdate(BaseModel):
    identifier: str | None = Field(default=None, min_length=1, max_length=20)
    domain: PrincipleDomain | None = None
    name: str | None = Field(default=None, min_length=1, max_length=255)
    purpose: str | None = None
    not_: str | None = Field(default=None, alias="not")
    but: str | None = None
    means: str | None = None
    status: PrincipleStatus | None = None

    model_config = {"populate_by_name": True}


class PrincipleRead(BaseModel):
    id: UUID
    identifier: str
    domain: PrincipleDomain
    name: str
    purpose: str
    not_: str = Field(..., alias="not")
    but: str
    means: str
    status: PrincipleStatus
    created_at: datetime
    updated_at: datetime

    model_config = {"populate_by_name": True}

    @classmethod
    def from_node(cls, node: NodeRead) -> "PrincipleRead":
        attrs = node.attributes or {}
        return cls(
            id=node.id,
            identifier=str(attrs.get("identifier", "")),
            domain=PrincipleDomain(attrs.get("domain", PrincipleDomain.OVERARCHING.value)),
            name=node.name,
            purpose=str(attrs.get("purpose", "")),
            **{"not": str(attrs.get("not", ""))},
            but=str(attrs.get("but", "")),
            means=str(attrs.get("means", "")),
            status=PrincipleStatus(attrs.get("status", PrincipleStatus.PROPOSAL.value)),
            created_at=node.created_at,
            updated_at=node.updated_at,
        )
