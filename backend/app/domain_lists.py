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

An admin can also add fields of their own to the built-in object types and to
the connection types (`extra_fields`): a short text, or one of a few choices.
The values lie in the object's or the connection's attributes under the field's
key. Every such key starts with `x_`, so it can never collide with an attribute
the code or a synchronisation source owns – and so a synchronisation, which
otherwise replaces an object's attributes, knows what to leave alone
(`keep_own`).
"""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.common import EdgeType, NodeType

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


#: Every own field's key starts with this (see the module text).
OWN_PREFIX = "x_"
#: The longest value an own field holds.
OWN_VALUE_MAX = 500


class ExtraField(BaseModel):
    """A field an admin added to a built-in object type or a connection type."""

    key: str = Field(pattern=r"^x_[a-z0-9][a-z0-9_-]{0,46}$")
    label: str = Field(min_length=1, max_length=100)
    type: Literal["text", "choice"] = "text"
    options: list[str] = Field(default_factory=list, max_length=50)

    @field_validator("options")
    @classmethod
    def _clean_options(cls, options: list[str]) -> list[str]:
        cleaned = [o.strip() for o in options if o.strip()]
        if any(len(o) > 100 for o in cleaned):
            raise ValueError("Ett val får vara högst 100 tecken")
        if len(cleaned) != len(set(cleaned)):
            raise ValueError("Två val är likadana")
        return cleaned

    @model_validator(mode="after")
    def _choice_has_options(self) -> ExtraField:
        if self.type == "choice" and not self.options:
            raise ValueError(f"Fältet {self.label} saknar val")
        return self


def _unique_keys(fields: list[ExtraField]) -> list[ExtraField]:
    keys = [f.key for f in fields]
    labels = [f.label.casefold() for f in fields]
    if len(keys) != len(set(keys)) or len(labels) != len(set(labels)):
        raise ValueError("Två fält har samma namn eller nyckel")
    if len(fields) > 30:
        raise ValueError("Högst 30 egna fält per typ")
    return fields


class ExtraFields(BaseModel):
    """Own fields per object type and per connection type."""

    nodes: dict[str, list[ExtraField]] = Field(default_factory=dict)
    edges: dict[str, list[ExtraField]] = Field(default_factory=dict)

    @field_validator("nodes")
    @classmethod
    def _node_types(cls, nodes: dict[str, list[ExtraField]]) -> dict[str, list[ExtraField]]:
        # An own list has its fields in its own definition.
        known = {t.value for t in NodeType} - {CUSTOM_TYPE}
        if bad := sorted(set(nodes) - known):
            raise ValueError(f"Okänd objekttyp: {', '.join(bad)}")
        return {t: _unique_keys(f) for t, f in nodes.items() if f}

    @field_validator("edges")
    @classmethod
    def _edge_types(cls, edges: dict[str, list[ExtraField]]) -> dict[str, list[ExtraField]]:
        if bad := sorted(set(edges) - {t.value for t in EdgeType}):
            raise ValueError(f"Okänd kopplingstyp: {', '.join(bad)}")
        return {t: _unique_keys(f) for t, f in edges.items() if f}


class DomainLists(BaseModel):
    disabled: list[str] = Field(default_factory=list)
    custom: list[CustomList] = Field(default_factory=list, max_length=100)
    extra_fields: ExtraFields = Field(default_factory=ExtraFields)

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


def clean_own_values(fields: list[ExtraField], values: dict[str, Any]) -> dict[str, str | None]:
    """Values for own fields as they are stored: trimmed text, or None to clear.

    Raises ValueError (in Swedish, shown to the user) for a field the type does
    not have, a value that is not text, or a choice that is not offered."""
    by_key = {f.key: f for f in fields}
    out: dict[str, str | None] = {}
    for key, value in values.items():
        field = by_key.get(key)
        if field is None:
            raise ValueError(f"Okänt fält: {str(key)[:60]}")
        if value is None or (isinstance(value, str) and not value.strip()):
            out[key] = None
            continue
        if not isinstance(value, str):
            # A ValueError like the rest: the caller turns them all into one 422.
            raise ValueError(f"Fältet {field.label} ska vara text")  # noqa: TRY004
        text = value.strip()
        if len(text) > OWN_VALUE_MAX:
            raise ValueError(f"Fältet {field.label} får vara högst {OWN_VALUE_MAX} tecken")
        if field.type == "choice" and text not in field.options:
            raise ValueError(f"Fältet {field.label} har inget val {text[:60]}")
        out[key] = text
    return out


def with_own_values(attributes: dict[str, Any] | None, values: dict[str, str | None]) -> dict[str, Any]:
    """The attributes with own values written in; a None value removes the key."""
    attrs = dict(attributes or {})
    for key, value in values.items():
        if value is None:
            attrs.pop(key, None)
        else:
            attrs[key] = value
    return attrs


def keep_own(old: dict[str, Any] | None, new: dict[str, Any] | None) -> dict[str, Any]:
    """New attributes replacing old ones, the own values kept.

    Whoever replaces an object's attributes – a synchronisation, or a form that
    knows only its own fields – would otherwise wipe what people filled in. An
    own value goes only when the new attributes name its key."""
    attrs = dict(new or {})
    for key, value in (old or {}).items():
        if key.startswith(OWN_PREFIX) and key not in attrs:
            attrs[key] = value
    return attrs
