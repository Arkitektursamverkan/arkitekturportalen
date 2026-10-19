"""ORM model for proposed changes to a node's fields (ea_change_proposals).

Any signed-in user can propose that a field on a domain object should read
differently – e.g. an application's status. The proposal does NOT touch the
node: the value shown stays whatever the underlying list (SharePoint, 2C8 …)
last delivered. The UI draws the current value struck through with the
proposed value above it, until an admin has made the change in the source
list by hand and marks the proposal handled. Then the strike-through goes
away and the node shows what the sync reads in.
"""
from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class ChangeProposalORM(Base):
    __tablename__ = "ea_change_proposals"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    node_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("ea_nodes.id", ondelete="CASCADE"), nullable=False
    )
    # "name", "description" or "attributes.<key>"
    field: Mapped[str] = mapped_column(String(255), nullable=False)
    # The value the proposer saw when proposing – kept for the log. The UI
    # strikes through the node's CURRENT value, not this snapshot.
    old_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    new_value: Mapped[str] = mapped_column(Text, nullable=False)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    proposed_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # CurrentUser.id – lets the proposer withdraw their own proposal.
    proposed_by_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # pending | done | rejected | withdrawn
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    resolved_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolution_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (
        Index("ix_ea_change_proposals_node_id", "node_id"),
        Index("ix_ea_change_proposals_status", "status"),
    )
