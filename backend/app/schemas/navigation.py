"""The left menu as an admin arranged it.

The web app owns what the entries mean (frontend/src/config/navigation.tsx):
the blocks render themselves (Domän, Rapporter …), a group is a folding
heading over pages, an item is one page. The API checks the shape only;
pages the web app does not know are left out when it draws the menu, and
pages of a switched-off module are hidden as everywhere else."""
from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, Field, field_validator

NavBlock = Literal["home", "calendar", "domains", "collaboration", "reports", "admin"]
NavGroupIcon = Literal[
    "account_balance", "folder", "gavel", "flag", "route", "menu_book", "groups", "build", "star", "lightbulb",
]
PagePath = Annotated[str, Field(min_length=1, max_length=200, pattern=r"^/[^/]")]


class NavBlockEntry(BaseModel):
    type: Literal["block"]
    key: NavBlock


class NavGroupEntry(BaseModel):
    type: Literal["group"]
    id: str = Field(..., min_length=1, max_length=64, pattern=r"^[a-z0-9-]+$")
    label: str = Field(..., min_length=1, max_length=60)
    icon: NavGroupIcon = "folder"
    items: list[PagePath] = Field(default_factory=list, max_length=30)


class NavItemEntry(BaseModel):
    type: Literal["item"]
    path: PagePath


NavEntry = Annotated[NavBlockEntry | NavGroupEntry | NavItemEntry, Field(discriminator="type")]


class Navigation(BaseModel):
    entries: list[NavEntry] = Field(..., max_length=40)

    @field_validator("entries")
    @classmethod
    def _each_once(cls, entries: list) -> list:  # type: ignore[type-arg]
        blocks = [e.key for e in entries if isinstance(e, NavBlockEntry)]
        groups = [e.id for e in entries if isinstance(e, NavGroupEntry)]
        if len(blocks) != len(set(blocks)):
            raise ValueError("Ett block kan bara finnas en gång i menyn")
        if len(groups) != len(set(groups)):
            raise ValueError("Varje grupp ska ha ett eget id")
        pages = [e.path for e in entries if isinstance(e, NavItemEntry)]
        pages += [p for e in entries if isinstance(e, NavGroupEntry) for p in e.items]
        if len(pages) != len(set(pages)):
            raise ValueError("En sida kan bara finnas på ett ställe i menyn")
        return entries
