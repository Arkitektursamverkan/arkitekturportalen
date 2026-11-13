"""Abstract GraphRepository — one interface, two adapters (Postgres & Neo4j).

All graph operations go through this interface. Neither the API layer nor the
service layer imports from the concrete adapters directly.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any
from uuid import UUID

from app.schemas.common import GraphData, IntegrationDirection
from app.schemas.edge import EdgeCreate, EdgeRead
from app.schemas.node import NodeCreate, NodeRead, NodeUpdate


class GraphRepository(ABC):
    """Contract for all graph storage backends."""

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    @abstractmethod
    async def initialize(self) -> None:
        """Create tables / constraints if they don't exist yet."""

    @abstractmethod
    async def close(self) -> None:
        """Release connections / close drivers."""

    # ── Nodes ─────────────────────────────────────────────────────────────────

    @abstractmethod
    async def get_node(self, node_id: UUID) -> NodeRead | None:
        """Return a single node by primary key."""

    @abstractmethod
    async def list_nodes(
        self,
        node_type: str | None = None,
        external_source: str | None = None,
        archived: bool = False,
        limit: int = 200,
        offset: int = 0,
    ) -> list[NodeRead]:
        """Return nodes, optionally filtered by type / external source."""

    async def list_node_refs(self, node_types: list[str]) -> list[tuple[str, str]]:
        """(id, type) for every object of the given types, archived too.

        What the access checks need – nothing more. Adapters that can fetch
        just the two columns override this; the default goes via list_nodes."""
        out: list[tuple[str, str]] = []
        for t in node_types:
            for archived in (False, True):
                for n in await self.list_nodes(node_type=t, archived=archived, limit=100_000):
                    out.append((str(n.id), n.type.value if hasattr(n.type, "value") else str(n.type)))
        return out

    @abstractmethod
    async def create_node(self, data: NodeCreate, user_name: str | None = None) -> NodeRead:
        """Persist a new node and return it with server-generated fields.
        `user_name` is who made the change, for the audit log."""

    @abstractmethod
    async def update_node(self, node_id: UUID, data: NodeUpdate, user_name: str | None = None) -> NodeRead | None:
        """Partial-update a node; return None if not found."""

    @abstractmethod
    async def update_node_fields(
        self, node_id: UUID, values: dict[str, str | None], user_name: str | None = None
    ) -> NodeRead | None:
        """Write own field values on a node (None clears one); None if not found."""

    @abstractmethod
    async def delete_node(self, node_id: UUID, user_name: str | None = None) -> bool:
        """Delete a node (cascades to its edges); return True if deleted."""

    @abstractmethod
    async def upsert_node_by_external(
        self,
        external_source: str,
        external_id: str,
        data: NodeCreate,
    ) -> tuple[NodeRead, bool]:
        """
        Insert or update a node matched on (external_source, external_id).

        Returns (node, created) where created=True means a new row was inserted.
        Sets last_synced_at to now().
        """

    # ── Edges ─────────────────────────────────────────────────────────────────

    @abstractmethod
    async def get_edge(self, edge_id: UUID) -> EdgeRead | None:
        """Return a single edge by primary key."""

    @abstractmethod
    async def list_edges(
        self,
        source_id: UUID | None = None,
        target_id: UUID | None = None,
        edge_type: str | None = None,
    ) -> list[EdgeRead]:
        """Return edges, optionally filtered."""

    @abstractmethod
    async def create_edge(self, data: EdgeCreate) -> EdgeRead:
        """Persist a directed edge."""

    @abstractmethod
    async def delete_edge(self, edge_id: UUID) -> bool:
        """Delete an edge; return True if deleted."""

    @abstractmethod
    async def update_edge_note(self, edge_id: UUID, note: str | None) -> EdgeRead | None:
        """Update the note on an edge; return updated edge or None if not found."""

    @abstractmethod
    async def update_edge_direction(
        self, edge_id: UUID, direction: IntegrationDirection
    ) -> EdgeRead | None:
        """Set which way an integration flows; None if the edge is not found."""

    @abstractmethod
    async def update_edge_fields(self, edge_id: UUID, values: dict[str, str | None]) -> EdgeRead | None:
        """Write own field values on an edge (None clears one); None if not found."""

    # ── Graph views ───────────────────────────────────────────────────────────

    @abstractmethod
    async def get_process_e2e(self, process_id: UUID) -> GraphData:
        """
        End-to-end graph for one Process:
          Process ← (SUPPORTS) ← Application
          Application → (HANDLES) → InformationObject
          InformationObject ← (REALIZES) ← InformationSource
          Application → (RUNS_ON) → TechnologyComponent
        """

    @abstractmethod
    async def get_system_view(self, app_id: UUID) -> GraphData:
        """
        System-centric graph for one Application:
          Application → (SUPPORTS) → Process
          Application → (HANDLES) → InformationObject
          Application → (CONTAINS) → InformationSource
          Application → (RUNS_ON) → TechnologyComponent
          Application ↔ (INTEGRATES_WITH) ↔ Application
        """

    @abstractmethod
    async def get_landscape(self) -> GraphData:
        """All Applications with their INTEGRATES_WITH edges."""

    # ── Analysis ──────────────────────────────────────────────────────────────

    @abstractmethod
    async def get_overlaps(self) -> dict[str, Any]:
        """
        Returns:
          overlapping_processes: processes supported by more than one application
          overlapping_info_objects: info objects handled by more than one application
        """

    @abstractmethod
    async def get_gaps(self) -> dict[str, Any]:
        """
        Returns:
          unsupported_processes: processes with no supporting application
          unrealized_info_objects: info objects with no InformationSource realizing them
          orphaned_applications: applications supporting no process
        """

    # ── Search ────────────────────────────────────────────────────────────────

    @abstractmethod
    async def search_nodes(self, query: str, limit: int = 20) -> list[NodeRead]:
        """Full-text / ILIKE search over node name and description."""
