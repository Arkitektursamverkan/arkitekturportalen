"""Neo4j implementation of GraphRepository using the official async driver."""
from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

import structlog
from neo4j import AsyncGraphDatabase

from app.dal.graph_repository import GraphRepository
from app.schemas.common import (
    EdgeType,
    ExternalSource,
    GraphData,
    GraphEdgeOut,
    GraphNodeOut,
    IntegrationDirection,
    NodeType,
)
from app.schemas.edge import EdgeCreate, EdgeRead
from app.schemas.node import NodeCreate, NodeRead, NodeUpdate

log = structlog.get_logger(__name__)


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _record_to_node_read(r: dict) -> NodeRead:
    return NodeRead(
        id=UUID(r["id"]),
        type=NodeType(r["type"]),
        name=r["name"],
        description=r.get("description"),
        external_source=ExternalSource(r.get("external_source", "NONE")),
        external_id=r.get("external_id"),
        archived=bool(r.get("archived", False)),
        attributes=r.get("attributes", {}),
        last_synced_at=r.get("last_synced_at"),
        created_at=r.get("created_at", datetime.now(UTC)),
        updated_at=r.get("updated_at", datetime.now(UTC)),
    )


def _record_to_edge_read(r: dict) -> EdgeRead:
    return EdgeRead(
        id=UUID(r["id"]),
        source_id=UUID(r["source_id"]),
        target_id=UUID(r["target_id"]),
        type=EdgeType(r["type"]),
        attributes=r.get("attributes", {}),
        created_at=r.get("created_at", datetime.now(UTC)),
        updated_at=r.get("updated_at", datetime.now(UTC)),
    )


