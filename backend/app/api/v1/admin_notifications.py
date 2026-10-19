"""Admin inbox: pending comments, help requests, change proposals …"""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel
from sqlalchemy import select

from app import modules
from app.access import load_policy
from app.api.v1.calendar import list_pending_events
from app.api.v1.comments import subject_enabled
from app.api.v1.change_proposals import list_pending_proposals
from app.auth import CurrentUser
from app.dal.postgres_repository import PostgresRepository
from app.dependencies import get_repository, require_editor
from app.models.comment import CommentORM
from app.models.glossary_request import GlossaryRequestORM
from app.models.node import NodeORM
from app.models.node_deletion_log import NodeDeletionLogORM
from app.models.solution_sketch import SolutionSketchORM
from app.models.survey import SurveyORM
from app.models.survey_response import SurveyResponseORM
from app.schemas.calendar_event import CalendarEventRead
from app.schemas.change_proposal import ChangeProposalRead
from app.schemas.comment import CommentRead
from app.schemas.glossary import GlossaryRequestRead

router = APIRouter(prefix="/admin/notifications", tags=["admin-notifications"])


class HelpRequestEntry(BaseModel):
    sketch_id: UUID
    sketch_title: str
    sketch_status: str
    created_by: str | None
    updated_at: datetime
    fields: list[str]


class NodeDeletionEntry(BaseModel):
    id: UUID
    node_id: str
    node_name: str
    node_type: str
    reason: str
    deleted_by: str
    deleted_at: datetime


class SurveyResponsePendingEntry(BaseModel):
    survey_id: UUID
    survey_title: str
    response_id: UUID
    node_name: str
    submitted_by: str | None
    submitted_at: datetime


class NotificationsResponse(BaseModel):
    pending_comments: list[CommentRead]
    help_requests: list[HelpRequestEntry]
    glossary_requests: list[GlossaryRequestRead]
    node_deletions: list[NodeDeletionEntry]
    surveys_pending_review: list[SurveyResponsePendingEntry]
    change_proposals: list[ChangeProposalRead]
    calendar_proposals: list[CalendarEventRead]


def _get_pg_repo() -> PostgresRepository:
    repo = get_repository()
    if not isinstance(repo, PostgresRepository):
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Notifications require PostgreSQL backend",
        )
    return repo


@router.delete(
    "/node-deletions/{entry_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def dismiss_node_deletion(
    entry_id: UUID,
    _admin: CurrentUser = Depends(require_editor),
) -> Response:
    """Remove one deletion notice from the inbox.

    The other four inbox sections carry a status the reviewer can move
    (pending -> handled); this one is a plain log, so nothing could ever clear
    it and the counter was stuck on "1 open item to handle" for good. Removing
    the row is therefore the only way to acknowledge it.

    This does NOT touch the audit trail: ``repo.delete_node`` writes its own
    DELETE entry to ``ea_audit_log`` with a full snapshot of the node, and that
    is the record kept for good. ``ea_node_deletion_logs`` exists to notify,
    not to archive.
    """
    repo = _get_pg_repo()
    async with repo._session_factory() as s:
        row = await s.get(NodeDeletionLogORM, entry_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Deletion notice not found")
        await s.delete(row)
        await s.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("", response_model=NotificationsResponse)
async def get_admin_notifications(
    user: CurrentUser = Depends(require_editor),
) -> NotificationsResponse:
    repo = _get_pg_repo()
    policy = await load_policy(user)
    async with repo._session_factory() as s:
        comment_rows = (
            await s.execute(
                select(CommentORM)
                .where(CommentORM.status == "pending")
                .order_by(CommentORM.created_at.desc())
            )
        ).scalars().all()
        sketch_rows = (
            await s.execute(
                select(SolutionSketchORM).order_by(SolutionSketchORM.updated_at.desc())
            )
        ).scalars().all()
        glossary_request_rows = (
            await s.execute(
                select(GlossaryRequestORM)
                .where(GlossaryRequestORM.status == "pending")
                .order_by(GlossaryRequestORM.created_at.asc())
            )
        ).scalars().all()
        deletion_rows = (
            await s.execute(
                select(NodeDeletionLogORM)
                .order_by(NodeDeletionLogORM.deleted_at.desc())
                .limit(50)
            )
        ).scalars().all()
        survey_response_rows = (
            await s.execute(
                select(SurveyResponseORM, SurveyORM, NodeORM)
                .join(SurveyORM, SurveyResponseORM.survey_id == SurveyORM.id)
                .join(NodeORM, SurveyResponseORM.node_id == NodeORM.id)
                .where(SurveyResponseORM.status == "submitted")
                .order_by(SurveyResponseORM.submitted_at.asc())
            )
        ).all()

    help_requests: list[HelpRequestEntry] = []
    for sk in sketch_rows:
        flagged = (sk.answers or {}).get("help_requests") or []
        if flagged:
            help_requests.append(
                HelpRequestEntry(
                    sketch_id=sk.id,
                    sketch_title=sk.title,
                    sketch_status=sk.status,
                    created_by=sk.created_by,
                    updated_at=sk.updated_at,
                    fields=list(flagged),
                )
            )

    # What belongs to a switched-off module is not anyone's to handle now.
    if not modules.enabled("glossary"):
        glossary_request_rows = []
    if not modules.enabled("surveys"):
        survey_response_rows = []

    return NotificationsResponse(
        pending_comments=[CommentRead.model_validate(c) for c in comment_rows if subject_enabled(c.subject_type)],
        help_requests=help_requests,
        glossary_requests=[GlossaryRequestRead.model_validate(r) for r in glossary_request_rows],
        node_deletions=[
            NodeDeletionEntry(
                id=r.id,
                node_id=r.node_id,
                node_name=r.node_name,
                node_type=r.node_type,
                reason=r.reason,
                deleted_by=r.deleted_by,
                deleted_at=r.deleted_at,
            )
            for r in deletion_rows
            if policy.can_see(r.node_id, r.node_type)
        ],
        surveys_pending_review=[
            SurveyResponsePendingEntry(
                survey_id=survey.id,
                survey_title=survey.title,
                response_id=response.id,
                node_name=node.name,
                submitted_by=response.submitted_by,
                submitted_at=response.submitted_at,
            )
            for response, survey, node in survey_response_rows
            if policy.can_see(node.id, node.type)
        ],
        change_proposals=[p for p in await list_pending_proposals(repo) if policy.can_see(p.node_id, p.node_type)],
        calendar_proposals=await list_pending_events(repo, policy) if modules.enabled("calendar") else [],
    )
