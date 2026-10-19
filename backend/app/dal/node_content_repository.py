"""Data access for documents and notes attached to architecture objects.

Kept apart from PostgresRepository the same way Samarbete is: the feature owns
its tables and touches the graph only through the node id. PostgresRepository
exposes it as `repo.node_content`. Access decisions are the API layer's.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import and_, false, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.audit import AuditLogORM
from app.models.node_content import NodeDocumentORM, NodeDocumentVersionORM, NodeNoteORM

# Columns of ea_node_document_versions except the payload — listings must
# never pull file bytes into memory.
_VERSION_META_COLUMNS = (
    NodeDocumentVersionORM.id,
    NodeDocumentVersionORM.document_id,
    NodeDocumentVersionORM.version_no,
    NodeDocumentVersionORM.filename,
    NodeDocumentVersionORM.content_type,
    NodeDocumentVersionORM.size_bytes,
    NodeDocumentVersionORM.comment,
    NodeDocumentVersionORM.uploaded_at,
    NodeDocumentVersionORM.uploaded_by,
)


def _audit(
    s: AsyncSession,
    action: str,
    doc: NodeDocumentORM,
    node_name: str,
    node_type: str,
    user_name: str | None,
    note: str | None = None,
) -> None:
    """Document events in the audit log. No snapshot: a removed file isn't
    restorable from the log, so the entry must not offer to restore it."""
    s.add(AuditLogORM(
        id=uuid.uuid4(),
        action=action,
        entity_type="document",
        entity_id=doc.id,
        entity_name=f"{doc.title} ({node_name})",
        entity_subtype=node_type,
        user_name=user_name,
        change_note=note,
    ))


class NodeContentRepository:
    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory

    # ── Documents ───────────────────────────────────────────────────────────

    async def list_documents(
        self, node_id: UUID
    ) -> list[tuple[NodeDocumentORM, dict[str, Any] | None, int]]:
        """(document, newest version's metadata, version count) for every
        document on the node, titles in order."""
        async with self._session_factory() as s:
            docs = (await s.execute(
                select(NodeDocumentORM)
                .where(NodeDocumentORM.node_id == node_id)
                .order_by(func.lower(NodeDocumentORM.title))
            )).scalars().all()
            if not docs:
                return []
            versions = (await s.execute(
                select(*_VERSION_META_COLUMNS)
                .where(NodeDocumentVersionORM.document_id.in_([d.id for d in docs]))
                .order_by(NodeDocumentVersionORM.version_no)
            )).mappings().all()
            latest: dict[UUID, dict[str, Any]] = {}
            counts: dict[UUID, int] = {}
            for v in versions:
                latest[v["document_id"]] = dict(v)
                counts[v["document_id"]] = counts.get(v["document_id"], 0) + 1
            return [(d, latest.get(d.id), counts.get(d.id, 0)) for d in docs]

    async def get_document(self, document_id: UUID) -> NodeDocumentORM | None:
        async with self._session_factory() as s:
            return await s.get(NodeDocumentORM, document_id)

    async def create_document(
        self,
        node_id: UUID,
        *,
        kind: str,
        fields: dict[str, Any],
        file: dict[str, Any] | None,
        actor: str | None,
        node_name: str,
        node_type: str,
    ) -> NodeDocumentORM:
        async with self._session_factory() as s:
            doc = NodeDocumentORM(
                id=uuid.uuid4(), node_id=node_id, kind=kind,
                created_by=actor, updated_by=actor, **fields,
            )
            s.add(doc)
            await s.flush()
            if file is not None:
                s.add(NodeDocumentVersionORM(
                    id=uuid.uuid4(), document_id=doc.id, version_no=1, uploaded_by=actor, **file,
                ))
            _audit(s, "CREATE", doc, node_name, node_type, actor,
                   file["filename"] if file else doc.url)
            await s.commit()
            await s.refresh(doc)
            return doc

    async def add_version(
        self,
        doc: NodeDocumentORM,
        *,
        file: dict[str, Any],
        actor: str | None,
        node_name: str,
        node_type: str,
    ) -> None:
        async with self._session_factory() as s:
            row = await s.get(NodeDocumentORM, doc.id, with_for_update=True)
            if row is None:
                return
            last = (await s.execute(
                select(func.max(NodeDocumentVersionORM.version_no))
                .where(NodeDocumentVersionORM.document_id == doc.id)
            )).scalar() or 0
            s.add(NodeDocumentVersionORM(
                id=uuid.uuid4(), document_id=doc.id, version_no=last + 1, uploaded_by=actor, **file,
            ))
            row.updated_by = actor
            row.updated_at = datetime.now(timezone.utc)
            _audit(s, "UPDATE", row, node_name, node_type, actor,
                   f"Version {last + 1}: {file['filename']}")
            await s.commit()

    async def list_versions(self, document_id: UUID) -> list[dict[str, Any]]:
        async with self._session_factory() as s:
            rows = (await s.execute(
                select(*_VERSION_META_COLUMNS)
                .where(NodeDocumentVersionORM.document_id == document_id)
                .order_by(NodeDocumentVersionORM.version_no.desc())
            )).mappings().all()
            return [dict(r) for r in rows]

    async def get_version_with_data(
        self, document_id: UUID, version_no: int | None
    ) -> NodeDocumentVersionORM | None:
        """The given version, or the newest when none is given."""
        async with self._session_factory() as s:
            q = select(NodeDocumentVersionORM).where(NodeDocumentVersionORM.document_id == document_id)
            if version_no is not None:
                q = q.where(NodeDocumentVersionORM.version_no == version_no)
            q = q.order_by(NodeDocumentVersionORM.version_no.desc()).limit(1)
            return (await s.execute(q)).scalars().first()

    async def update_document(
        self, document_id: UUID, fields: dict[str, Any], actor: str | None
    ) -> NodeDocumentORM | None:
        async with self._session_factory() as s:
            row = await s.get(NodeDocumentORM, document_id)
            if row is None:
                return None
            for k, v in fields.items():
                setattr(row, k, v)
            row.updated_by = actor
            await s.commit()
            await s.refresh(row)
            return row

    async def delete_document(
        self, doc: NodeDocumentORM, *, actor: str | None, node_name: str, node_type: str
    ) -> None:
        async with self._session_factory() as s:
            row = await s.get(NodeDocumentORM, doc.id)
            if row is None:
                return
            _audit(s, "DELETE", row, node_name, node_type, actor)
            await s.delete(row)
            await s.commit()

    async def log_download(
        self, doc: NodeDocumentORM, version_no: int, *, actor: str | None, node_name: str, node_type: str
    ) -> None:
        async with self._session_factory() as s:
            _audit(s, "DOWNLOAD", doc, node_name, node_type, actor, f"Version {version_no}")
            await s.commit()

    # ── Notes ───────────────────────────────────────────────────────────────

    async def list_notes(self, node_id: UUID, user_id: UUID | None) -> list[NodeNoteORM]:
        """Shared notes plus the user's own private ones; pinned first, then newest."""
        mine = NodeNoteORM.author_user_id == user_id if user_id else false()
        async with self._session_factory() as s:
            rows = (await s.execute(
                select(NodeNoteORM)
                .where(
                    NodeNoteORM.node_id == node_id,
                    or_(NodeNoteORM.visibility == "shared", and_(NodeNoteORM.visibility == "private", mine)),
                )
                .order_by(NodeNoteORM.pinned.desc(), NodeNoteORM.created_at.desc())
            )).scalars().all()
            return list(rows)

    async def get_note(self, note_id: UUID) -> NodeNoteORM | None:
        async with self._session_factory() as s:
            return await s.get(NodeNoteORM, note_id)

    async def create_note(
        self,
        node_id: UUID,
        *,
        body: str,
        visibility: str,
        pinned: bool,
        author_user_id: UUID | None,
        author_name: str | None,
    ) -> NodeNoteORM:
        async with self._session_factory() as s:
            row = NodeNoteORM(
                id=uuid.uuid4(), node_id=node_id, body=body, visibility=visibility, pinned=pinned,
                author_user_id=author_user_id, author_name=author_name,
            )
            s.add(row)
            await s.commit()
            await s.refresh(row)
            return row

    async def update_note(self, note_id: UUID, fields: dict[str, Any]) -> NodeNoteORM | None:
        async with self._session_factory() as s:
            row = await s.get(NodeNoteORM, note_id)
            if row is None:
                return None
            if "body" in fields and fields["body"] != row.body:
                row.edited_at = datetime.now(timezone.utc)
            for k, v in fields.items():
                setattr(row, k, v)
            await s.commit()
            await s.refresh(row)
            return row

    async def delete_note(self, note_id: UUID) -> None:
        async with self._session_factory() as s:
            row = await s.get(NodeNoteORM, note_id)
            if row is not None:
                await s.delete(row)
                await s.commit()

    # ── Summary ─────────────────────────────────────────────────────────────

    async def summary(self, node_id: UUID) -> tuple[int, int]:
        async with self._session_factory() as s:
            docs = (await s.execute(
                select(func.count()).select_from(NodeDocumentORM).where(NodeDocumentORM.node_id == node_id)
            )).scalar() or 0
            notes = (await s.execute(
                select(func.count()).select_from(NodeNoteORM).where(NodeNoteORM.node_id == node_id)
            )).scalar() or 0
            return docs, notes
