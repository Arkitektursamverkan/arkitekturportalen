"""Abstract connector interface for external EA data sources."""
from __future__ import annotations

from abc import ABC
from dataclasses import dataclass


@dataclass
class SystemDTO:
    external_id: str
    name: str
    description: str | None = None
    attributes: dict | None = None


@dataclass
class ProcessDTO:
    external_id: str
    name: str
    description: str | None = None
    attributes: dict | None = None


class BaseConnector(ABC):
    """
    Pluggable connector with two modes:
      - mock: load from local seed JSON (default, no credentials needed)
      - api:  call the live external API (placeholder — set mode='api' and provide creds)
    """

    def __init__(self, mode: str = "mock") -> None:
        self.mode = mode