class Neo4jRepository(GraphRepository):
    def __init__(self, uri: str, user: str, password: str) -> None:
        self._driver = AsyncGraphDatabase.driver(uri, auth=(user, password))

    async def initialize(self) -> None:
        async with self._driver.session() as s:
            # Unique constraint on node id
            await s.run(
                "CREATE CONSTRAINT ea_node_id IF NOT EXISTS "
                "FOR (n:EANode) REQUIRE n.id IS UNIQUE"
            )
            # Unique on external identity
            await s.run(
                "CREATE CONSTRAINT ea_node_external IF NOT EXISTS "
                "FOR (n:EANode) REQUIRE (n.external_source, n.external_id) IS UNIQUE"
            )
        log.info("neo4j.initialized")

    async def close(self) -> None:
        await self._driver.close()
        log.info("neo4j.closed")

    # ── Nodes ─────────────────────────────────────────────────────────────────

    async def get_node(self, node_id: UUID) -> NodeRead | None:
        async with self._driver.session() as s:
            result = await s.run(
                "MATCH (n:EANode {id: $id}) RETURN properties(n) AS p",
                id=str(node_id),
            )
            record = await result.single()
            return _record_to_node_read(record["p"]) if record else None

    async def list_nodes(
        self,
        node_type: str | None = None,
        external_source: str | None = None,
        archived: bool = False,
        limit: int = 200,
        offset: int = 0,
    ) -> list[NodeRead]:
        async with self._driver.session() as s:
            filters = ["n.archived = $archived"]
            params: dict[str, Any] = {"archived": archived, "limit": limit, "offset": offset}
            if node_type:
                filters.append("n.type = $node_type")
                params["node_type"] = node_type
            if external_source:
                filters.append("n.external_source = $external_source")
                params["external_source"] = external_source
            where = " AND ".join(filters)
            result = await s.run(
                f"MATCH (n:EANode) WHERE {where} "
                "RETURN properties(n) AS p ORDER BY n.name SKIP $offset LIMIT $limit",
                **params,
            )
            return [_record_to_node_read(r["p"]) async for r in result]

    async def create_node(self, data: NodeCreate, user_name: str | None = None) -> NodeRead:
        now = _now_iso()
        node_id = str(uuid.uuid4())
        async with self._driver.session() as s:
            result = await s.run(
                """
                CREATE (n:EANode {
                  id: $id, type: $type, name: $name, description: $desc,
                  external_source: $es, external_id: $ei, archived: false,
                  attributes: $attrs, created_at: $now, updated_at: $now
                }) RETURN properties(n) AS p
                """,
                id=node_id, type=data.type.value, name=data.name, desc=data.description,
                es=data.external_source.value, ei=data.external_id,
                attrs=data.attributes, now=now,
            )
            record = await result.single()
            assert record is not None
            return _record_to_node_read(record["p"])

    async def update_node(self, node_id: UUID, data: NodeUpdate, user_name: str | None = None) -> NodeRead | None:
        updates = data.model_dump(exclude_none=True)
        updates["updated_at"] = _now_iso()
        async with self._driver.session() as s:
            result = await s.run(
                "MATCH (n:EANode {id: $id}) SET n += $updates RETURN properties(n) AS p",
                id=str(node_id), updates=updates,
            )
            record = await result.single()
            return _record_to_node_read(record["p"]) if record else None

    async def delete_node(self, node_id: UUID, user_name: str | None = None) -> bool:
        async with self._driver.session() as s:
            result = await s.run(
                "MATCH (n:EANode {id: $id}) DETACH DELETE n RETURN count(n) AS cnt",
                id=str(node_id),
            )
            record = await result.single()
            return bool(record and record["cnt"] > 0)

    async def upsert_node_by_external(
        self, external_source: str, external_id: str, data: NodeCreate
    ) -> tuple[NodeRead, bool]:
        now = _now_iso()
        async with self._driver.session() as s:
            result = await s.run(
                """
                MERGE (n:EANode {external_source: $es, external_id: $ei})
                ON CREATE SET n.id = $new_id, n.type = $type, n.name = $name,
                  n.description = $desc, n.archived = false, n.attributes = $attrs,
                  n.created_at = $now, n.updated_at = $now, n.last_synced_at = $now
                ON MATCH SET n.name = $name, n.description = $desc,
                  n.archived = false, n.attributes = $attrs, n.updated_at = $now,
                  n.last_synced_at = $now
                RETURN properties(n) AS p,
                  (n.created_at = $now) AS created
                """,
                es=external_source, ei=external_id,
                new_id=str(uuid.uuid4()), type=data.type.value,
                name=data.name, desc=data.description,
                attrs=data.attributes, now=now,
            )
            record = await result.single()
            assert record is not None
            return _record_to_node_read(record["p"]), bool(record["created"])

    # ── Edges ─────────────────────────────────────────────────────────────────

    async def get_edge(self, edge_id: UUID) -> EdgeRead | None:
        async with self._driver.session() as s:
            result = await s.run(
                "MATCH ()-[r:EA_REL {id: $id}]->() RETURN properties(r) AS p",
                id=str(edge_id),
            )
            record = await result.single()
            return _record_to_edge_read(record["p"]) if record else None

    async def list_edges(
        self,
        source_id: UUID | None = None,
        target_id: UUID | None = None,
        edge_type: str | None = None,
    ) -> list[EdgeRead]:
        async with self._driver.session() as s:
            conditions, params = [], {}
            if source_id:
                conditions.append("r.source_id = $source_id")
                params["source_id"] = str(source_id)
            if target_id:
                conditions.append("r.target_id = $target_id")
                params["target_id"] = str(target_id)
            if edge_type:
                conditions.append("r.type = $edge_type")
                params["edge_type"] = edge_type
            where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
            result = await s.run(
                f"MATCH ()-[r:EA_REL]->() {where} RETURN properties(r) AS p",
                parameters=params,
            )
            return [_record_to_edge_read(r["p"]) async for r in result]

    async def create_edge(self, data: EdgeCreate) -> EdgeRead:
        now = _now_iso()
        edge_id = str(uuid.uuid4())
        async with self._driver.session() as s:
            result = await s.run(
                """
                MATCH (src:EANode {id: $src_id}), (tgt:EANode {id: $tgt_id})
                CREATE (src)-[r:EA_REL {
                  id: $id, type: $type, source_id: $src_id, target_id: $tgt_id,
                  attributes: $attrs, created_at: $now, updated_at: $now
                }]->(tgt)
                RETURN properties(r) AS p
                """,
                src_id=str(data.source_id), tgt_id=str(data.target_id),
                id=edge_id, type=data.type.value, attrs=data.attributes, now=now,
            )
            record = await result.single()
            assert record is not None
            return _record_to_edge_read(record["p"])

    async def delete_edge(self, edge_id: UUID) -> bool:
        async with self._driver.session() as s:
            result = await s.run(
                "MATCH ()-[r:EA_REL {id: $id}]->() DELETE r RETURN count(r) AS cnt",
                id=str(edge_id),
            )
            record = await result.single()
            return bool(record and record["cnt"] > 0)

    async def update_edge_note(self, edge_id: UUID, note: str | None) -> EdgeRead | None:
        raise NotImplementedError("update_edge_note is not supported by the Neo4j backend")

    async def update_edge_direction(
        self, edge_id: UUID, direction: IntegrationDirection
    ) -> EdgeRead | None:
        raise NotImplementedError(
            "update_edge_direction is not supported by the Neo4j backend"
        )

    # ── Graph views ───────────────────────────────────────────────────────────

    async def get_process_e2e(self, process_id: UUID) -> GraphData:
        async with self._driver.session() as s:
            result = await s.run(
                """
                MATCH (proc:EANode {id: $pid, type: 'Process'})
                OPTIONAL MATCH (app:EANode {type: 'Application'})-[s:EA_REL {type: 'SUPPORTS'}]->(proc)
                OPTIONAL MATCH (app)-[h:EA_REL {type: 'HANDLES'}]->(info:EANode {type: 'InformationObject'})
                OPTIONAL MATCH (src:EANode {type: 'InformationSource'})-[re:EA_REL {type: 'REALIZES'}]->(info)
                OPTIONAL MATCH (app)-[ro:EA_REL {type: 'RUNS_ON'}]->(tech:EANode {type: 'TechnologyComponent'})
                RETURN
                  collect(DISTINCT properties(proc)) AS procs,
                  collect(DISTINCT properties(app)) AS apps,
                  collect(DISTINCT properties(info)) AS infos,
                  collect(DISTINCT properties(src)) AS srcs,
                  collect(DISTINCT properties(tech)) AS techs,
                  collect(DISTINCT properties(s)) AS s_edges,
                  collect(DISTINCT properties(h)) AS h_edges,
                  collect(DISTINCT properties(re)) AS re_edges,
                  collect(DISTINCT properties(ro)) AS ro_edges
                """,
                pid=str(process_id),
            )
            record = await result.single()
            if not record:
                return GraphData(nodes=[], edges=[])

            def to_gn(p: dict) -> GraphNodeOut | None:
                if not p or not p.get("id"):
                    return None
                return GraphNodeOut(
                    id=p["id"], type=NodeType(p["type"]), name=p.get("name", ""),
                    description=p.get("description"),
                    external_source=ExternalSource(p.get("external_source", "NONE")),
                    attributes=p.get("attributes", {}),
                )

            def to_ge(p: dict) -> GraphEdgeOut | None:
                if not p or not p.get("id"):
                    return None
                return GraphEdgeOut(
                    id=p["id"], source=p["source_id"], target=p["target_id"],
                    type=EdgeType(p["type"]), attributes=p.get("attributes", {}),
                )

            all_node_props = (
                record["procs"] + record["apps"] + record["infos"]
                + record["srcs"] + record["techs"]
            )
            all_edge_props = (
                record["s_edges"] + record["h_edges"]
                + record["re_edges"] + record["ro_edges"]
            )

            nodes = [n for p in all_node_props if (n := to_gn(p))]
            edges = [e for p in all_edge_props if (e := to_ge(p))]
            # De-duplicate by id
            seen_n: set[str] = set()
            uniq_nodes = [n for n in nodes if not (n.id in seen_n or seen_n.add(n.id))]  # type: ignore
            seen_e: set[str] = set()
            uniq_edges = [e for e in edges if not (e.id in seen_e or seen_e.add(e.id))]  # type: ignore
            return GraphData(nodes=uniq_nodes, edges=uniq_edges)

    async def get_system_view(self, app_id: UUID) -> GraphData:
        async with self._driver.session() as s:
            result = await s.run(
                """
                MATCH (app:EANode {id: $aid, type: 'Application'})
                OPTIONAL MATCH (app)-[r1:EA_REL]->(n1:EANode)
                  WHERE r1.type IN ['SUPPORTS','HANDLES','CONTAINS','RUNS_ON','INTEGRATES_WITH']
                OPTIONAL MATCH (n2:EANode)-[r2:EA_REL {type: 'INTEGRATES_WITH'}]->(app)
                RETURN
                  properties(app) AS app_props,
                  collect(DISTINCT properties(n1)) AS out_nodes,
                  collect(DISTINCT properties(r1)) AS out_edges,
                  collect(DISTINCT properties(n2)) AS in_nodes,
                  collect(DISTINCT properties(r2)) AS in_edges
                """,
                aid=str(app_id),
            )
            record = await result.single()
            if not record:
                return GraphData(nodes=[], edges=[])

            def to_gn(p: dict) -> GraphNodeOut | None:
                if not p or not p.get("id"):
                    return None
                return GraphNodeOut(
                    id=p["id"], type=NodeType(p["type"]), name=p.get("name", ""),
                    description=p.get("description"),
                    external_source=ExternalSource(p.get("external_source", "NONE")),
                    attributes=p.get("attributes", {}),
                )

            def to_ge(p: dict) -> GraphEdgeOut | None:
                if not p or not p.get("id"):
                    return None
                return GraphEdgeOut(
                    id=p["id"], source=p["source_id"], target=p["target_id"],
                    type=EdgeType(p["type"]), attributes=p.get("attributes", {}),
                )

            all_node_props = [record["app_props"]] + record["out_nodes"] + record["in_nodes"]
            all_edge_props = record["out_edges"] + record["in_edges"]
            nodes = [n for p in all_node_props if (n := to_gn(p))]
            edges = [e for p in all_edge_props if (e := to_ge(p))]
            seen_n: set[str] = set()
            uniq_nodes = [n for n in nodes if not (n.id in seen_n or seen_n.add(n.id))]  # type: ignore
            seen_e: set[str] = set()
            uniq_edges = [e for e in edges if not (e.id in seen_e or seen_e.add(e.id))]  # type: ignore
            return GraphData(nodes=uniq_nodes, edges=uniq_edges)

    async def get_landscape(self) -> GraphData:
        async with self._driver.session() as s:
            result = await s.run(
                """
                MATCH (a:EANode {type: 'Application', archived: false})
                OPTIONAL MATCH (a)-[r:EA_REL {type: 'INTEGRATES_WITH'}]->
                  (b:EANode {type: 'Application', archived: false})
                RETURN collect(DISTINCT properties(a)) AS apps,
                       collect(DISTINCT properties(r)) AS rels
                """
            )
            record = await result.single()
            if not record:
                return GraphData(nodes=[], edges=[])
            nodes = [
                GraphNodeOut(
                    id=p["id"], type=NodeType(p["type"]), name=p.get("name", ""),
                    description=p.get("description"),
                    external_source=ExternalSource(p.get("external_source", "NONE")),
                    attributes=p.get("attributes", {}),
                )
                for p in record["apps"] if p and p.get("id")
            ]
            edges = [
                GraphEdgeOut(
                    id=p["id"], source=p["source_id"], target=p["target_id"],
                    type=EdgeType(p["type"]), attributes=p.get("attributes", {}),
                )
                for p in record["rels"] if p and p.get("id")
            ]
            return GraphData(nodes=nodes, edges=edges)

    async def get_overlaps(self) -> dict[str, Any]:
        async with self._driver.session() as s:
            r1 = await s.run(
                """
                MATCH (app:EANode {type:'Application'})-[:EA_REL {type:'SUPPORTS'}]->
                  (p:EANode {type:'Process', archived:false})
                WITH p, collect(app.name) AS app_names, count(app) AS cnt
                WHERE cnt > 1
                RETURN p.id AS id, p.name AS name, cnt AS app_count, app_names
                ORDER BY cnt DESC
                """
            )
            procs = [dict(r) async for r in r1]

            r2 = await s.run(
                """
                MATCH (app:EANode {type:'Application'})-[:EA_REL {type:'HANDLES'}]->
                  (io:EANode {type:'InformationObject', archived:false})
                WITH io, collect(app.name) AS app_names, count(app) AS cnt
                WHERE cnt > 1
                RETURN io.id AS id, io.name AS name, cnt AS app_count, app_names
                ORDER BY cnt DESC
                """
            )
            infos = [dict(r) async for r in r2]
            return {"overlapping_processes": procs, "overlapping_info_objects": infos}

    async def get_gaps(self) -> dict[str, Any]:
        async with self._driver.session() as s:
            r1 = await s.run(
                """
                MATCH (p:EANode {type:'Process', archived:false})
                WHERE NOT ()-[:EA_REL {type:'SUPPORTS'}]->(p)
                RETURN p.id AS id, p.name AS name, p.external_source AS external_source
                """
            )
            unsupported = [dict(r) async for r in r1]

            r2 = await s.run(
                """
                MATCH (io:EANode {type:'InformationObject', archived:false})
                WHERE NOT ()-[:EA_REL {type:'REALIZES'}]->(io)
                RETURN io.id AS id, io.name AS name
                """
            )
            unrealized = [dict(r) async for r in r2]

            r3 = await s.run(
                """
                MATCH (a:EANode {type:'Application', archived:false})
                WHERE NOT (a)-[:EA_REL {type:'SUPPORTS'}]->()
                RETURN a.id AS id, a.name AS name, a.external_source AS external_source
                """
            )
            orphaned = [dict(r) async for r in r3]
            return {
                "unsupported_processes": unsupported,
                "unrealized_info_objects": unrealized,
                "orphaned_applications": orphaned,
            }

    async def search_nodes(self, query: str, limit: int = 20) -> list[NodeRead]:
        async with self._driver.session() as s:
            pattern = f"(?i).*{query}.*"
            result = await s.run(
                "MATCH (n:EANode) WHERE n.archived = false "
                "AND (n.name =~ $pat OR n.description =~ $pat) "
                "RETURN properties(n) AS p LIMIT $limit",
                pat=pattern, limit=limit,
            )
            return [_record_to_node_read(r["p"]) async for r in result]
