"""2C8 Process connector.

mock mode: loads from seed/2c8_processes.json
api mode:  placeholder for live 2C8 REST API / integration platform call

Note: The connector abstraction supports a future "integration-platform" mode
where the middle layer (e.g. Azure Logic Apps, MuleSoft) is called instead of
2C8 directly. Add a third branch in list_processes() when needed.
"""
from __future__ import annotations

import json
from pathlib import Path

import structlog

from app.connectors.base import BaseConnector, ProcessDTO

log = structlog.get_logger(__name__)

SEED_PATH = Path(__file__).parent.parent.parent / "seed" / "2c8_processes.json"


class TwoC8Connector(BaseConnector):
    async def list_processes(self) -> list[ProcessDTO]:
        if self.mode == "mock":
            return self._load_mock()
        return await self._fetch_live()

    def _load_mock(self) -> list[ProcessDTO]:
        with SEED_PATH.open() as f:
            data = json.load(f)
        log.info("2c8.mock.loaded", count=len(data))
        return [
            ProcessDTO(
                external_id=item["external_id"],
                name=item["name"],
                description=item.get("description"),
                attributes=item.get("attributes", {}),
            )
            for item in data
        ]

    async def _fetch_live(self) -> list[ProcessDTO]:  # pragma: no cover
        """Placeholder — replace with live 2C8 API or integration platform call."""
        raise NotImplementedError(
            "Live 2C8 connector not implemented. Use mode='mock' for PoC."
        )
