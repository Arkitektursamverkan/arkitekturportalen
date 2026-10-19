"""SharePoint Systems connector.

mock mode: loads from seed/sharepoint_systems.json
api mode:  placeholder for live SharePoint REST API calls
"""
from __future__ import annotations

import json
from pathlib import Path

import structlog

from app.connectors.base import BaseConnector, SystemDTO

log = structlog.get_logger(__name__)

SEED_PATH = Path(__file__).parent.parent.parent / "seed" / "sharepoint_systems.json"


class SharePointConnector(BaseConnector):
    async def list_systems(self) -> list[SystemDTO]:
        if self.mode == "mock":
            return self._load_mock()
        return await self._fetch_live()

    def _load_mock(self) -> list[SystemDTO]:
        with SEED_PATH.open() as f:
            data = json.load(f)
        log.info("sharepoint.mock.loaded", count=len(data))
        return [
            SystemDTO(
                external_id=item["external_id"],
                name=item["name"],
                description=item.get("description"),
                attributes=item.get("attributes", {}),
            )
            for item in data
        ]

    async def _fetch_live(self) -> list[SystemDTO]:  # pragma: no cover
        """Placeholder — replace with actual SharePoint REST/Graph API call."""
        raise NotImplementedError(
            "Live SharePoint connector not implemented. Use mode='mock' for PoC."
        )
