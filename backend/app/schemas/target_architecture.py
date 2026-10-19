"""Schemas for the Målarkitektur document."""
from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field


DomainKey = Literal["business", "data", "application", "technology"]


class FactBox(BaseModel):
    subject: str
    bullets: list[str] = Field(default_factory=list)
    instead_of: str = ""
    we_say: str = ""
    implications: list[str] = Field(default_factory=list)


class TextSection(BaseModel):
    """A plain section with a heading and free-form body text."""
    id: str
    kind: Literal["text"] = "text"
    title: str
    body: str = ""


class VisionSection(BaseModel):
    """A section that renders the domain pyramid (with side labels) and a body text."""
    id: str
    kind: Literal["vision"] = "vision"
    title: str
    body: str = ""


class DomainSection(BaseModel):
    """A section dedicated to one architecture domain."""
    id: str
    kind: Literal["domain"] = "domain"
    title: str
    domain_key: DomainKey
    describes: str = ""
    answers: str = ""
    desired_state: list[str] = Field(default_factory=list)
    fact_boxes: list[FactBox] = Field(default_factory=list)


Section = Annotated[
    Union[TextSection, VisionSection, DomainSection],
    Field(discriminator="kind"),
]


class TargetArchitectureContent(BaseModel):
    sections: list[Section] = Field(default_factory=list)


class TargetArchitectureRead(BaseModel):
    content: TargetArchitectureContent
    updated_at: datetime
    updated_by: str | None = None
