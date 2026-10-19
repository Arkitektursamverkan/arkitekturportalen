"""Schemas for the GAP-analys IT-arkitektur (TOGAF) document."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class GapItem(BaseModel):
    id: str
    domain: str  # e.g. "Arkitekturstyrning"
    objekt: str
    nulaege: str
    onskat_laege: str
    gap_typ: str  # "saknas_helt" | "otillrackligt" | "ska_avvecklas" | "uppfyller_malbild"
    konsekvens: str
    atgard: str
    ansvarig: str = ""
    deadline: str = ""
    prioritet: str = ""  # "HOG" | "MELLAN" | "MINDRE" | ""


class RekommendationSection(BaseModel):
    id: str
    titel: str
    body: str = ""


class HandlingsplanOmrade(BaseModel):
    id: str
    nr: int
    titel: str
    ansvarig: str = ""
    aktiviteter_0_3: str = ""
    aktiviteter_3_6: str = ""
    aktiviteter_6_12: str = ""


class GapAnalysContent(BaseModel):
    items: list[GapItem] = Field(default_factory=list)
    rekommendationer: list[RekommendationSection] = Field(default_factory=list)
    handlingsplan: list[HandlingsplanOmrade] = Field(default_factory=list)


class GapAnalysRead(BaseModel):
    content: GapAnalysContent
    updated_at: datetime
    updated_by: str | None = None
