"""Import service — orchestrates connector → transform → upsert pipeline."""
from __future__ import annotations

from dataclasses import dataclass

import structlog

from app.connectors.sharepoint import SharePointConnector
from app.connectors.two_c8 import TwoC8Connector
from app.dal.graph_repository import GraphRepository
from app.schemas.common import ExternalSource, NodeType
from app.schemas.node import NodeCreate

log = structlog.get_logger(__name__)


@dataclass
class ImportResult:
    source: str
    mode: str
    total: int
    created: int
    updated: int
    errors: list[str]


class ImportService:
    def __init__(self, repo: GraphRepository) -> None:
        self._repo = repo

    async def import_sharepoint(self, mode: str = "mock", prune: bool = False) -> ImportResult:
        """Import Application nodes from SharePoint."""
        connector = SharePointConnector(mode=mode)
        systems = await connector.list_systems()

        created = updated = 0
        errors: list[str] = []

        for sys in systems:
            try:
                node_data = NodeCreate(
                    type=NodeType.APPLICATION,
                    name=sys.name,
                    description=sys.description,
                    external_source=ExternalSource.SHAREPOINT,
                    external_id=sys.external_id,
                    attributes=sys.attributes or {},
                )
                _, was_created = await self._repo.upsert_node_by_external(
                    ExternalSource.SHAREPOINT.value,
                    sys.external_id,
                    node_data,
                )
                if was_created:
                    created += 1
                else:
                    updated += 1
            except Exception as exc:
                log.error("sharepoint.import.error", external_id=sys.external_id, error=str(exc))
                errors.append(f"{sys.external_id}: {exc}")

        log.info("sharepoint.import.done", created=created, updated=updated, errors=len(errors))
        return ImportResult(
            source="SHAREPOINT", mode=mode, total=len(systems),
            created=created, updated=updated, errors=errors,
        )

    async def import_2c8(self, mode: str = "mock", prune: bool = False) -> ImportResult:
        """Import Process nodes from 2C8."""
        connector = TwoC8Connector(mode=mode)
        processes = await connector.list_processes()

        created = updated = 0
        errors: list[str] = []

        for proc in processes:
            try:
                node_data = NodeCreate(
                    type=NodeType.PROCESS,
                    name=proc.name,
                    description=proc.description,
                    external_source=ExternalSource.TWO_C8,
                    external_id=proc.external_id,
                    attributes=proc.attributes or {},
                )
                _, was_created = await self._repo.upsert_node_by_external(
                    ExternalSource.TWO_C8.value,
                    proc.external_id,
                    node_data,
                )
                if was_created:
                    created += 1
                else:
                    updated += 1
            except Exception as exc:
                log.error("2c8.import.error", external_id=proc.external_id, error=str(exc))
                errors.append(f"{proc.external_id}: {exc}")

        log.info("2c8.import.done", created=created, updated=updated, errors=len(errors))
        return ImportResult(
            source="2C8", mode=mode, total=len(processes),
            created=created, updated=updated, errors=errors,
        )
