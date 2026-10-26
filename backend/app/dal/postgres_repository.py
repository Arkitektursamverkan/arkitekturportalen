"""PostgreSQL implementation of GraphRepository using SQLAlchemy 2.0 async."""
from __future__ import annotations

import random
import re
import secrets
import unicodedata
import uuid
from datetime import UTC, date, datetime
from typing import Any
from uuid import UUID

import structlog
from sqlalchemy import delete, exists, func, or_, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.dal.access_repository import (
    AccessRepository,  # also registers the role, group and grant models
)
from app.dal.graph_repository import GraphRepository
from app.dal.node_content_repository import (
    NodeContentRepository,  # also registers the document and note models
)
from app.dal.workspace_repository import (
    WorkspaceRepository,  # also registers the workspace models
)
from app.models.audit import AuditLogORM
from app.models.base import Base
from app.models.comment import CommentORM
from app.models.document_metadata import DocumentMetadataORM
from app.models.document_stamp import DocumentStampORM
from app.models.document_version import DocumentVersionORM
from app.models.edge import EdgeORM
from app.models.flag import NodeFlagORM
from app.models.gap_analys import GapAnalysORM
from app.models.gap_task import GapStatusLogORM, GapTaskORM
from app.models.glossary_request import GlossaryRequestORM
from app.models.glossary_term import GlossaryTermORM
from app.models.graph_snapshot import GraphSnapshotORM
from app.models.home_banner import HomeBannerORM
from app.models.home_block import HomeBlockORM
from app.models.node import NodeORM
from app.models.nulaagesanalys import NulaagesanalysORM
from app.models.principle_document import PrincipleDocumentORM
from app.models.published_report import PublishedReportORM
from app.models.report_name import ReportNameORM
from app.models.report_tag import ReportTagLinkORM, ReportTagORM
from app.models.solution_sketch import SolutionSketchORM
from app.models.survey import SurveyORM
from app.models.survey_response import SurveyResponseORM
from app.models.target_architecture import TargetArchitectureORM
from app.models.user import UserORM
from app.schemas.audit import AuditLogList, AuditLogRead
from app.schemas.common import (
    EdgeType,
    ExternalSource,
    GraphData,
    GraphEdgeOut,
    GraphNodeOut,
    IntegrationDirection,
    NodeType,
)
from app.schemas.document_stamp import JourneyDocumentStatus, JourneyStatusResponse
from app.schemas.edge import EdgeCreate, EdgeRead
from app.schemas.node import NodeCreate, NodeRead, NodeUpdate
from app.schemas.survey_logic import compute_visible_question_ids

log = structlog.get_logger(__name__)

# Which Process rows (aliased `n`) the analysis reports count — the same rule
# as `realProcesses` in the frontend: not hidden, not a grouping page (marked
# as structure, or parent of another process), and published in 2C8, i.e. its
# current version approved. Processes without a 2C8 state count as published.
COUNTED_PROCESS = """
    n.admin_hidden = false
    AND n.is_structure = false
    AND NOT EXISTS (
        SELECT 1 FROM ea_nodes c
        WHERE c.type = 'Process' AND c.archived = false
          AND c.attributes->>'parent_id' = n.id::text
    )
    AND COALESCE(NULLIF(n.attributes->>'workflow_state', ''), 'APPROVED') = 'APPROVED'
"""


def _node_to_read(n: NodeORM) -> NodeRead:
    return NodeRead(
        id=n.id,
        type=NodeType(n.type),
        name=n.name,
        description=n.description,
        external_source=ExternalSource(n.external_source),
        external_id=n.external_id,
        archived=n.archived,
        admin_hidden=getattr(n, "admin_hidden", False),
        is_structure=getattr(n, "is_structure", False),
        attributes=n.attributes or {},
        last_synced_at=n.last_synced_at,
        created_at=n.created_at,
        updated_at=n.updated_at,
    )


def _node_to_graph(n: NodeORM) -> GraphNodeOut:
    return GraphNodeOut(
        id=str(n.id),
        type=NodeType(n.type),
        name=n.name,
        description=n.description,
        external_source=ExternalSource(n.external_source),
        archived=n.archived,
        attributes=n.attributes or {},
    )


def _edge_to_read(e: EdgeORM) -> EdgeRead:
    return EdgeRead(
        id=e.id,
        source_id=e.source_id,
        target_id=e.target_id,
        type=EdgeType(e.type),
        attributes=e.attributes or {},
        created_at=e.created_at,
        updated_at=e.updated_at,
    )


def _edge_to_graph(e: EdgeORM) -> GraphEdgeOut:
    return GraphEdgeOut(
        id=str(e.id),
        source=str(e.source_id),
        target=str(e.target_id),
        type=EdgeType(e.type),
        attributes=e.attributes or {},
    )


def _node_snapshot(n: NodeORM) -> dict[str, Any]:
    return {
        "id": str(n.id),
        "type": n.type,
        "name": n.name,
        "description": n.description,
        "external_source": n.external_source,
        "external_id": n.external_id,
        "archived": n.archived,
        "attributes": n.attributes or {},
    }


def _edge_snapshot(e: EdgeORM) -> dict[str, Any]:
    return {
        "id": str(e.id),
        "source_id": str(e.source_id),
        "target_id": str(e.target_id),
        "type": e.type,
        "attributes": e.attributes or {},
    }


# Who the audit log names for rows written by imports and source syncs, so
# usage statistics can tell them from what people do in the app.
SYNC_AUDIT_USER = "Synkronisering"


