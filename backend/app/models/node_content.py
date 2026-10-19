"""ORM models for the Dokument and Anteckningar tabs on architecture objects.

A document is either an uploaded file or a link (e.g. to SharePoint, where
most governed documents already live). An uploaded document keeps every file
it has held as a numbered version — replacing the file adds a version, it
never overwrites one. Files are stored in the database (bytea), like
Samarbete's, so they follow the pg_dump-based backup.

A note is one dated entry in an object's log. It is either shared (readable
by everyone who may read the object's notes) or private (its author only).

Both hang off ea_nodes with ON DELETE CASCADE, the same as flags and change
proposals: deleting an object deletes what was attached to it. Who may do
what is decided in app/authz.py.
"""
from __future__ import annotations

from datetime import date, datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class NodeDocumentORM(Base):
    __tablename__ = "ea_node_documents"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    node_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("ea_nodes.id", ondelete="CASCADE"), nullable=False
    )
    # file: the content is in ea_node_document_versions. link: `url` points elsewhere.
    kind: Mapped[str] = mapped_column(String(10), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    # Rutin, Instruktion, Avtal, Beslut, Utredning, Övrigt — see schemas.
    doc_type: Mapped[str] = mapped_column(String(30), nullable=False, server_default="ovrigt")
    description: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    # intern: everyone who may read the object's documents.
    # begransad: only those who may also read restricted documents.
    classification: Mapped[str] = mapped_column(String(20), nullable=False, server_default="intern")
    url: Mapped[str | None] = mapped_column(Text, nullable=True)
    review_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    created_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    updated_by: Mapped[str | None] = mapped_column(String(255), nullable=True)

    __table_args__ = (Index("ix_ea_node_documents_node", "node_id"),)


class NodeDocumentVersionORM(Base):
    """One file a document has held. `data` is never selected by listings."""

    __tablename__ = "ea_node_document_versions"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    document_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("ea_node_documents.id", ondelete="CASCADE"), nullable=False
    )
    version_no: Mapped[int] = mapped_column(Integer, nullable=False)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(
        String(150), nullable=False, server_default="application/octet-stream"
    )
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    comment: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    data: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    uploaded_by: Mapped[str | None] = mapped_column(String(255), nullable=True)

    __table_args__ = (
        UniqueConstraint("document_id", "version_no", name="uq_node_document_version"),
        Index("ix_ea_node_document_versions_doc", "document_id"),
    )


class NodeNoteORM(Base):
    __tablename__ = "ea_node_notes"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    node_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("ea_nodes.id", ondelete="CASCADE"), nullable=False
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    # shared | private
    visibility: Mapped[str] = mapped_column(String(10), nullable=False, server_default="shared")
    pinned: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    # The author is who may see a private note. The API-key system user has
    # no row in ea_users, so the id may be missing; the name stays for display.
    author_user_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("ea_users.id", ondelete="SET NULL"), nullable=True
    )
    author_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("ix_ea_node_notes_node", "node_id", "created_at"),
        Index("ix_ea_node_notes_author", "author_user_id"),
    )
