"""Which object lists an installation has under the architecture domains.

An admin can switch off some of the built-in lists and add lists of their own
(ea_org_settings.domain_lists; NULL = every built-in list, none added). The
setting lives in the database and nothing but the admin writes it, so it stays
as it is through upgrades.

A switched-off list is hidden for everyone (app.access) but keeps its objects,
and sync goes on filling it. An own list is a definition, and its objects are
of the one type CustomObject with attributes.list_key naming the list: object
types are fixed in the code and a stored type the code doesn't know breaks every
read.
"""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import NodeType

# The reports are built around Process, Application and InformationObject.
OPTIONAL_TYPES: tuple[str, ...] = ("InformationSource", "TechnologyComponent", "Server", "ServerService")

CUSTOM_TYPE = NodeType.CUSTOM_OBJECT.value
LIST_KEY = "list_key"
_KEY_PATTERN = r"^[a-z0-9][a-z0-9_-]{0,49}$"


class ListField(BaseModel):
    key: str = Field(pattern=r"^[^\s:]{1,50}$")
    label: str = Field(min_length=1, max_length=100)
    type: Literal["text", "number", "date", "choice", "link"] = "text"
    options: list[str] = Field(default_factory=list)


class CustomList(BaseModel):
    key: str = Field(pattern=_KEY_PATTERN)
    name: str = Field(min_length=1, max_length=100)
    domain: Literal["business", "information", "application", "technology"]
    active: bool = True
    fields: list[ListField] = Field(default_factory=list, max_length=50)

    @field_validator("fields")
    @classmethod
    def _unique_field_keys(cls, fields: list[ListField]) -> list[ListField]:
        keys = [f.key for f in fields]
        if len(keys) != len(set(keys)):
            raise ValueError("Två fält har samma nyckel")
        if LIST_KEY in keys:
            raise ValueError(f"Fältnyckeln {LIST_KEY} är reserverad")
        return fields


class DomainLists(BaseModel):
    disabled: list[str] = Field(default_factory=list)
    custom: list[CustomList] = Field(default_factory=list, max_length=100)

    @field_validator("disabled")
    @classmethod
    def _only_optional(cls, disabled: list[str]) -> list[str]:
        bad = sorted(set(disabled) - set(OPTIONAL_TYPES))
        if bad:
            raise ValueError(f"Går inte att stänga av: {', '.join(bad)}")
        return [t for t in OPTIONAL_TYPES if t in disabled]

    @field_validator("custom")
    @classmethod
    def _unique_lists(cls, custom: list[CustomList]) -> list[CustomList]:
        keys = [c.key for c in custom]
        names = [c.name.casefold() for c in custom]
        if len(keys) != len(set(keys)) or len(names) != len(set(names)):
            raise ValueError("Två listor har samma namn eller nyckel")
        return custom


def parse(stored: dict[str, Any] | None) -> DomainLists:
    return DomainLists.model_validate(stored) if stored else DomainLists()


def sync_target(node_type: str) -> tuple[NodeType, str | None]:
    """A sync target: a type name, or "CustomObject:<list key>" for an own list."""
    if ":" in node_type:
        base, key = node_type.split(":", 1)
        if base != CUSTOM_TYPE or not key:
            raise ValueError(f"Okänt mål: {node_type}")
        return NodeType.CUSTOM_OBJECT, key
    return NodeType(node_type), None