class PostgresRepository(GraphRepository):
    def __init__(self, database_url: str) -> None:
        self._engine = create_async_engine(database_url, echo=False, pool_pre_ping=True)
        self._session_factory = async_sessionmaker(
            self._engine, class_=AsyncSession, expire_on_commit=False
        )
        # IT-arkitekturuppdrag lives in its own repository; it shares the
        # session factory but owns tables the graph never touches.
        self.workspaces = WorkspaceRepository(self._session_factory)
        # Dokument and Anteckningar on architecture objects, likewise apart.
        self.node_content = NodeContentRepository(self._session_factory)
        # Roles, groups and grants — who may see and do what (app/access.py).
        self.access = AccessRepository(self._session_factory)

    async def initialize(self) -> None:
        async with self._engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        await self.access.ensure_defaults()
        log.info("postgres.initialized")

    async def close(self) -> None:
        await self._engine.dispose()
        log.info("postgres.closed")

    # ── Audit helper ───────────────────────────────────────────────────────────

    @staticmethod
    async def _audit(
        s: AsyncSession,
        action: str,
        entity_type: str,
        entity_id: UUID,
        entity_name: str | None = None,
        entity_subtype: str | None = None,
        snapshot_before: dict[str, Any] | None = None,
        snapshot_after: dict[str, Any] | None = None,
        user_name: str | None = None,
        change_note: str | None = None,
    ) -> None:
        entry = AuditLogORM(
            id=uuid.uuid4(),
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            entity_name=entity_name,
            entity_subtype=entity_subtype,
            snapshot_before=snapshot_before,
            snapshot_after=snapshot_after,
            user_name=user_name,
            change_note=change_note,
        )
        s.add(entry)

    # ── Nodes ─────────────────────────────────────────────────────────────────

    async def get_node(self, node_id: UUID) -> NodeRead | None:
        async with self._session_factory() as s:
            row = await s.get(NodeORM, node_id)
            return _node_to_read(row) if row else None

    async def list_nodes(
        self,
        node_type: str | None = None,
        external_source: str | None = None,
        archived: bool = False,
        limit: int = 200,
        offset: int = 0,
    ) -> list[NodeRead]:
        async with self._session_factory() as s:
            q = select(NodeORM).where(NodeORM.archived == archived)
            if node_type:
                q = q.where(NodeORM.type == node_type)
            if external_source:
                q = q.where(NodeORM.external_source == external_source)
            q = q.order_by(NodeORM.name).limit(limit).offset(offset)
            rows = (await s.execute(q)).scalars().all()
            return [_node_to_read(r) for r in rows]

    async def create_node(self, data: NodeCreate) -> NodeRead:
        async with self._session_factory() as s:
            orm = NodeORM(
                id=uuid.uuid4(),
                type=data.type.value,
                name=data.name,
                description=data.description,
                external_source=data.external_source.value,
                external_id=data.external_id,
                attributes=data.attributes,
            )
            s.add(orm)
            await self._audit(
                s, "CREATE", "node", orm.id,
                entity_name=data.name, entity_subtype=data.type.value,
                snapshot_after=_node_snapshot(orm),
            )
            await s.commit()
            await s.refresh(orm)
            log.info("node.created", id=str(orm.id), type=orm.type, name=orm.name)
            return _node_to_read(orm)

    async def update_node(self, node_id: UUID, data: NodeUpdate) -> NodeRead | None:
        async with self._session_factory() as s:
            row = await s.get(NodeORM, node_id)
            if not row:
                return None
            before = _node_snapshot(row)
            for field, val in data.model_dump(exclude_none=True).items():
                setattr(row, field, val)
            after = _node_snapshot(row)
            # A save that changes nothing is not a change: no audit row.
            if after != before:
                row.updated_at = datetime.now(UTC)
                await self._audit(
                    s, "UPDATE", "node", node_id,
                    entity_name=row.name, entity_subtype=row.type,
                    snapshot_before=before, snapshot_after=after,
                )
            await s.commit()
            await s.refresh(row)
            return _node_to_read(row)

    async def delete_node(self, node_id: UUID) -> bool:
        async with self._session_factory() as s:
            row = await s.get(NodeORM, node_id)
            if not row:
                return False
            node_snap = _node_snapshot(row)
            # Snapshot connected edges before cascade deletes them
            edge_q = select(EdgeORM).where(
                or_(EdgeORM.source_id == node_id, EdgeORM.target_id == node_id)
            )
            connected_edges = (await s.execute(edge_q)).scalars().all()
            for edge in connected_edges:
                await self._audit(
                    s, "DELETE", "edge", edge.id,
                    entity_name=f"{edge.source_id} → {edge.target_id}",
                    entity_subtype=edge.type,
                    snapshot_before=_edge_snapshot(edge),
                )
            await self._audit(
                s, "DELETE", "node", node_id,
                entity_name=row.name, entity_subtype=row.type,
                snapshot_before=node_snap,
            )
            await s.delete(row)
            await s.commit()
            log.info("node.deleted", id=str(node_id))
            return True

    async def upsert_node_by_external(
        self,
        external_source: str,
        external_id: str,
        data: NodeCreate,
    ) -> tuple[NodeRead, bool]:
        async with self._session_factory() as s:
            q = select(NodeORM).where(
                NodeORM.external_source == external_source,
                NodeORM.external_id == external_id,
            )
            row = (await s.execute(q)).scalar_one_or_none()
            if row:
                before = _node_snapshot(row)
                row.name = data.name
                row.description = data.description
                row.attributes = data.attributes
                # A node reappearing in a sync means the source has it again —
                # un-prune it, since the source pruning step (sync.py) archives
                # nodes that drop out of a batch and relies on this to reverse it.
                row.archived = False
                row.last_synced_at = datetime.now(UTC)
                after = _node_snapshot(row)
                # Every sync re-sends every record; only log the ones the
                # source actually changed, or the audit log drowns in no-ops.
                if after != before:
                    row.updated_at = datetime.now(UTC)
                    await self._audit(
                        s, "UPDATE", "node", row.id,
                        entity_name=row.name, entity_subtype=row.type,
                        snapshot_before=before, snapshot_after=after,
                        user_name=SYNC_AUDIT_USER,
                    )
                await s.commit()
                await s.refresh(row)
                return _node_to_read(row), False
            else:
                orm = NodeORM(
                    id=uuid.uuid4(),
                    type=data.type.value,
                    name=data.name,
                    description=data.description,
                    external_source=external_source,
                    external_id=external_id,
                    attributes=data.attributes,
                    last_synced_at=datetime.now(UTC),
                )
                s.add(orm)
                await self._audit(
                    s, "CREATE", "node", orm.id,
                    entity_name=data.name, entity_subtype=data.type.value,
                    snapshot_after=_node_snapshot(orm),
                    user_name=SYNC_AUDIT_USER,
                )
                await s.commit()
                await s.refresh(orm)
                log.info("node.upserted.created", external_source=external_source, external_id=external_id)
                return _node_to_read(orm), True

    # ── Edges ─────────────────────────────────────────────────────────────────

    async def get_edge(self, edge_id: UUID) -> EdgeRead | None:
        async with self._session_factory() as s:
            row = await s.get(EdgeORM, edge_id)
            return _edge_to_read(row) if row else None

    async def list_edges(
        self,
        source_id: UUID | None = None,
        target_id: UUID | None = None,
        edge_type: str | None = None,
    ) -> list[EdgeRead]:
        async with self._session_factory() as s:
            q = select(EdgeORM)
            if source_id:
                q = q.where(EdgeORM.source_id == source_id)
            if target_id:
                q = q.where(EdgeORM.target_id == target_id)
            if edge_type:
                q = q.where(EdgeORM.type == edge_type)
            rows = (await s.execute(q)).scalars().all()
            return [_edge_to_read(r) for r in rows]

    async def create_edge(self, data: EdgeCreate) -> EdgeRead:
        async with self._session_factory() as s:
            attrs = dict(data.attributes or {})
            if data.type is EdgeType.INTEGRATES_WITH:
                # An integration always carries a direction; callers that do not
                # state one mean the historical default, "flows both ways".
                direction = data.direction or IntegrationDirection.BIDIRECTIONAL
                attrs["direction"] = direction.value
            elif data.direction is not None:
                attrs["direction"] = data.direction.value
            orm = EdgeORM(
                id=uuid.uuid4(),
                source_id=data.source_id,
                target_id=data.target_id,
                type=data.type.value,
                attributes=attrs,
            )
            s.add(orm)
            await self._audit(
                s, "CREATE", "edge", orm.id,
                entity_name=f"{data.source_id} → {data.target_id}",
                entity_subtype=data.type.value,
                snapshot_after=_edge_snapshot(orm),
            )
            await s.commit()
            await s.refresh(orm)
            log.info("edge.created", id=str(orm.id), type=orm.type)
            return _edge_to_read(orm)

    async def update_edge_note(self, edge_id: UUID, note: str | None) -> EdgeRead | None:
        async with self._session_factory() as s:
            row = await s.get(EdgeORM, edge_id)
            if not row:
                return None
            before = _edge_snapshot(row)
            attrs = dict(row.attributes or {})
            if note is not None and note.strip():
                attrs["note"] = note.strip()
            else:
                attrs.pop("note", None)
            row.attributes = attrs
            row.updated_at = datetime.now(UTC)
            after = _edge_snapshot(row)
            await self._audit(
                s, "UPDATE", "edge", edge_id,
                entity_name=f"{row.source_id} → {row.target_id}",
                entity_subtype=row.type,
                snapshot_before=before, snapshot_after=after,
            )
            await s.commit()
            await s.refresh(row)
            return _edge_to_read(row)

    async def update_edge_direction(
        self, edge_id: UUID, direction: IntegrationDirection
    ) -> EdgeRead | None:
        async with self._session_factory() as s:
            row = await s.get(EdgeORM, edge_id)
            if not row:
                return None
            before = _edge_snapshot(row)
            attrs = dict(row.attributes or {})
            attrs["direction"] = direction.value
            row.attributes = attrs
            row.updated_at = datetime.now(UTC)
            after = _edge_snapshot(row)
            await self._audit(
                s, "UPDATE", "edge", edge_id,
                entity_name=f"{row.source_id} → {row.target_id}",
                entity_subtype=row.type,
                snapshot_before=before, snapshot_after=after,
            )
            await s.commit()
            await s.refresh(row)
            log.info("edge.direction_changed", id=str(edge_id), direction=direction.value)
            return _edge_to_read(row)

    async def delete_edge(self, edge_id: UUID) -> bool:
        async with self._session_factory() as s:
            row = await s.get(EdgeORM, edge_id)
            if not row:
                return False
            await self._audit(
                s, "DELETE", "edge", edge_id,
                entity_name=f"{row.source_id} → {row.target_id}",
                entity_subtype=row.type,
                snapshot_before=_edge_snapshot(row),
            )
            await s.delete(row)
            await s.commit()
            return True

    # ── Audit log queries ──────────────────────────────────────────────────────

    async def clear_audit_log(self) -> int:
        async with self._session_factory() as s:
            result = await s.execute(delete(AuditLogORM))
            await s.commit()
            return result.rowcount  # type: ignore[return-value]

    async def list_audit_logs(
        self,
        entity_type: str | None = None,
        action: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> AuditLogList:
        async with self._session_factory() as s:
            q = select(AuditLogORM)
            count_q = select(func.count(AuditLogORM.id))
            if entity_type:
                q = q.where(AuditLogORM.entity_type == entity_type)
                count_q = count_q.where(AuditLogORM.entity_type == entity_type)
            if action:
                q = q.where(AuditLogORM.action == action)
                count_q = count_q.where(AuditLogORM.action == action)
            total = (await s.execute(count_q)).scalar() or 0
            q = q.order_by(AuditLogORM.created_at.desc()).limit(limit).offset(offset)
            rows = (await s.execute(q)).scalars().all()
            items = [
                AuditLogRead(
                    id=r.id,
                    action=r.action,
                    entity_type=r.entity_type,
                    entity_id=r.entity_id,
                    entity_name=r.entity_name,
                    entity_subtype=r.entity_subtype,
                    snapshot_before=r.snapshot_before,
                    snapshot_after=r.snapshot_after,
                    restored=r.restored,
                    created_at=r.created_at,
                    user_name=r.user_name,
                    change_note=r.change_note,
                )
                for r in rows
            ]
            return AuditLogList(items=items, total=total)

    async def restore_entity(self, audit_log_id: UUID, *, restore_edges: bool = True) -> tuple[UUID, str]:
        """Restore a deleted entity. Returns (entity_id, entity_name)."""
        async with self._session_factory() as s:
            entry = await s.get(AuditLogORM, audit_log_id)
            if not entry:
                raise ValueError("Audit log entry not found")
            if entry.action != "DELETE":
                raise ValueError("Can only restore deleted entities")
            if entry.restored:
                raise ValueError("Entity has already been restored")
            snap = entry.snapshot_before
            if not snap:
                raise ValueError("No snapshot available for restoration")

            if entry.entity_type == "node":
                # Check no node with this ID exists
                existing = await s.get(NodeORM, UUID(snap["id"]))
                if existing:
                    raise ValueError("A node with this ID already exists")
                orm = NodeORM(
                    id=UUID(snap["id"]),
                    type=snap["type"],
                    name=snap["name"],
                    description=snap.get("description"),
                    external_source=snap.get("external_source", "NONE"),
                    external_id=snap.get("external_id"),
                    archived=snap.get("archived", False),
                    attributes=snap.get("attributes", {}),
                )
                s.add(orm)
                await self._audit(
                    s, "CREATE", "node", orm.id,
                    entity_name=orm.name, entity_subtype=orm.type,
                    snapshot_after=snap,
                )
                # Also restore edges that were cascade-deleted with this node
                if restore_edges:
                    edge_q = select(AuditLogORM).where(
                        AuditLogORM.action == "DELETE",
                        AuditLogORM.entity_type == "edge",
                        AuditLogORM.restored.is_(False),
                        AuditLogORM.created_at == entry.created_at,
                    )
                    cascade_edges = (await s.execute(edge_q)).scalars().all()
                    for edge_entry in cascade_edges:
                        e_snap = edge_entry.snapshot_before
                        if not e_snap:
                            continue
                        src_id = UUID(e_snap["source_id"])
                        tgt_id = UUID(e_snap["target_id"])
                        src_exists = (await s.get(NodeORM, src_id)) is not None or str(src_id) == snap["id"]
                        tgt_exists = (await s.get(NodeORM, tgt_id)) is not None or str(tgt_id) == snap["id"]
                        if not src_exists or not tgt_exists:
                            continue
                        edge_existing = await s.get(EdgeORM, UUID(e_snap["id"]))
                        if edge_existing:
                            continue
                        edge_orm = EdgeORM(
                            id=UUID(e_snap["id"]),
                            source_id=src_id,
                            target_id=tgt_id,
                            type=e_snap["type"],
                            attributes=e_snap.get("attributes", {}),
                        )
                        s.add(edge_orm)
                        await self._audit(
                            s, "CREATE", "edge", edge_orm.id,
                            entity_name=f"{e_snap['source_id']} → {e_snap['target_id']}",
                            entity_subtype=e_snap["type"],
                            snapshot_after=e_snap,
                        )
                        edge_entry.restored = True
            elif entry.entity_type == "edge":
                existing = await s.get(EdgeORM, UUID(snap["id"]))  # type: ignore[arg-type]
                if existing:
                    raise ValueError("An edge with this ID already exists")
                src = await s.get(NodeORM, UUID(snap["source_id"]))
                tgt = await s.get(NodeORM, UUID(snap["target_id"]))
                if not src or not tgt:
                    raise ValueError("Source or target node no longer exists. Restore the node first.")
                restored_edge = EdgeORM(
                    id=UUID(snap["id"]),
                    source_id=UUID(snap["source_id"]),
                    target_id=UUID(snap["target_id"]),
                    type=snap["type"],
                    attributes=snap.get("attributes", {}),
                )
                s.add(restored_edge)
                await self._audit(
                    s, "CREATE", "edge", restored_edge.id,
                    entity_name=f"{snap['source_id']} → {snap['target_id']}",
                    entity_subtype=snap["type"],
                    snapshot_after=snap,
                )
            else:
                raise ValueError(f"Unknown entity type: {entry.entity_type}")

            entry.restored = True
            await s.commit()
            return entry.entity_id, entry.entity_name or ""

    # ── Usage statistics ──────────────────────────────────────────────────────

    async def record_login_event(self, user_id: UUID) -> None:
        """Write an anonymous LOGIN audit entry."""
        async with self._session_factory() as s:
            await self._audit(s, "LOGIN", "session", user_id)
            await s.commit()

    async def get_usage_statistics(self, period_days: int = 30) -> Any:
        """Aggregate anonymised usage data from the audit log."""
        from collections import defaultdict
        from datetime import timedelta

        from app.schemas.statistics import (
            DailyActivity,
            EntityTypeStat,
            UsageStatistics,
        )

        cutoff = datetime.now(UTC) - timedelta(days=period_days)
        # Usage means people: leave out what syncs and imports wrote.
        by_people = or_(AuditLogORM.user_name.is_(None), AuditLogORM.user_name != SYNC_AUDIT_USER)

        _SUBTYPE_LABELS: dict[str, str] = {
            "ArchitecturePrinciple": "Arkitekturprincip",
            "Application": "Applikation",
            "Process": "Process",
            "InformationObject": "Informationsobjekt",
            "Database": "Databas",
            "Server": "Server",
            "ServerService": "Servertjänst",
            "Service": "Tjänst",
            "IntegrationFlow": "Integrationsflöde",
        }
        _TYPE_LABELS: dict[str, str] = {
            "node": "Objekt",
            "edge": "Koppling",
            "glossary_term": "Ordlista",
            "session": "Inloggning",
        }

        async with self._session_factory() as s:
            # Daily breakdown: one row per (day, action)
            day_col = func.date_trunc("day", AuditLogORM.created_at).label("day")
            daily_rows = (await s.execute(
                select(day_col, AuditLogORM.action, func.count(AuditLogORM.id).label("cnt"))
                .where(AuditLogORM.created_at >= cutoff, by_people)
                .group_by(day_col, AuditLogORM.action)
                .order_by(day_col)
            )).all()

            day_map: dict[str, dict[str, int]] = defaultdict(
                lambda: {"CREATE": 0, "UPDATE": 0, "DELETE": 0, "LOGIN": 0}
            )
            for row in daily_rows:
                date_str = row.day.date().isoformat()
                action = row.action.upper()
                if action in day_map[date_str]:
                    day_map[date_str][action] = row.cnt
                else:
                    day_map[date_str][action] = row.cnt

            # Entity type breakdown (content changes only, not logins)
            entity_rows = (await s.execute(
                select(
                    AuditLogORM.entity_type,
                    AuditLogORM.entity_subtype,
                    func.count(AuditLogORM.id).label("cnt"),
                )
                .where(
                    AuditLogORM.created_at >= cutoff,
                    AuditLogORM.action.in_(["CREATE", "UPDATE", "DELETE"]),
                    by_people,
                )
                .group_by(AuditLogORM.entity_type, AuditLogORM.entity_subtype)
                .order_by(func.count(AuditLogORM.id).desc())
                .limit(8)
            )).all()

            label_totals: dict[str, int] = {}
            for row in entity_rows:
                if row.entity_subtype and row.entity_subtype in _SUBTYPE_LABELS:
                    label = _SUBTYPE_LABELS[row.entity_subtype]
                elif row.entity_type in _TYPE_LABELS:
                    label = _TYPE_LABELS[row.entity_type]
                else:
                    label = row.entity_subtype or row.entity_type or "Okänd"
                label_totals[label] = label_totals.get(label, 0) + row.cnt
            by_entity_type = [
                EntityTypeStat(label=lbl, count=cnt)
                for lbl, cnt in sorted(label_totals.items(), key=lambda x: -x[1])
            ]

            # Action totals (CREATE/UPDATE/DELETE from audit log)
            total_rows = (await s.execute(
                select(AuditLogORM.action, func.count(AuditLogORM.id).label("cnt"))
                .where(
                    AuditLogORM.created_at >= cutoff,
                    AuditLogORM.action.in_(["CREATE", "UPDATE", "DELETE"]),
                    by_people,
                )
                .group_by(AuditLogORM.action)
            )).all()

            by_action: dict[str, int] = {"CREATE": 0, "UPDATE": 0, "DELETE": 0, "LOGIN": 0}
            for row in total_rows:
                by_action[row.action.upper()] = row.cnt

            # Login count: from ea_users.last_login_at (reliable for both local
            # and Entra/MSAL users; audit-log LOGIN events only exist from when
            # we started tracking them, so they undercount historical sessions).
            login_total = (await s.execute(
                select(func.count(UserORM.id))
                .where(UserORM.last_login_at >= cutoff)
            )).scalar() or 0
            by_action["LOGIN"] = login_total

            # Daily login counts: group last_login_at by day
            login_day_col = func.date_trunc("day", UserORM.last_login_at).label("day")
            login_day_rows = (await s.execute(
                select(login_day_col, func.count(UserORM.id).label("cnt"))
                .where(UserORM.last_login_at >= cutoff)
                .group_by(login_day_col)
            )).all()
            for row in login_day_rows:
                date_str = row.day.date().isoformat()
                day_map[date_str]["LOGIN"] = row.cnt

            # Rebuild activity_by_day after merging login data
            activity_by_day = [
                DailyActivity(
                    date=d,
                    total=counts["CREATE"] + counts["UPDATE"] + counts["DELETE"] + counts["LOGIN"],
                    create=counts["CREATE"],
                    update=counts["UPDATE"],
                    delete=counts["DELETE"],
                    login=counts["LOGIN"],
                )
                for d, counts in sorted(day_map.items())
            ]

            return UsageStatistics(
                period_days=period_days,
                total_events=sum(by_action.values()),
                active_days=len(day_map),
                by_action=by_action,
                by_entity_type=by_entity_type,
                activity_by_day=activity_by_day,
            )

    # ── Graph views ───────────────────────────────────────────────────────────

    async def _fetch_nodes_by_ids(self, s: AsyncSession, ids: set[str]) -> list[NodeORM]:
        if not ids:
            return []
        uuids = [UUID(i) for i in ids]
        rows = (await s.execute(select(NodeORM).where(NodeORM.id.in_(uuids)))).scalars().all()
        return list(rows)

    async def get_process_e2e(self, process_id: UUID) -> GraphData:
        async with self._session_factory() as s:
            node_ids: set[str] = {str(process_id)}
            edge_rows: list[EdgeORM] = []

            # Applications that SUPPORT this process
            q_supports = select(EdgeORM).where(
                EdgeORM.target_id == process_id,
                EdgeORM.type == "SUPPORTS",
            )
            supports_edges = (await s.execute(q_supports)).scalars().all()
            edge_rows.extend(supports_edges)
            app_ids = {str(e.source_id) for e in supports_edges}
            node_ids.update(app_ids)

            for app_id_str in app_ids:
                app_uuid = UUID(app_id_str)
                # InformationObjects this Application HANDLES
                q_handles = select(EdgeORM).where(
                    EdgeORM.source_id == app_uuid, EdgeORM.type == "HANDLES"
                )
                handles_edges = (await s.execute(q_handles)).scalars().all()
                edge_rows.extend(handles_edges)
                info_ids = {str(e.target_id) for e in handles_edges}
                node_ids.update(info_ids)

                # InformationSources that REALIZE those InformationObjects
                for info_id_str in info_ids:
                    info_uuid = UUID(info_id_str)
                    q_realizes = select(EdgeORM).where(
                        EdgeORM.target_id == info_uuid, EdgeORM.type == "REALIZES"
                    )
                    realizes_edges = (await s.execute(q_realizes)).scalars().all()
                    edge_rows.extend(realizes_edges)
                    node_ids.update(str(e.source_id) for e in realizes_edges)

                # TechComponents this Application RUNS_ON
                q_runs = select(EdgeORM).where(
                    EdgeORM.source_id == app_uuid, EdgeORM.type == "RUNS_ON"
                )
                runs_edges = (await s.execute(q_runs)).scalars().all()
                edge_rows.extend(runs_edges)
                node_ids.update(str(e.target_id) for e in runs_edges)

            node_orms = await self._fetch_nodes_by_ids(s, node_ids)
            return GraphData(
                nodes=[_node_to_graph(n) for n in node_orms],
                edges=[_edge_to_graph(e) for e in edge_rows],
            )

    async def get_system_view(self, app_id: UUID) -> GraphData:
        async with self._session_factory() as s:
            node_ids: set[str] = {str(app_id)}
            edge_rows: list[EdgeORM] = []

            edge_types = ["SUPPORTS", "HANDLES", "CONTAINS", "RUNS_ON", "INTEGRATES_WITH"]
            for et in edge_types:
                q = select(EdgeORM).where(
                    EdgeORM.source_id == app_id, EdgeORM.type == et
                )
                edges = (await s.execute(q)).scalars().all()
                edge_rows.extend(edges)
                node_ids.update(str(e.target_id) for e in edges)

            # INTEGRATES_WITH is bidirectional in practice — also fetch incoming
            q_bi = select(EdgeORM).where(
                EdgeORM.target_id == app_id, EdgeORM.type == "INTEGRATES_WITH"
            )
            bi_edges = (await s.execute(q_bi)).scalars().all()
            edge_rows.extend(bi_edges)
            node_ids.update(str(e.source_id) for e in bi_edges)

            node_orms = await self._fetch_nodes_by_ids(s, node_ids)
            return GraphData(
                nodes=[_node_to_graph(n) for n in node_orms],
                edges=[_edge_to_graph(e) for e in edge_rows],
            )

    async def get_landscape(self) -> GraphData:
        async with self._session_factory() as s:
            q_apps = select(NodeORM).where(
                NodeORM.type == "Application", NodeORM.archived.is_(False)
            )
            apps = (await s.execute(q_apps)).scalars().all()
            app_ids = {n.id for n in apps}

            q_edges = select(EdgeORM).where(EdgeORM.type == "INTEGRATES_WITH")
            all_edges = (await s.execute(q_edges)).scalars().all()
            # Include only edges where both endpoints are applications
            edges = [e for e in all_edges if e.source_id in app_ids and e.target_id in app_ids]

            return GraphData(
                nodes=[_node_to_graph(n) for n in apps],
                edges=[_edge_to_graph(e) for e in edges],
            )

    # ── Analysis ──────────────────────────────────────────────────────────────

    async def get_overlaps(self) -> dict[str, Any]:
        async with self._session_factory() as s:
            q = text(f"""
                SELECT n.id::text, n.name, COUNT(e.source_id) AS app_count,
                       ARRAY_AGG(a.name ORDER BY a.name) AS app_names
                FROM ea_nodes n
                JOIN ea_edges e ON e.target_id = n.id AND e.type = 'SUPPORTS'
                JOIN ea_nodes a ON a.id = e.source_id AND a.type = 'Application'
                WHERE n.type = 'Process' AND n.archived = false
                  AND {COUNTED_PROCESS}
                GROUP BY n.id, n.name
                HAVING COUNT(e.source_id) > 1
                ORDER BY app_count DESC
            """)
            proc_rows = (await s.execute(q)).mappings().all()

            q2 = text("""
                SELECT n.id::text, n.name, COUNT(e.source_id) AS app_count,
                       ARRAY_AGG(a.name ORDER BY a.name) AS app_names
                FROM ea_nodes n
                JOIN ea_edges e ON e.target_id = n.id AND e.type = 'HANDLES'
                JOIN ea_nodes a ON a.id = e.source_id AND a.type = 'Application'
                WHERE n.type = 'InformationObject' AND n.archived = false
                GROUP BY n.id, n.name
                HAVING COUNT(e.source_id) > 1
                ORDER BY app_count DESC
            """)
            info_rows = (await s.execute(q2)).mappings().all()

            return {
                "overlapping_processes": [dict(r) for r in proc_rows],
                "overlapping_info_objects": [dict(r) for r in info_rows],
            }

    async def get_gaps(self) -> dict[str, Any]:
        async with self._session_factory() as s:
            q = text(f"""
                SELECT n.id::text, n.name, n.external_source
                FROM ea_nodes n
                WHERE n.type = 'Process' AND n.archived = false
                  AND {COUNTED_PROCESS}
                  AND n.id NOT IN (
                    SELECT DISTINCT e.target_id FROM ea_edges e WHERE e.type = 'SUPPORTS'
                  )
                ORDER BY n.name
            """)
            unsupported = (await s.execute(q)).mappings().all()

            q2 = text("""
                SELECT n.id::text, n.name
                FROM ea_nodes n
                WHERE n.type = 'InformationObject' AND n.archived = false
                  AND n.id NOT IN (
                    SELECT DISTINCT e.target_id FROM ea_edges e WHERE e.type = 'REALIZES'
                  )
                ORDER BY n.name
            """)
            unrealized = (await s.execute(q2)).mappings().all()

            q3 = text("""
                SELECT n.id::text, n.name, n.external_source
                FROM ea_nodes n
                WHERE n.type = 'Application' AND n.archived = false
                  AND n.id NOT IN (
                    SELECT DISTINCT e.source_id FROM ea_edges e WHERE e.type = 'SUPPORTS'
                  )
                ORDER BY n.name
            """)
            orphaned = (await s.execute(q3)).mappings().all()

            return {
                "unsupported_processes": [dict(r) for r in unsupported],
                "unrealized_info_objects": [dict(r) for r in unrealized],
                "orphaned_applications": [dict(r) for r in orphaned],
            }

    # ── Users ─────────────────────────────────────────────────────────────────

    async def find_or_create_user_from_claims(
        self, token_type: str, claims: dict[str, Any]
    ) -> UserORM:
        from app.auth import find_or_create_user

        async with self._session_factory() as s:
            user = await find_or_create_user(s, token_type, claims)  # type: ignore[arg-type]
            await s.commit()
            await s.refresh(user)
            return user

    async def get_user_by_email(self, email: str) -> UserORM | None:
        async with self._session_factory() as s:
            row = (
                await s.execute(select(UserORM).where(UserORM.email == email.lower()))
            ).scalar_one_or_none()
            return row

    async def create_local_user(
        self, *, name: str, email: str, password_hash: str, role: str
    ) -> UserORM:
        async with self._session_factory() as s:
            row = UserORM(
                id=uuid.uuid4(),
                name=name,
                email=email.lower(),
                role=role,
                password_hash=password_hash,
            )
            s.add(row)
            await s.commit()
            await s.refresh(row)
            return row

    async def set_user_password(self, user_id: UUID, password_hash: str | None) -> UserORM | None:
        async with self._session_factory() as s:
            row = await s.get(UserORM, user_id)
            if row is None:
                return None
            row.password_hash = password_hash
            await s.commit()
            await s.refresh(row)
            return row

    async def get_home_shortcuts(self, user_id: UUID) -> list[str]:
        async with self._session_factory() as s:
            row = await s.get(UserORM, user_id)
            return list(row.home_shortcuts) if row else []

    async def set_home_shortcuts(self, user_id: UUID, paths: list[str]) -> list[str]:
        async with self._session_factory() as s:
            row = await s.get(UserORM, user_id)
            if row is None:
                return []
            seen: set[str] = set()
            deduped: list[str] = []
            for p in paths:
                if p and p not in seen:
                    seen.add(p)
                    deduped.append(p)
            row.home_shortcuts = deduped
            await s.commit()
            await s.refresh(row)
            return list(row.home_shortcuts)

    async def touch_user_login(self, user_id: UUID) -> None:
        async with self._session_factory() as s:
            row = await s.get(UserORM, user_id)
            if row is None:
                return
            row.last_login_at = datetime.now(UTC)
            await s.commit()

    async def list_users(self) -> list[UserORM]:
        async with self._session_factory() as s:
            rows = (await s.execute(select(UserORM).order_by(UserORM.name))).scalars().all()
            return list(rows)

    async def update_user_role(self, user_id: UUID, new_role: str, *, acting_user_id: UUID | None) -> UserORM | None:
        """Change a user's role.

        Raises ValueError if acting_user is trying to demote the last admin.
        """
        async with self._session_factory() as s:
            row = await s.get(UserORM, user_id)
            if row is None:
                return None
            if row.role == new_role:
                return row
            # Last-admin guard: prevent demoting the last admin
            if row.role == "admin" and new_role != "admin":
                admin_count = (await s.execute(
                    select(func.count(UserORM.id)).where(UserORM.role == "admin")
                )).scalar() or 0
                if admin_count <= 1:
                    raise ValueError("Cannot demote the last administrator")
                if acting_user_id == user_id:
                    # Already covered by last-admin check, but keep the explicit guard
                    pass
            row.role = new_role
            await s.commit()
            await s.refresh(row)
            return row

    # ── User provisioning (matchningslista) ───────────────────────────────────

    @staticmethod
    def _normalize_name_token(token: str) -> str:
        """ASCII-fold a name part for an email local-part: Öberg -> oberg."""
        folded = unicodedata.normalize("NFKD", token)
        folded = "".join(c for c in folded if not unicodedata.combining(c))
        return re.sub(r"[^a-z0-9-]", "", folded.lower())

    @classmethod
    def suggest_email_from_name(cls, name: str, domain: str) -> str | None:
        """Guess fornamn.efternamn@domain from a person's display name."""
        tokens = [t for t in re.split(r"\s+", name.strip()) if t]
        if len(tokens) < 2:
            return None
        first = cls._normalize_name_token(tokens[0])
        last = cls._normalize_name_token(tokens[-1])
        if not first or not last:
            return None
        return f"{first}.{last}@{domain}"

    @staticmethod
    def _name_from_email(email: str) -> str:
        local = email.split("@", 1)[0]
        parts = [p for p in re.split(r"[._-]+", local) if p]
        return " ".join(p.capitalize() for p in parts) or email

    async def list_user_provision_candidates(
        self, attribute_keys: list[str], email_domain: str
    ) -> list[dict[str, Any]]:
        """Scan node attributes (system roles) for people who don't have a
        user account yet, and suggest an email address for each of them.

        Returns one entry per distinct person, with the nodes/attributes they
        were found in and — if a user already matches by email or name — that
        user's id, so the UI can show them as already covered.
        """
        async with self._session_factory() as s:
            node_rows = (
                await s.execute(select(NodeORM).where(NodeORM.archived == False))
            ).scalars().all()
            user_rows = (await s.execute(select(UserORM))).scalars().all()

        by_email = {u.email.lower(): u for u in user_rows if u.email}
        by_name = {u.name.strip().lower(): u for u in user_rows if u.name}

        candidates: dict[str, dict[str, Any]] = {}
        for node in node_rows:
            attrs = node.attributes or {}
            for attr_key in attribute_keys:
                raw_value = attrs.get(attr_key)
                if not isinstance(raw_value, str) or not raw_value.strip():
                    continue
                for candidate in self._split_survey_recipient_candidates(raw_value):
                    is_email = "@" in candidate
                    if is_email:
                        email = candidate.lower()
                        name = self._name_from_email(email)
                        key = email
                        guessed = False
                    else:
                        name = candidate
                        email = self.suggest_email_from_name(name, email_domain) or ""
                        key = email or name.strip().lower()
                        guessed = True

                    entry = candidates.setdefault(
                        key,
                        {
                            "name": name,
                            "suggested_email": email,
                            "email_is_guessed": guessed,
                            "roles": [],
                            "sources": [],
                            "existing_user_id": None,
                        },
                    )
                    if not guessed and entry["email_is_guessed"]:
                        # A real email trumps a guessed one for the same person.
                        entry["suggested_email"] = email
                        entry["email_is_guessed"] = False
                    if attr_key not in entry["roles"]:
                        entry["roles"].append(attr_key)
                    entry["sources"].append(
                        {
                            "node_id": node.id,
                            "node_name": node.name,
                            "node_type": node.type,
                            "attribute_key": attr_key,
                        }
                    )

        for entry in candidates.values():
            user = None
            if entry["suggested_email"]:
                user = by_email.get(entry["suggested_email"].lower())
            if user is None:
                user = by_name.get(entry["name"].strip().lower())
            if user is not None:
                entry["existing_user_id"] = user.id

        return sorted(candidates.values(), key=lambda c: c["name"].lower())

    async def provision_users(
        self, items: list[dict[str, str]]
    ) -> tuple[list[UserORM], list[dict[str, str]]]:
        """Bulk-create pre-provisioned users (no oid, no password).

        Returns (created rows, skipped entries with a reason). Duplicate
        emails — in the database or within the batch — are skipped.
        """
        async with self._session_factory() as s:
            existing_emails = {
                e.lower() for (e,) in (await s.execute(select(UserORM.email))).all()
            }
            created: list[UserORM] = []
            skipped: list[dict[str, str]] = []
            for item in items:
                email = item["email"].strip().lower()
                name = item["name"].strip()
                if email in existing_emails:
                    skipped.append({"email": email, "reason": "Det finns redan en användare med den e-postadressen"})
                    continue
                existing_emails.add(email)
                row = UserORM(
                    id=uuid.uuid4(),
                    name=name,
                    email=email,
                    role=item.get("role") or "user",
                )
                s.add(row)
                created.append(row)
            await s.commit()
            for row in created:
                await s.refresh(row)
            return created, skipped

    # ── Principle document ────────────────────────────────────────────────────

    async def get_principle_document(self) -> PrincipleDocumentORM | None:
        async with self._session_factory() as s:
            row = (await s.execute(select(PrincipleDocumentORM).limit(1))).scalar_one_or_none()
            return row

    async def update_principle_document(
        self,
        updates: dict[str, str],
        *,
        updated_by: str | None = None,
        change_note: str | None = None,
    ) -> PrincipleDocumentORM:
        async with self._session_factory() as s:
            row = (await s.execute(select(PrincipleDocumentORM).limit(1))).scalar_one_or_none()
            if row is None:
                row = PrincipleDocumentORM(id=uuid.uuid4(), sections=dict(updates))
                s.add(row)
                await s.flush()
                await self._audit(
                    s, "CREATE", "principle_document", row.id,
                    entity_name="Arkitekturprinciper",
                    snapshot_after={"sections": dict(updates)},
                    user_name=updated_by,
                    change_note=change_note,
                )
            else:
                before = {"sections": dict(row.sections or {})}
                merged = dict(row.sections or {})
                merged.update(updates)
                row.sections = merged
                row.updated_at = datetime.now(UTC)
                await self._audit(
                    s, "UPDATE", "principle_document", row.id,
                    entity_name="Arkitekturprinciper",
                    snapshot_before=before,
                    snapshot_after={"sections": merged},
                    user_name=updated_by,
                    change_note=change_note,
                )
            await s.commit()
            await s.refresh(row)
            return row

    async def touch_principle_document(self) -> None:
        """Bump updated_at on the principle document so Reviderat reflects principle changes."""
        async with self._session_factory() as s:
            row = (await s.execute(select(PrincipleDocumentORM).limit(1))).scalar_one_or_none()
            if row is not None:
                row.updated_at = datetime.now(UTC)
                await s.commit()

    # ── Target architecture ───────────────────────────────────────────────────

    async def get_target_architecture(self) -> TargetArchitectureORM | None:
        async with self._session_factory() as s:
            row = (await s.execute(select(TargetArchitectureORM).limit(1))).scalar_one_or_none()
            return row

    async def update_target_architecture(
        self,
        content: dict,
        *,
        updated_by: str | None,
        change_note: str | None = None,
    ) -> TargetArchitectureORM:
        async with self._session_factory() as s:
            row = (await s.execute(select(TargetArchitectureORM).limit(1))).scalar_one_or_none()
            if row is None:
                row = TargetArchitectureORM(id=uuid.uuid4(), content=content, updated_by=updated_by)
                s.add(row)
                await s.flush()
                await self._audit(
                    s, "CREATE", "target_architecture", row.id,
                    entity_name="Målarkitektur",
                    snapshot_after={"content": content},
                    user_name=updated_by,
                    change_note=change_note,
                )
            else:
                before = {"content": row.content}
                row.content = content
                row.updated_at = datetime.now(UTC)
                row.updated_by = updated_by
                await self._audit(
                    s, "UPDATE", "target_architecture", row.id,
                    entity_name="Målarkitektur",
                    snapshot_before=before,
                    snapshot_after={"content": content},
                    user_name=updated_by,
                    change_note=change_note,
                )
            await s.commit()
            await s.refresh(row)
            return row

    # ── Nulägesanalys ─────────────────────────────────────────────────────────

    async def get_nulaagesanalys(self) -> NulaagesanalysORM | None:
        async with self._session_factory() as s:
            return (await s.execute(select(NulaagesanalysORM).limit(1))).scalar_one_or_none()

    async def update_nulaagesanalys(
        self,
        content: dict,
        *,
        updated_by: str | None,
        change_note: str | None = None,
    ) -> NulaagesanalysORM:
        async with self._session_factory() as s:
            row = (await s.execute(select(NulaagesanalysORM).limit(1))).scalar_one_or_none()
            if row is None:
                row = NulaagesanalysORM(id=uuid.uuid4(), content=content, updated_by=updated_by)
                s.add(row)
                await s.flush()
                await self._audit(
                    s, "CREATE", "nulaagesanalys", row.id,
                    entity_name="Nulägesanalys IT-arkitektur",
                    snapshot_after={"content": content},
                    user_name=updated_by,
                    change_note=change_note,
                )
            else:
                before = {"content": row.content}
                row.content = content
                row.updated_at = datetime.now(UTC)
                row.updated_by = updated_by
                await self._audit(
                    s, "UPDATE", "nulaagesanalys", row.id,
                    entity_name="Nulägesanalys IT-arkitektur",
                    snapshot_before=before,
                    snapshot_after={"content": content},
                    user_name=updated_by,
                    change_note=change_note,
                )
            await s.commit()
            await s.refresh(row)
            return row

    # ── GAP-analys ────────────────────────────────────────────────────────────

    async def get_gap_analys(self) -> GapAnalysORM | None:
        async with self._session_factory() as s:
            return (await s.execute(select(GapAnalysORM).limit(1))).scalar_one_or_none()

    async def update_gap_analys(
        self,
        content: dict,
        *,
        updated_by: str | None,
        change_note: str | None = None,
    ) -> GapAnalysORM:
        async with self._session_factory() as s:
            row = (await s.execute(select(GapAnalysORM).limit(1))).scalar_one_or_none()
            if row is None:
                row = GapAnalysORM(id=uuid.uuid4(), content=content, updated_by=updated_by)
                s.add(row)
                await s.flush()
                await self._audit(
                    s, "CREATE", "gap_analys", row.id,
                    entity_name="GAP-analys IT-arkitektur",
                    snapshot_after={"content": content},
                    user_name=updated_by,
                    change_note=change_note,
                )
            else:
                before = {"content": row.content}
                row.content = content
                row.updated_at = datetime.now(UTC)
                row.updated_by = updated_by
                await self._audit(
                    s, "UPDATE", "gap_analys", row.id,
                    entity_name="GAP-analys IT-arkitektur",
                    snapshot_before=before,
                    snapshot_after={"content": content},
                    user_name=updated_by,
                    change_note=change_note,
                )
            await s.commit()
            await s.refresh(row)
            return row

    # ── Glossary terms ────────────────────────────────────────────────────────

    async def list_glossary_terms(self) -> list[GlossaryTermORM]:
        async with self._session_factory() as s:
            rows = (
                await s.execute(select(GlossaryTermORM).order_by(func.lower(GlossaryTermORM.term)))
            ).scalars().all()
            return list(rows)

    async def get_glossary_term(self, term_id: UUID) -> GlossaryTermORM | None:
        async with self._session_factory() as s:
            return await s.get(GlossaryTermORM, term_id)

    async def get_glossary_term_by_name(self, term: str) -> GlossaryTermORM | None:
        async with self._session_factory() as s:
            row = (
                await s.execute(
                    select(GlossaryTermORM).where(func.lower(GlossaryTermORM.term) == term.lower())
                )
            ).scalar_one_or_none()
            return row

    async def create_glossary_term(
        self,
        *,
        term: str,
        definition: str,
        updated_by: str | None = None,
    ) -> GlossaryTermORM:
        async with self._session_factory() as s:
            row = GlossaryTermORM(
                id=uuid.uuid4(),
                term=term,
                definition=definition,
                updated_by=updated_by,
            )
            s.add(row)
            await s.flush()
            await self._audit(
                s,
                "CREATE",
                "glossary_term",
                row.id,
                entity_name=term,
                snapshot_after={"term": term, "definition": definition},
                user_name=updated_by,
            )
            await s.commit()
            await s.refresh(row)
            return row

    async def update_glossary_term(
        self,
        term_id: UUID,
        *,
        term: str | None = None,
        definition: str | None = None,
        updated_by: str | None = None,
    ) -> GlossaryTermORM | None:
        async with self._session_factory() as s:
            row = await s.get(GlossaryTermORM, term_id)
            if row is None:
                return None
            before = {"term": row.term, "definition": row.definition}
            if term is not None:
                row.term = term
            if definition is not None:
                row.definition = definition
            row.updated_by = updated_by
            await self._audit(
                s,
                "UPDATE",
                "glossary_term",
                row.id,
                entity_name=row.term,
                snapshot_before=before,
                snapshot_after={"term": row.term, "definition": row.definition},
                user_name=updated_by,
            )
            await s.commit()
            await s.refresh(row)
            return row

    async def delete_glossary_term(
        self,
        term_id: UUID,
        *,
        updated_by: str | None = None,
    ) -> bool:
        async with self._session_factory() as s:
            row = await s.get(GlossaryTermORM, term_id)
            if row is None:
                return False
            before = {"term": row.term, "definition": row.definition}
            term_name = row.term
            await s.delete(row)
            await self._audit(
                s,
                "DELETE",
                "glossary_term",
                term_id,
                entity_name=term_name,
                snapshot_before=before,
                user_name=updated_by,
            )
            await s.commit()
            return True

    # ── Home blocks ───────────────────────────────────────────────────────────

    async def list_home_blocks(self) -> list[HomeBlockORM]:
        async with self._session_factory() as s:
            rows = (await s.execute(select(HomeBlockORM).order_by(HomeBlockORM.key))).scalars().all()
            return list(rows)

    async def upsert_home_block(
        self, *, key: str, body: str, enabled: bool, updated_by: str | None
    ) -> HomeBlockORM:
        async with self._session_factory() as s:
            row = await s.get(HomeBlockORM, key)
            if row is None:
                row = HomeBlockORM(key=key, body=body, enabled=enabled, updated_by=updated_by)
                s.add(row)
            else:
                row.body = body
                row.enabled = enabled
                row.updated_at = datetime.now(UTC)
                row.updated_by = updated_by
            await s.commit()
            await s.refresh(row)
            return row

    # ── Home banners ──────────────────────────────────────────────────────────

    async def list_home_banners(self) -> list[HomeBannerORM]:
        async with self._session_factory() as s:
            rows = (
                await s.execute(select(HomeBannerORM).order_by(HomeBannerORM.created_at))
            ).scalars().all()
            return list(rows)

    async def create_home_banner(
        self, *, body: str, severity: str, enabled: bool, updated_by: str | None,
    ) -> HomeBannerORM:
        async with self._session_factory() as s:
            row = HomeBannerORM(
                body=body, severity=severity, enabled=enabled, updated_by=updated_by,
            )
            s.add(row)
            await s.commit()
            await s.refresh(row)
            return row

    async def update_home_banner(
        self, *, banner_id: UUID, body: str, severity: str, enabled: bool,
        updated_by: str | None,
    ) -> HomeBannerORM | None:
        async with self._session_factory() as s:
            row = await s.get(HomeBannerORM, banner_id)
            if row is None:
                return None
            row.body = body
            row.severity = severity
            row.enabled = enabled
            row.updated_at = datetime.now(UTC)
            row.updated_by = updated_by
            await s.commit()
            await s.refresh(row)
            return row

    async def delete_home_banner(self, banner_id: UUID) -> bool:
        async with self._session_factory() as s:
            row = await s.get(HomeBannerORM, banner_id)
            if row is None:
                return False
            await s.delete(row)
            await s.commit()
            return True

    # ── Solution sketches ─────────────────────────────────────────────────────

    async def list_solution_sketches(self, *, status: str | None = None) -> list[SolutionSketchORM]:
        async with self._session_factory() as s:
            stmt = select(SolutionSketchORM).order_by(SolutionSketchORM.updated_at.desc())
            if status:
                stmt = stmt.where(SolutionSketchORM.status == status)
            rows = (await s.execute(stmt)).scalars().all()
            return list(rows)

    async def get_solution_sketch(self, sketch_id: UUID) -> SolutionSketchORM | None:
        async with self._session_factory() as s:
            return await s.get(SolutionSketchORM, sketch_id)

    async def create_solution_sketch(
        self, *, title: str, description: str, created_by: str | None
    ) -> SolutionSketchORM:
        async with self._session_factory() as s:
            row = SolutionSketchORM(
                id=uuid.uuid4(),
                title=title,
                description=description,
                status="draft",
                answers={},
                created_by=created_by,
                updated_by=created_by,
            )
            s.add(row)
            await s.commit()
            await s.refresh(row)
            return row

    async def update_solution_sketch(
        self,
        sketch_id: UUID,
        *,
        title: str | None,
        description: str | None,
        status: str | None,
        answers: dict | None,
        updated_by: str | None,
    ) -> SolutionSketchORM | None:
        async with self._session_factory() as s:
            row = await s.get(SolutionSketchORM, sketch_id)
            if row is None:
                return None
            if title is not None:
                row.title = title
            if description is not None:
                row.description = description
            if status is not None:
                row.status = status
            if answers is not None:
                row.answers = answers
            row.updated_at = datetime.now(UTC)
            row.updated_by = updated_by
            await s.commit()
            await s.refresh(row)
            return row

    async def delete_solution_sketch(self, sketch_id: UUID) -> bool:
        async with self._session_factory() as s:
            row = await s.get(SolutionSketchORM, sketch_id)
            if row is None:
                return False
            await s.delete(row)
            await s.commit()
            return True

    # ── Surveys ("Enkäter") ─────────────────────────────────────────────────────

    async def list_surveys(self, *, status: str | None = None) -> list[SurveyORM]:
        async with self._session_factory() as s:
            stmt = select(SurveyORM).order_by(SurveyORM.updated_at.desc())
            if status:
                stmt = stmt.where(SurveyORM.status == status)
            rows = (await s.execute(stmt)).scalars().all()
            return list(rows)

    async def get_survey(self, survey_id: UUID) -> SurveyORM | None:
        async with self._session_factory() as s:
            return await s.get(SurveyORM, survey_id)

    async def create_survey(
        self,
        *,
        title: str,
        description: str,
        kind: str = "standard",
        target_node_type: str,
        target_attribute_key: str,
        questions: list[dict[str, Any]],
        reports: list[dict[str, Any]] | None = None,
        allow_multiple_responses: bool = False,
        due_date: date | None = None,
        include_decommissioned: bool = False,
        created_by: str | None,
    ) -> SurveyORM:
        async with self._session_factory() as s:
            row = SurveyORM(
                id=uuid.uuid4(),
                title=title,
                description=description,
                status="draft",
                kind=kind,
                target_node_type=target_node_type,
                target_attribute_key=target_attribute_key,
                questions=questions,
                reports=reports or [],
                allow_multiple_responses=allow_multiple_responses,
                due_date=due_date,
                include_decommissioned=include_decommissioned,
                created_by=created_by,
                updated_by=created_by,
            )
            s.add(row)
            await s.commit()
            await s.refresh(row)
            return row

    async def update_survey(
        self,
        survey_id: UUID,
        *,
        title: str | None,
        description: str | None,
        target_node_type: str | None,
        target_attribute_key: str | None,
        questions: list[dict[str, Any]] | None,
        reports: list[dict[str, Any]] | None,
        status: str | None,
        allow_multiple_responses: bool | None = None,
        due_date: date | None = None,
        set_due_date: bool = False,
        include_decommissioned: bool | None = None,
        updated_by: str | None,
    ) -> SurveyORM | None:
        async with self._session_factory() as s:
            row = await s.get(SurveyORM, survey_id)
            if row is None:
                return None
            if title is not None:
                row.title = title
            if description is not None:
                row.description = description
            if target_node_type is not None:
                row.target_node_type = target_node_type
            if target_attribute_key is not None:
                row.target_attribute_key = target_attribute_key
            if questions is not None:
                row.questions = questions
            if reports is not None:
                row.reports = reports
            if status is not None:
                row.status = status
            if allow_multiple_responses is not None:
                row.allow_multiple_responses = allow_multiple_responses
            if set_due_date:
                row.due_date = due_date
            if include_decommissioned is not None:
                row.include_decommissioned = include_decommissioned
            row.updated_at = datetime.now(UTC)
            row.updated_by = updated_by
            await s.commit()
            await s.refresh(row)
            return row

    async def delete_survey(self, survey_id: UUID) -> bool:
        async with self._session_factory() as s:
            row = await s.get(SurveyORM, survey_id)
            if row is None:
                return False
            await s.delete(row)
            await s.commit()
            return True

    # ── Published reports ────────────────────────────────────────────────────

    async def create_published_report(
        self,
        *,
        survey_id: UUID,
        survey_title: str,
        report_number: int,
        name: str,
        payload: dict[str, Any],
        published_by: str | None,
    ) -> PublishedReportORM:
        """Store one edition. Publishing again makes a new row, never an update —
        earlier editions are the point."""
        async with self._session_factory() as s:
            row = PublishedReportORM(
                survey_id=survey_id,
                survey_title=survey_title,
                report_number=report_number,
                name=name,
                payload=payload,
                published_by=published_by,
            )
            s.add(row)
            await s.flush()
            # File the edition under the "enkater" tag straight away, so it has a
            # heading in the Rapporter listing from the moment it exists. The
            # tag is only a default — it can be retagged like any report, and
            # an admin who deleted the tag just gets an untagged edition.
            default_tag = await s.execute(
                select(ReportTagORM.id).where(ReportTagORM.slug == "enkater")
            )
            tag_id = default_tag.scalar_one_or_none()
            if tag_id is not None:
                s.add(ReportTagLinkORM(report_key=f"published:{row.id}", tag_id=tag_id))
            await s.commit()
            await s.refresh(row)
            return row

    async def list_published_reports(self) -> list[PublishedReportORM]:
        """Newest edition first — the order the menu lists them in."""
        async with self._session_factory() as s:
            result = await s.execute(
                select(PublishedReportORM).order_by(PublishedReportORM.published_at.desc())
            )
            return list(result.scalars().all())

    async def get_published_report(self, report_id: UUID) -> PublishedReportORM | None:
        async with self._session_factory() as s:
            return await s.get(PublishedReportORM, report_id)

    async def delete_published_report(self, report_id: UUID) -> bool:
        async with self._session_factory() as s:
            row = await s.get(PublishedReportORM, report_id)
            if row is None:
                return False
            await s.delete(row)
            # The tag links are keyed by slug, not by a foreign key, so
            # unpublishing has to take them with it or they linger forever.
            await s.execute(
                delete(ReportTagLinkORM).where(
                    ReportTagLinkORM.report_key == f"published:{report_id}"
                )
            )
            await s.commit()
            return True

    # ── Report tags ──────────────────────────────────────────────────────────

    async def list_report_tags(self) -> list[ReportTagORM]:
        """Menu order: sort_order first, then name, so the listing is stable."""
        async with self._session_factory() as s:
            result = await s.execute(
                select(ReportTagORM).order_by(ReportTagORM.sort_order, ReportTagORM.name)
            )
            return list(result.scalars().all())

    async def list_report_tag_links(self) -> list[ReportTagLinkORM]:
        async with self._session_factory() as s:
            result = await s.execute(select(ReportTagLinkORM))
            return list(result.scalars().all())

    async def get_report_tag(self, tag_id: UUID) -> ReportTagORM | None:
        async with self._session_factory() as s:
            return await s.get(ReportTagORM, tag_id)

    async def get_report_tag_by_slug(self, slug: str) -> ReportTagORM | None:
        async with self._session_factory() as s:
            result = await s.execute(select(ReportTagORM).where(ReportTagORM.slug == slug))
            return result.scalar_one_or_none()

    async def create_report_tag(
        self,
        *,
        slug: str,
        name: str,
        color: str,
        sort_order: int,
        report_keys: list[str],
    ) -> ReportTagORM:
        async with self._session_factory() as s:
            row = ReportTagORM(slug=slug, name=name, color=color, sort_order=sort_order)
            s.add(row)
            await s.flush()
            for key in dict.fromkeys(report_keys):
                s.add(ReportTagLinkORM(report_key=key, tag_id=row.id))
            await s.commit()
            await s.refresh(row)
            return row

    async def update_report_tag(
        self,
        tag_id: UUID,
        *,
        name: str | None = None,
        color: str | None = None,
        sort_order: int | None = None,
    ) -> ReportTagORM | None:
        async with self._session_factory() as s:
            row = await s.get(ReportTagORM, tag_id)
            if row is None:
                return None
            if name is not None:
                row.name = name
            if color is not None:
                row.color = color
            if sort_order is not None:
                row.sort_order = sort_order
            await s.commit()
            await s.refresh(row)
            return row

    async def delete_report_tag(self, tag_id: UUID) -> bool:
        """Removing a tag untags its reports — they fall back to "Övrigt"."""
        async with self._session_factory() as s:
            row = await s.get(ReportTagORM, tag_id)
            if row is None:
                return False
            await s.delete(row)
            await s.commit()
            return True

    async def set_report_tags(self, report_key: str, tag_ids: list[UUID]) -> list[UUID]:
        """Replace one report's whole tag set. Unknown tag ids are dropped
        rather than rejected, so a tag deleted in another tab can't wedge a save."""
        async with self._session_factory() as s:
            result = await s.execute(select(ReportTagORM.id).where(ReportTagORM.id.in_(tag_ids)))
            known = set(result.scalars().all())
            valid = [t for t in dict.fromkeys(tag_ids) if t in known]
            await s.execute(
                delete(ReportTagLinkORM).where(ReportTagLinkORM.report_key == report_key)
            )
            for tag_id in valid:
                s.add(ReportTagLinkORM(report_key=report_key, tag_id=tag_id))
            await s.commit()
            return valid

    # ── Report names ─────────────────────────────────────────────────────────

    async def list_report_names(self) -> list[ReportNameORM]:
        async with self._session_factory() as s:
            result = await s.execute(select(ReportNameORM))
            return list(result.scalars().all())

    async def set_report_name(
        self, report_key: str, name: str, updated_by: str | None
    ) -> ReportNameORM:
        """Rename, or re-rename — one row per report, replaced in place."""
        async with self._session_factory() as s:
            row = await s.get(ReportNameORM, report_key)
            if row is None:
                row = ReportNameORM(report_key=report_key, name=name, updated_by=updated_by)
                s.add(row)
            else:
                row.name = name
                row.updated_by = updated_by
            await s.commit()
            await s.refresh(row)
            return row

    async def clear_report_name(self, report_key: str) -> bool:
        """Drop the override; the report goes back to its translated name."""
        async with self._session_factory() as s:
            row = await s.get(ReportNameORM, report_key)
            if row is None:
                return False
            await s.delete(row)
            await s.commit()
            return True

    async def rename_published_report(self, report_id: UUID, name: str) -> PublishedReportORM | None:
        """A published edition owns its name — exports and PDF filenames read
        it — so renaming one changes the row rather than shadowing it."""
        async with self._session_factory() as s:
            row = await s.get(PublishedReportORM, report_id)
            if row is None:
                return None
            row.name = name
            await s.commit()
            await s.refresh(row)
            return row

    _SURVEY_RECIPIENT_SPLIT_RE = re.compile(r"[,;/\n]+")
    _SURVEY_EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")

    @classmethod
    def _split_survey_recipient_candidates(cls, raw_value: str) -> list[str]:
        candidates: list[str] = []
        for part in cls._SURVEY_RECIPIENT_SPLIT_RE.split(raw_value):
            part = part.strip()
            if not part:
                continue
            email_match = cls._SURVEY_EMAIL_RE.search(part)
            candidates.append(email_match.group(0) if email_match else part.strip("<> "))
        return candidates

    async def resolve_survey_recipients(self, survey_id: UUID) -> list[SurveyResponseORM]:
        """(Re)compute response slots for a survey from current node attributes.

        Idempotent and safe to re-run: only rows still in `draft` are
        inserted/updated. Rows already `pending`/`submitted`/`reviewed` are
        left untouched, so re-resolving after launch only picks up systems
        that didn't exist yet, never overwrites in-flight or completed answers.

        Nodes with status "Avvecklat" are excluded unless the survey has
        include_decommissioned set; re-resolving also removes their
        still-draft slots (manually added recipients are kept).
        """
        async with self._session_factory() as s:
            survey = await s.get(SurveyORM, survey_id)
            if survey is None:
                return []

            node_rows = (
                await s.execute(
                    select(NodeORM).where(
                        NodeORM.type == survey.target_node_type,
                        NodeORM.archived == False,
                    )
                )
            ).scalars().all()

            def _is_decommissioned(node: NodeORM) -> bool:
                status = (node.attributes or {}).get("status")
                return isinstance(status, str) and status.strip().lower() == "avvecklat"

            excluded_node_ids: set[UUID] = set()
            if not survey.include_decommissioned:
                excluded_node_ids = {n.id for n in node_rows if _is_decommissioned(n)}
                node_rows = [n for n in node_rows if n.id not in excluded_node_ids]

            user_rows = (await s.execute(select(UserORM))).scalars().all()
            by_email = {u.email.lower(): u for u in user_rows if u.email}
            by_name = {u.name.strip().lower(): u for u in user_rows if u.name}

            existing_rows = (
                await s.execute(
                    select(SurveyResponseORM).where(SurveyResponseORM.survey_id == survey_id)
                )
            ).scalars().all()
            existing_by_node = {r.node_id: r for r in existing_rows}

            for r in existing_rows:
                if r.node_id in excluded_node_ids and r.status == "draft" and r.match_status != "manual":
                    await s.delete(r)

            for node in node_rows:
                raw_value = (node.attributes or {}).get(survey.target_attribute_key)
                if not isinstance(raw_value, str) or not raw_value.strip():
                    # No owner attribute set — still create a slot for this
                    # object (unmatched, unassigned) so an admin can assign a
                    # recipient manually instead of the object silently
                    # never getting a survey at all.
                    raw_value = None

                matched_ids: set[UUID] = set()
                if raw_value:
                    for candidate in self._split_survey_recipient_candidates(raw_value):
                        lowered = candidate.lower()
                        user = by_email.get(lowered) or by_name.get(lowered)
                        if user:
                            matched_ids.add(user.id)

                if len(matched_ids) == 1:
                    match_status = "matched"
                    assigned_user_id = next(iter(matched_ids))
                elif len(matched_ids) > 1:
                    match_status = "ambiguous"
                    assigned_user_id = None
                else:
                    match_status = "unmatched"
                    assigned_user_id = None

                existing = existing_by_node.get(node.id)
                if existing is not None:
                    if existing.status != "draft":
                        continue
                    existing.raw_target_value = raw_value
                    existing.match_status = match_status
                    existing.assigned_user_id = assigned_user_id
                else:
                    s.add(
                        SurveyResponseORM(
                            id=uuid.uuid4(),
                            survey_id=survey_id,
                            node_id=node.id,
                            raw_target_value=raw_value,
                            assigned_user_id=assigned_user_id,
                            match_status=match_status,
                            status="draft",
                            answers={},
                            token=secrets.token_urlsafe(32),
                        )
                    )

            await s.commit()

            rows = (
                await s.execute(
                    select(SurveyResponseORM).where(SurveyResponseORM.survey_id == survey_id)
                )
            ).scalars().all()
            return list(rows)

    async def _survey_response_join_maps(
        self, s: AsyncSession, responses: list[SurveyResponseORM]
    ) -> tuple[dict[UUID, SurveyORM], dict[UUID, NodeORM], dict[UUID, UserORM]]:
        survey_ids = {r.survey_id for r in responses}
        node_ids = {r.node_id for r in responses if r.node_id}
        user_ids = {r.assigned_user_id for r in responses if r.assigned_user_id}

        surveys = (
            (await s.execute(select(SurveyORM).where(SurveyORM.id.in_(survey_ids)))).scalars().all()
            if survey_ids
            else []
        )
        nodes = (
            (await s.execute(select(NodeORM).where(NodeORM.id.in_(node_ids)))).scalars().all()
            if node_ids
            else []
        )
        users = (
            (await s.execute(select(UserORM).where(UserORM.id.in_(user_ids)))).scalars().all()
            if user_ids
            else []
        )
        return (
            {sv.id: sv for sv in surveys},
            {n.id: n for n in nodes},
            {u.id: u for u in users},
        )

    def _survey_response_to_summary_dict(
        self,
        r: SurveyResponseORM,
        survey_by_id: dict[UUID, SurveyORM],
        node_by_id: dict[UUID, NodeORM],
        user_by_id: dict[UUID, UserORM],
    ) -> dict[str, Any]:
        survey = survey_by_id.get(r.survey_id)
        node = node_by_id.get(r.node_id) if r.node_id else None
        user = user_by_id.get(r.assigned_user_id) if r.assigned_user_id else None
        return {
            "id": r.id,
            "survey_id": r.survey_id,
            "survey_title": survey.title if survey else "",
            "survey_status": survey.status if survey else "closed",
            "survey_kind": survey.kind if survey else "standard",
            "survey_due_date": survey.due_date if survey else None,
            "allow_multiple_responses": survey.allow_multiple_responses if survey else False,
            "node_id": r.node_id,
            "node_name": node.name if node else None,
            "raw_target_value": r.raw_target_value,
            "assigned_user_id": r.assigned_user_id,
            "assigned_user_name": user.name if user else None,
            "assigned_user_email": user.email if user else None,
            "match_status": r.match_status,
            "status": r.status,
            "answers": r.answers or {},
            "token": r.token,
            "submitted_at": r.submitted_at,
            "submitted_by": r.submitted_by,
            "reviewed_at": r.reviewed_at,
            "reviewed_by": r.reviewed_by,
            "updated_at": r.updated_at,
        }

    def _survey_response_to_read_dict(
        self,
        r: SurveyResponseORM,
        survey: SurveyORM,
        node: NodeORM | None,
    ) -> dict[str, Any]:
        return {
            "id": r.id,
            "survey_id": r.survey_id,
            "survey_title": survey.title,
            "survey_description": survey.description,
            "survey_status": survey.status,
            "survey_kind": survey.kind,
            "survey_due_date": survey.due_date,
            "allow_multiple_responses": survey.allow_multiple_responses,
            "questions": survey.questions or [],
            "node_id": r.node_id,
            "node_name": node.name if node else None,
            "assigned_user_id": r.assigned_user_id,
            "match_status": r.match_status,
            "status": r.status,
            "answers": r.answers or {},
            "token": r.token,
            "submitted_at": r.submitted_at,
            "submitted_by": r.submitted_by,
            "reviewed_at": r.reviewed_at,
            "reviewed_by": r.reviewed_by,
        }

    async def list_survey_responses(
        self,
        *,
        survey_id: UUID | None = None,
        assigned_user_id: UUID | None = None,
        for_my_surveys: bool = False,
    ) -> list[dict[str, Any]]:
        """List response rows, joined with survey/node/user names for display.

        `for_my_surveys=True` applies the end-user visibility rule: only
        slots that were actually launched to the recipient (`pending`,
        `submitted`, or `reviewed` — never a still-unlaunched `draft`).
        Includes closed surveys too, so a respondent can still see a survey
        closed before they got to it — the frontend splits current vs.
        closed into separate tabs rather than the API hiding closed ones.
        Random-system slots ("slumpenkäter") are left out entirely: they
        exist only for the login dialog that offers them, and are never
        listed as something the user has to keep track of — neither while
        pending nor after answering.
        """
        async with self._session_factory() as s:
            stmt = select(SurveyResponseORM)
            if survey_id is not None:
                stmt = stmt.where(SurveyResponseORM.survey_id == survey_id)
            if assigned_user_id is not None:
                stmt = stmt.where(SurveyResponseORM.assigned_user_id == assigned_user_id)
            if for_my_surveys:
                stmt = (
                    stmt.where(SurveyResponseORM.status.in_(("pending", "submitted", "reviewed")))
                    .join(SurveyORM, SurveyORM.id == SurveyResponseORM.survey_id)
                    .where(SurveyORM.kind != "random_system")
                )
            stmt = stmt.order_by(SurveyResponseORM.updated_at.desc())
            responses = (await s.execute(stmt)).scalars().all()

            survey_by_id, node_by_id, user_by_id = await self._survey_response_join_maps(s, list(responses))

            return [
                self._survey_response_to_summary_dict(r, survey_by_id, node_by_id, user_by_id)
                for r in responses
            ]

    async def get_survey_response(self, response_id: UUID) -> dict[str, Any] | None:
        async with self._session_factory() as s:
            row = await s.get(SurveyResponseORM, response_id)
            if row is None:
                return None
            survey = await s.get(SurveyORM, row.survey_id)
            node = await s.get(NodeORM, row.node_id) if row.node_id else None
            if survey is None:
                return None
            return self._survey_response_to_read_dict(row, survey, node)

    async def get_survey_response_by_token(self, token: str) -> dict[str, Any] | None:
        async with self._session_factory() as s:
            row = (
                await s.execute(select(SurveyResponseORM).where(SurveyResponseORM.token == token))
            ).scalar_one_or_none()
            if row is None:
                return None
            survey = await s.get(SurveyORM, row.survey_id)
            node = await s.get(NodeORM, row.node_id) if row.node_id else None
            if survey is None:
                return None
            return self._survey_response_to_read_dict(row, survey, node)

    async def add_manual_survey_response(
        self, survey_id: UUID, user_id: UUID, node_id: UUID | None = None
    ) -> SurveyResponseORM:
        """Add (or repoint) a recipient slot straight to a person.

        With `node_id`, this maps the person to that specific object — the
        manual equivalent of what `resolve_survey_recipients` does
        automatically from an owner attribute, for cases where the object
        has no such attribute or the auto-match picked the wrong person. If
        a slot for that object already exists (e.g. from a previous
        resolve), it's re-pointed to this user rather than duplicated,
        since (survey_id, node_id) is unique.

        Without `node_id`, this is a general send-out with no object
        attached at all.
        """
        async with self._session_factory() as s:
            if node_id is not None:
                existing = (
                    await s.execute(
                        select(SurveyResponseORM).where(
                            SurveyResponseORM.survey_id == survey_id,
                            SurveyResponseORM.node_id == node_id,
                        )
                    )
                ).scalar_one_or_none()
                if existing is not None:
                    existing.assigned_user_id = user_id
                    existing.match_status = "manual"
                    await s.commit()
                    await s.refresh(existing)
                    return existing

            row = SurveyResponseORM(
                id=uuid.uuid4(),
                survey_id=survey_id,
                node_id=node_id,
                raw_target_value=None,
                assigned_user_id=user_id,
                match_status="manual",
                status="draft",
                answers={},
                token=secrets.token_urlsafe(32),
            )
            s.add(row)
            await s.commit()
            await s.refresh(row)
            return row

    async def assign_survey_response_user(
        self, response_id: UUID, user_id: UUID
    ) -> SurveyResponseORM | None:
        async with self._session_factory() as s:
            row = await s.get(SurveyResponseORM, response_id)
            if row is None:
                return None
            row.assigned_user_id = user_id
            row.match_status = "manual"
            await s.commit()
            await s.refresh(row)
            return row

    async def launch_survey(
        self, survey_id: UUID, *, response_ids: list[UUID] | None = None
    ) -> dict[str, int]:
        """Move draft response slots to `pending` so their recipients see them.

        `response_ids=None` launches the whole resolved group (default,
        backward-compatible behaviour). Passing an explicit subset launches
        only those — callers can call this repeatedly to roll a survey out
        to one recipient, a few, then the rest, since already-`pending`/
        `submitted`/`reviewed` rows are simply left alone on subsequent calls.
        """
        async with self._session_factory() as s:
            survey = await s.get(SurveyORM, survey_id)
            if survey is None:
                raise ValueError("Survey not found")
            survey.status = "open"

            stmt = select(SurveyResponseORM).where(
                SurveyResponseORM.survey_id == survey_id,
                SurveyResponseORM.status == "draft",
            )
            if response_ids is not None:
                stmt = stmt.where(SurveyResponseORM.id.in_(response_ids))
            draft_rows = (await s.execute(stmt)).scalars().all()

            launched = 0
            skipped = 0
            for row in draft_rows:
                if row.assigned_user_id is not None:
                    row.status = "pending"
                    launched += 1
                else:
                    skipped += 1

            await s.commit()
            return {"launched": launched, "skipped_unassigned": skipped}

    async def close_survey(self, survey_id: UUID) -> SurveyORM | None:
        async with self._session_factory() as s:
            row = await s.get(SurveyORM, survey_id)
            if row is None:
                return None
            row.status = "closed"
            await s.commit()
            await s.refresh(row)
            return row

    async def check_random_survey_trigger(
        self, user_id: UUID, *, probability: float = 1 / 3
    ) -> dict[str, Any] | None:
        """Roll the random-survey ("slumpenkät") dice for one login session.

        Returns a response-summary dict to offer the user, or None when
        nothing should be shown: the roll failed, another (standard) survey
        is still waiting for them, no random survey is open, or they have
        already been asked about every eligible system. An existing pending
        random slot is re-offered instead of creating a new one, so a
        postponed survey keeps its system until answered.
        """
        if random.random() >= probability:
            return None

        async with self._session_factory() as s:
            # Never compete with an ordinary survey the user hasn't answered.
            other_pending = (
                await s.execute(
                    select(SurveyResponseORM.id)
                    .join(SurveyORM, SurveyORM.id == SurveyResponseORM.survey_id)
                    .where(
                        SurveyResponseORM.assigned_user_id == user_id,
                        SurveyResponseORM.status == "pending",
                        SurveyORM.kind != "random_system",
                        SurveyORM.status == "open",
                    )
                    .limit(1)
                )
            ).first()
            if other_pending is not None:
                return None

            surveys = (
                await s.execute(
                    select(SurveyORM)
                    .where(SurveyORM.kind == "random_system", SurveyORM.status == "open")
                    .order_by(SurveyORM.created_at)
                )
            ).scalars().all()
            if not surveys:
                return None

            survey_ids = [sv.id for sv in surveys]
            existing = (
                await s.execute(
                    select(SurveyResponseORM)
                    .where(
                        SurveyResponseORM.survey_id.in_(survey_ids),
                        SurveyResponseORM.assigned_user_id == user_id,
                        SurveyResponseORM.match_status == "random",
                        SurveyResponseORM.status == "pending",
                    )
                    .order_by(SurveyResponseORM.created_at)
                    .limit(1)
                )
            ).scalars().first()
            if existing is not None:
                return await self._random_slot_summary(s, existing)

            for survey in surveys:
                node = await self._pick_random_survey_node(s, survey, user_id)
                if node is None:
                    continue
                row = SurveyResponseORM(
                    id=uuid.uuid4(),
                    survey_id=survey.id,
                    node_id=node.id,
                    raw_target_value=None,
                    assigned_user_id=user_id,
                    match_status="random",
                    status="pending",
                    answers={},
                    token=secrets.token_urlsafe(32),
                )
                s.add(row)
                try:
                    await s.commit()
                    await s.refresh(row)
                except IntegrityError:
                    # Another request (second tab) created the slot first —
                    # offer that one instead.
                    await s.rollback()
                    existing = (
                        await s.execute(
                            select(SurveyResponseORM).where(
                                SurveyResponseORM.survey_id == survey.id,
                                SurveyResponseORM.assigned_user_id == user_id,
                                SurveyResponseORM.match_status == "random",
                                SurveyResponseORM.status == "pending",
                            )
                        )
                    ).scalars().first()
                    if existing is None:
                        return None
                    row = existing
                return await self._random_slot_summary(s, row)

            return None

    async def _pick_random_survey_node(
        self, s: AsyncSession, survey: SurveyORM, user_id: UUID
    ) -> NodeORM | None:
        """Pick a random active node the user hasn't already been asked about."""
        stmt = (
            select(NodeORM)
            .where(
                NodeORM.type == survey.target_node_type,
                NodeORM.archived == False,
                ~exists().where(
                    SurveyResponseORM.survey_id == survey.id,
                    SurveyResponseORM.node_id == NodeORM.id,
                    SurveyResponseORM.assigned_user_id == user_id,
                ),
            )
            .order_by(func.random())
            .limit(1)
        )
        if not survey.include_decommissioned:
            status_attr = NodeORM.attributes["status"].astext
            stmt = stmt.where(
                or_(status_attr.is_(None), func.lower(func.trim(status_attr)) != "avvecklat")
            )
        return (await s.execute(stmt)).scalars().first()

    async def _random_slot_summary(
        self, s: AsyncSession, row: SurveyResponseORM
    ) -> dict[str, Any]:
        survey_by_id, node_by_id, user_by_id = await self._survey_response_join_maps(s, [row])
        return self._survey_response_to_summary_dict(row, survey_by_id, node_by_id, user_by_id)

    async def submit_survey_response(
        self, response_id: UUID, *, answers: dict[str, Any], submitted_by: str | None
    ) -> SurveyResponseORM:
        async with self._session_factory() as s:
            row = await s.get(SurveyResponseORM, response_id)
            if row is None:
                raise ValueError("Response not found")
            survey = await s.get(SurveyORM, row.survey_id)
            if survey is None:
                raise ValueError("Survey not found")

            visible_list, _ended = compute_visible_question_ids(survey.questions or [], answers)
            visible_ids = set(visible_list)
            for question in survey.questions or []:
                qid = question.get("id")
                if qid not in visible_ids or not question.get("required"):
                    continue
                value = answers.get(qid)
                if question.get("type") == "rating_matrix":
                    # Required means every parameter row has been rated.
                    rows = [r for r in (question.get("rows") or []) if isinstance(r, str) and r.strip()]
                    filled = value if isinstance(value, dict) else {}
                    if any(filled.get(row) is None for row in rows):
                        raise ValueError(
                            f"Fältet \"{question.get('label', qid)}\" är obligatoriskt — gradera alla parametrar"
                        )
                    continue
                if value is None or value == "" or value == []:
                    raise ValueError(f"Fältet \"{question.get('label', qid)}\" är obligatoriskt")

            row.answers = answers
            row.status = "submitted"
            row.submitted_at = datetime.now(UTC)
            row.submitted_by = submitted_by
            await s.commit()
            await s.refresh(row)
            return row

    async def review_survey_response(
        self, response_id: UUID, *, reviewed_by: str | None
    ) -> SurveyResponseORM | None:
        async with self._session_factory() as s:
            row = await s.get(SurveyResponseORM, response_id)
            if row is None:
                return None
            if row.status != "submitted":
                raise ValueError("Endast inskickade svar kan markeras som granskade")
            row.status = "reviewed"
            row.reviewed_at = datetime.now(UTC)
            row.reviewed_by = reviewed_by
            await s.commit()
            await s.refresh(row)
            return row

    async def delete_survey_response(self, response_id: UUID) -> bool:
        async with self._session_factory() as s:
            row = await s.get(SurveyResponseORM, response_id)
            if row is None:
                return False
            await s.delete(row)
            await s.commit()
            return True

    async def survey_has_submitted_responses(self, survey_id: UUID) -> bool:
        """True once at least one recipient has answered — the point past which
        editing questions could orphan or invalidate already-recorded answers."""
        async with self._session_factory() as s:
            row = (
                await s.execute(
                    select(SurveyResponseORM.id)
                    .where(
                        SurveyResponseORM.survey_id == survey_id,
                        SurveyResponseORM.status.in_(("submitted", "reviewed")),
                    )
                    .limit(1)
                )
            ).first()
            return row is not None

    # ── Comments ──────────────────────────────────────────────────────────────

    async def list_comments(
        self,
        *,
        subject_type: str,
        subject_id: str | None = None,
        statuses: list[str] | None = None,
        actor: str | None = None,
    ) -> list[CommentORM]:
        async with self._session_factory() as s:
            stmt = select(CommentORM).where(CommentORM.subject_type == subject_type)
            if subject_id:
                stmt = stmt.where(CommentORM.subject_id == subject_id)
            if statuses:
                # actor sees their own pending too even when statuses filter is applied;
                # the API layer composes the right statuses to pass in.
                stmt = stmt.where(CommentORM.status.in_(statuses))
            stmt = stmt.order_by(CommentORM.created_at.desc())
            rows = (await s.execute(stmt)).scalars().all()
            return list(rows)

    async def get_comment(self, comment_id: UUID) -> CommentORM | None:
        async with self._session_factory() as s:
            return await s.get(CommentORM, comment_id)

    async def create_comment(
        self, *, subject_type: str, subject_id: str, body: str, created_by: str | None
    ) -> CommentORM:
        async with self._session_factory() as s:
            row = CommentORM(
                id=uuid.uuid4(),
                subject_type=subject_type,
                subject_id=subject_id,
                body=body,
                status="pending",
                created_by=created_by,
            )
            s.add(row)
            await s.commit()
            await s.refresh(row)
            return row

    async def review_comment(
        self,
        comment_id: UUID,
        *,
        status: str,
        reply: str | None,
        reviewed_by: str | None,
    ) -> CommentORM | None:
        async with self._session_factory() as s:
            row = await s.get(CommentORM, comment_id)
            if row is None:
                return None
            row.status = status
            row.reply = reply
            row.reviewed_at = datetime.now(UTC)
            row.reviewed_by = reviewed_by
            await s.commit()
            await s.refresh(row)
            return row

    async def delete_comment(self, comment_id: UUID) -> bool:
        async with self._session_factory() as s:
            row = await s.get(CommentORM, comment_id)
            if row is None:
                return False
            await s.delete(row)
            await s.commit()
            return True

    # ── Search ────────────────────────────────────────────────────────────────

    async def search_nodes(self, query: str, limit: int = 20) -> list[NodeRead]:
        async with self._session_factory() as s:
            like = f"%{query.lower()}%"
            q = (
                select(NodeORM)
                .where(
                    NodeORM.archived.is_(False),
                    func.lower(NodeORM.name).like(like)
                    | func.coalesce(func.lower(NodeORM.description), "").like(like),
                )
                .limit(limit)
            )
            rows = (await s.execute(q)).scalars().all()
            return [_node_to_read(r) for r in rows]

    # ── Document versions ─────────────────────────────────────────────────────

    async def list_document_versions(
        self, document_type: str, *, limit: int = 100
    ) -> list[DocumentVersionORM]:
        async with self._session_factory() as s:
            q = (
                select(DocumentVersionORM)
                .where(DocumentVersionORM.document_type == document_type)
                .order_by(
                    DocumentVersionORM.version_major.desc(),
                    DocumentVersionORM.version_minor.desc(),
                )
                .limit(limit)
            )
            rows = (await s.execute(q)).scalars().all()
            return list(rows)

    async def get_latest_document_version(
        self, document_type: str
    ) -> DocumentVersionORM | None:
        async with self._session_factory() as s:
            q = (
                select(DocumentVersionORM)
                .where(DocumentVersionORM.document_type == document_type)
                .order_by(
                    DocumentVersionORM.version_major.desc(),
                    DocumentVersionORM.version_minor.desc(),
                )
                .limit(1)
            )
            return (await s.execute(q)).scalar_one_or_none()

    async def get_document_version(self, version_id: UUID) -> DocumentVersionORM | None:
        async with self._session_factory() as s:
            return await s.get(DocumentVersionORM, version_id)

    async def list_audit_entries_for_document(
        self,
        document_type: str,
        *,
        since: datetime | None = None,
        include_principle_nodes: bool = False,
        include_glossary_terms: bool = False,
    ) -> list[AuditLogORM]:
        """Return audit log entries relevant to a document, optionally since a
        given moment.

        For 'principle_document' we also include node-audit rows for
        ArchitecturePrinciple subtype when include_principle_nodes=True, since
        the principles themselves live as nodes but are part of the principle
        document being versioned. Similarly for 'glossary', individual
        glossary_term rows are included when include_glossary_terms=True.
        """
        async with self._session_factory() as s:
            q = select(AuditLogORM)
            conditions = [AuditLogORM.entity_type == document_type]
            if include_principle_nodes:
                conditions.append(
                    (AuditLogORM.entity_type == "node")
                    & (AuditLogORM.entity_subtype == NodeType.ARCHITECTURE_PRINCIPLE.value)
                )
            if include_glossary_terms:
                conditions.append(AuditLogORM.entity_type == "glossary_term")
            q = q.where(or_(*conditions))
            if since is not None:
                q = q.where(AuditLogORM.created_at > since)
            q = q.order_by(AuditLogORM.created_at.asc())
            rows = (await s.execute(q)).scalars().all()
            return list(rows)

    async def get_document_metadata(
        self, document_type: str
    ) -> DocumentMetadataORM | None:
        async with self._session_factory() as s:
            return await s.get(DocumentMetadataORM, document_type)

    async def upsert_document_metadata(
        self,
        document_type: str,
        entries: list[dict[str, Any]],
        *,
        updated_by: str | None = None,
    ) -> DocumentMetadataORM:
        async with self._session_factory() as s:
            row = await s.get(DocumentMetadataORM, document_type)
            if row is None:
                row = DocumentMetadataORM(
                    document_type=document_type,
                    entries=entries,
                    updated_by=updated_by,
                )
                s.add(row)
            else:
                row.entries = entries
                row.updated_by = updated_by
                row.updated_at = datetime.now(UTC)
            await s.commit()
            await s.refresh(row)
            return row

    async def create_document_version(
        self,
        *,
        document_type: str,
        version_major: int,
        version_minor: int,
        is_major: bool,
        snapshot: dict[str, Any],
        audit_entries: list[dict[str, Any]],
        change_summary: str | None,
        created_by: str | None,
    ) -> DocumentVersionORM:
        async with self._session_factory() as s:
            row = DocumentVersionORM(
                id=uuid.uuid4(),
                document_type=document_type,
                version_major=version_major,
                version_minor=version_minor,
                is_major=is_major,
                snapshot=snapshot,
                audit_entries=audit_entries,
                change_summary=change_summary,
                created_by=created_by,
            )
            s.add(row)
            await s.commit()
            await s.refresh(row)
            return row

    # ── GAP tasks ─────────────────────────────────────────────────────────────

    async def list_gap_tasks(self, gap_item_id: str | None = None) -> list[GapTaskORM]:
        async with self._session_factory() as s:
            q = select(GapTaskORM)
            if gap_item_id:
                q = q.where(GapTaskORM.gap_item_id == gap_item_id)
            q = q.order_by(GapTaskORM.created_at.asc())
            return list((await s.execute(q)).scalars().all())

    async def list_all_gap_tasks(self) -> list[GapTaskORM]:
        async with self._session_factory() as s:
            return list(
                (await s.execute(select(GapTaskORM).order_by(GapTaskORM.created_at.asc()))).scalars().all()
            )

    async def create_gap_task(
        self,
        *,
        gap_item_id: str,
        title: str,
        description: str = "",
        assigned_to: str = "",
        due_date=None,
        horizon: str = "",
        weight: int = 1,
        created_by: str | None = None,
    ) -> GapTaskORM:
        async with self._session_factory() as s:
            row = GapTaskORM(
                gap_item_id=gap_item_id,
                title=title,
                description=description,
                assigned_to=assigned_to,
                due_date=due_date,
                horizon=horizon,
                weight=weight,
                created_by=created_by,
            )
            s.add(row)
            await s.commit()
            await s.refresh(row)
            return row

    async def update_gap_task(
        self,
        task_id: UUID,
        updates: dict,
        *,
        status_comment: str = "",
        updated_by: str | None = None,
    ) -> GapTaskORM | None:
        async with self._session_factory() as s:
            row = await s.get(GapTaskORM, task_id)
            if row is None:
                return None
            new_status = updates.get("status")
            if new_status and new_status != row.status:
                s.add(GapStatusLogORM(
                    gap_item_id=row.gap_item_id,
                    task_id=row.id,
                    task_title=updates.get("title") or row.title,
                    from_status=row.status,
                    to_status=new_status,
                    comment=status_comment,
                    created_by=updated_by,
                ))
            for k, v in updates.items():
                setattr(row, k, v)
            if updates.get("status") == "done" and row.completed_at is None:
                row.completed_at = datetime.now(UTC)
            row.updated_at = datetime.now(UTC)
            await s.commit()
            await s.refresh(row)
            return row

    async def delete_gap_task(self, task_id: UUID) -> bool:
        async with self._session_factory() as s:
            row = await s.get(GapTaskORM, task_id)
            if row is None:
                return False
            await s.delete(row)
            await s.commit()
            return True

    async def list_gap_status_log(self, gap_item_id: str) -> list[GapStatusLogORM]:
        async with self._session_factory() as s:
            q = (
                select(GapStatusLogORM)
                .where(GapStatusLogORM.gap_item_id == gap_item_id)
                .order_by(GapStatusLogORM.created_at.desc())
            )
            return list((await s.execute(q)).scalars().all())

    async def create_gap_status_log(
        self,
        *,
        gap_item_id: str,
        from_status: str,
        to_status: str,
        comment: str = "",
        created_by: str | None = None,
    ) -> GapStatusLogORM:
        async with self._session_factory() as s:
            row = GapStatusLogORM(
                gap_item_id=gap_item_id,
                from_status=from_status,
                to_status=to_status,
                comment=comment,
                created_by=created_by,
            )
            s.add(row)
            await s.commit()
            await s.refresh(row)
            return row

    # ── Document stamps (Fastslaget / Reviderat) ──────────────────────────────

    async def get_document_stamp(self, document_type: str) -> DocumentStampORM | None:
        async with self._session_factory() as s:
            return await s.get(DocumentStampORM, document_type)

    async def get_journey_stamps(self) -> JourneyStatusResponse:
        """Return stamp status for all four Architecture Journey documents.

        revised_at / revised_by come from the respective singleton document rows.
        approved_at / approved_by come from ea_document_stamps.
        """
        async with self._session_factory() as s:
            # Load all stamp rows into a dict keyed by document_type
            stamp_rows = (
                await s.execute(select(DocumentStampORM))
            ).scalars().all()
            stamps: dict[str, DocumentStampORM] = {r.document_type: r for r in stamp_rows}

            # Fetch revised_at / revised_by from each document table
            nulaages = (
                await s.execute(select(NulaagesanalysORM).limit(1))
            ).scalar_one_or_none()
            target_arch = (
                await s.execute(select(TargetArchitectureORM).limit(1))
            ).scalar_one_or_none()
            gap = (
                await s.execute(select(GapAnalysORM).limit(1))
            ).scalar_one_or_none()
            principle_doc = (
                await s.execute(select(PrincipleDocumentORM).limit(1))
            ).scalar_one_or_none()

        def _status(
            doc_type: str,
            revised_at: datetime | None,
            revised_by: str | None,
        ) -> JourneyDocumentStatus:
            stamp = stamps.get(doc_type)
            effective_revised_at = (
                stamp.revised_at_override
                if (stamp and stamp.revised_at_override)
                else revised_at
            )
            return JourneyDocumentStatus(
                document_type=doc_type,
                revised_at=effective_revised_at,
                revised_by=revised_by,
                approved_at=stamp.approved_at if stamp else None,
                approved_by=stamp.approved_by if stamp else None,
            )

        documents = {
            "nulaagesanalys": _status(
                "nulaagesanalys",
                nulaages.updated_at if nulaages else None,
                nulaages.updated_by if nulaages else None,
            ),
            "target_architecture": _status(
                "target_architecture",
                target_arch.updated_at if target_arch else None,
                target_arch.updated_by if target_arch else None,
            ),
            "gap_analys": _status(
                "gap_analys",
                gap.updated_at if gap else None,
                gap.updated_by if gap else None,
            ),
            "principles": _status(
                "principles",
                principle_doc.updated_at if principle_doc else None,
                # PrincipleDocumentORM has no updated_by column
                None,
            ),
        }
        return JourneyStatusResponse(documents=documents)

    async def set_document_approval(
        self,
        document_type: str,
        approved_at: datetime,
        approved_by: str,
    ) -> DocumentStampORM:
        """Upsert an approval stamp for the given document_type."""
        async with self._session_factory() as s:
            row = await s.get(DocumentStampORM, document_type)
            if row is None:
                row = DocumentStampORM(
                    document_type=document_type,
                    approved_at=approved_at,
                    approved_by=approved_by or None,
                )
                s.add(row)
            else:
                row.approved_at = approved_at
                row.approved_by = approved_by or None
                row.updated_at = datetime.now(UTC)
            await s.commit()
            await s.refresh(row)
            return row

    async def update_approved_at(
        self,
        document_type: str,
        approved_at: datetime,
    ) -> None:
        """Update only the approved_at timestamp, preserving approved_by."""
        async with self._session_factory() as s:
            row = await s.get(DocumentStampORM, document_type)
            if row:
                row.approved_at = approved_at
                row.updated_at = datetime.now(UTC)
                await s.commit()

    async def set_revised_at_override(
        self,
        document_type: str,
        revised_at_override: datetime,
    ) -> None:
        """Store an admin override for the Reviderat stamp date."""
        async with self._session_factory() as s:
            row = await s.get(DocumentStampORM, document_type)
            if row is None:
                row = DocumentStampORM(
                    document_type=document_type,
                    revised_at_override=revised_at_override,
                )
                s.add(row)
            else:
                row.revised_at_override = revised_at_override
                row.updated_at = datetime.now(UTC)
            await s.commit()

    async def clear_document_approval(self, document_type: str) -> DocumentStampORM | None:
        """Clear approved_at / approved_by for the given document_type.

        Returns the updated row, or None if no stamp row existed.
        """
        async with self._session_factory() as s:
            row = await s.get(DocumentStampORM, document_type)
            if row is None:
                return None
            row.approved_at = None
            row.approved_by = None
            row.updated_at = datetime.now(UTC)
            await s.commit()
            await s.refresh(row)
            return row

    # ── Glossary requests ─────────────────────────────────────────────────────

    async def create_glossary_request(
        self, term: str, context: str | None, requested_by: str | None
    ) -> GlossaryRequestORM:
        async with self._session_factory() as s:
            row = GlossaryRequestORM(
                id=uuid.uuid4(),
                term=term.strip(),
                context=context or None,
                requested_by=requested_by,
                status="pending",
            )
            s.add(row)
            await s.commit()
            await s.refresh(row)
            return row

    async def list_pending_glossary_requests(self) -> list[GlossaryRequestORM]:
        async with self._session_factory() as s:
            q = (
                select(GlossaryRequestORM)
                .where(GlossaryRequestORM.status == "pending")
                .order_by(GlossaryRequestORM.created_at.asc())
            )
            rows = (await s.execute(q)).scalars().all()
            return list(rows)

    async def get_glossary_request(self, request_id: UUID) -> GlossaryRequestORM | None:
        async with self._session_factory() as s:
            return await s.get(GlossaryRequestORM, request_id)

    async def set_glossary_request_status(self, request_id: UUID, status: str) -> None:
        async with self._session_factory() as s:
            row = await s.get(GlossaryRequestORM, request_id)
            if row:
                row.status = status
                await s.commit()

    # ── Graph snapshots ───────────────────────────────────────────────────────

    async def get_latest_graph_snapshot(self) -> GraphSnapshotORM | None:
        async with self._session_factory() as s:
            q = (
                select(GraphSnapshotORM)
                .order_by(GraphSnapshotORM.snapshot_number.desc())
                .limit(1)
            )
            return (await s.execute(q)).scalar_one_or_none()

    async def list_graph_snapshots(self, *, limit: int = 100) -> list[GraphSnapshotORM]:
        async with self._session_factory() as s:
            q = (
                select(GraphSnapshotORM)
                .order_by(GraphSnapshotORM.snapshot_number.desc())
                .limit(limit)
            )
            rows = (await s.execute(q)).scalars().all()
            return list(rows)

    async def get_graph_snapshot(self, snapshot_id: UUID) -> GraphSnapshotORM | None:
        async with self._session_factory() as s:
            return await s.get(GraphSnapshotORM, snapshot_id)

    async def list_graph_audit_entries_since(
        self, since: datetime | None
    ) -> list[AuditLogORM]:
        """Return node and edge audit entries since a given timestamp."""
        async with self._session_factory() as s:
            q = select(AuditLogORM).where(
                AuditLogORM.entity_type.in_(["node", "edge"])
            )
            if since is not None:
                q = q.where(AuditLogORM.created_at > since)
            q = q.order_by(AuditLogORM.created_at.asc())
            rows = (await s.execute(q)).scalars().all()
            return list(rows)

    async def create_graph_snapshot(
        self,
        *,
        node_count: int,
        edge_count: int,
        triggered_by: str,
        snapshot: dict[str, Any],
        audit_entries: list[dict[str, Any]],
        created_by: str | None,
        label: str | None,
    ) -> GraphSnapshotORM:
        async with self._session_factory() as s:
            result = await s.execute(
                select(func.coalesce(func.max(GraphSnapshotORM.snapshot_number), 0))
            )
            next_number: int = (result.scalar() or 0) + 1

            row = GraphSnapshotORM(
                id=uuid.uuid4(),
                snapshot_number=next_number,
                label=label,
                node_count=node_count,
                edge_count=edge_count,
                triggered_by=triggered_by,
                snapshot=snapshot,
                audit_entries=audit_entries,
                created_by=created_by,
            )
            s.add(row)
            await s.commit()
            await s.refresh(row)
            return row

    # ── Node flags ────────────────────────────────────────────────────────────

    async def list_all_node_flags(self) -> list[NodeFlagORM]:
        async with self._session_factory() as s:
            stmt = select(NodeFlagORM).order_by(NodeFlagORM.created_at.desc())
            rows = (await s.execute(stmt)).scalars().all()
            return list(rows)

    async def list_node_flags(self, node_id: UUID) -> list[NodeFlagORM]:
        async with self._session_factory() as s:
            stmt = (
                select(NodeFlagORM)
                .where(NodeFlagORM.node_id == node_id)
                .order_by(NodeFlagORM.created_at.desc())
            )
            rows = (await s.execute(stmt)).scalars().all()
            return list(rows)

    async def create_node_flag(
        self, *, node_id: UUID, flag_type: str, description: str | None, created_by: str | None
    ) -> NodeFlagORM:
        async with self._session_factory() as s:
            flag_row = NodeFlagORM(
                id=uuid.uuid4(),
                node_id=node_id,
                flag_type=flag_type,
                description=description,
                created_by=created_by,
            )
            s.add(flag_row)
            await s.commit()
            await s.refresh(flag_row)
            return flag_row

    async def delete_node_flag(self, flag_id: UUID) -> NodeFlagORM | None:
        async with self._session_factory() as s:
            flag_row = await s.get(NodeFlagORM, flag_id)
            if flag_row is None:
                return None
            await s.delete(flag_row)
            await s.commit()
            return flag_row

    async def respond_to_flag(
        self, *, flag_id: UUID, response: str | None, responded_by: str | None
    ) -> NodeFlagORM | None:
        from datetime import datetime
        async with self._session_factory() as s:
            flag_row = await s.get(NodeFlagORM, flag_id)
            if flag_row is None:
                return None
            flag_row.response = response
            flag_row.responded_by = responded_by if response else None
            flag_row.responded_at = datetime.now(UTC) if response else None
            await s.commit()
            await s.refresh(flag_row)
            return flag_row
