"""Gemensamma snabblänkar: länkar en administratör lägger upp för alla.

De visas först under Snabblänkar på startsidan, före var och ens egna
genvägar. En länk kan gå till en annan webbplats (http/https) eller till en
sökväg på samma server (/…), till exempel en tjänst som ligger bredvid
portalen. Andra adresser (javascript:, data:, //värd, /\\värd) tas inte emot."""
from __future__ import annotations

import re

from pydantic import BaseModel, Field, field_validator

MAX_LINKS = 12
# En sökväg börjar med exakt ett / följt av något annat än / eller \ –
# webbläsare läser både //värd och /\värd som en adress till en annan värd.
_URL_RE = re.compile(r"^(https?://[^\s/\\$.?#][^\s]*|/(?![/\\])[^\s]*)$", re.IGNORECASE)
# Styrtecken (C0, DEL, C1): webbläsare tar tyst bort somliga, så att det som
# kontrollerades inte är det som öppnas.
_CONTROL_RE = re.compile(r"[\x00-\x1f\x7f-\x9f]")


def check_link_url(v: str) -> str:
    """A web address (http/https) or a path on this server (/…); raises ValueError otherwise."""
    v = v.strip()
    if _CONTROL_RE.search(v) or not _URL_RE.match(v):
        raise ValueError("Adressen ska börja med https://, http:// eller / (en sida på samma server)")
    return v


class SharedLink(BaseModel):
    title: str = Field(..., min_length=1, max_length=60)
    url: str = Field(..., min_length=1, max_length=500)
    description: str | None = Field(None, max_length=140)
    # Öppna i en ny flik i stället för i samma.
    new_tab: bool = False

    @field_validator("title")
    @classmethod
    def _title(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Länken behöver en titel")
        return v

    @field_validator("url")
    @classmethod
    def _url(cls, v: str) -> str:
        return check_link_url(v)

    @field_validator("description")
    @classmethod
    def _description(cls, v: str | None) -> str | None:
        v = (v or "").strip()
        return v or None


class SharedLinks(BaseModel):
    links: list[SharedLink] = Field(default_factory=list, max_length=MAX_LINKS)
