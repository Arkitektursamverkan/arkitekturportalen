"""Comments on principles, the governance documents and glossary terms.

A comment belongs to the module of what it is about (SUBJECT_MODULE); while
that module is off its comments answer 404 like the rest of the module."""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from app import modules
from app.auth import CurrentUser
from app.dal.postgres_repository import PostgresRepository
from app.dependencies import get_repository, require_editor, require_user
from app.schemas.comment import (
    CommentCreate,
    CommentRead,
    CommentReview,
    CommentSubjectType,
)

router = APIRouter(prefix="/comments", tags=["comments"])

SUBJECT_MODULE: dict[str, str] = {
    "principle": "governance",
    "target_architecture": "governance",
    "nulaagesanalys": "governance",
    "gap_analys": "governance",
    "glossary_term": "glossary",
}


def subject_enabled(subject_type: str) -> bool:
    key = SUBJECT_MODULE.get(subject_type)
    return key is None or modules.enabled(key)


def _require_subject(subject_type: str) -> None:
    if not subject_enabled(subject_type):
        raise HTTPException(status_code=404, detail="Modulen är inte aktiverad")


def _get_pg_repo() -> PostgresRepository:
    repo = get_repository()
    if not isinstance(repo, PostgresRepository):
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Comments require PostgreSQL backend",
        )
    return repo


def _identity(u: CurrentUser) -> str | None:
    return u.email or u.name or None


@router.get("", response_model=list[CommentRead])
async def list_comments(
    subject_type: CommentSubjectType = Query(...),
    subject_id: str | None = Query(None),
    user: CurrentUser = Depends(require_user),
) -> list[CommentRead]:
    """Return comments for a subject. Public/non-admin callers see only
    approved comments plus their own pending. Admins see everything."""
    _require_subject(subject_type)
    repo = _get_pg_repo()
    is_admin = user.role in ("admin", "system")
    rows = await repo.list_comments(
        subject_type=subject_type,
        subject_id=subject_id,
        statuses=None if is_admin else None,  # filter in-memory below
    )
    if not is_admin:
        actor = _identity(user)
        rows = [r for r in rows if r.status == "approved" or (r.status == "pending" and r.created_by == actor)]
    return [CommentRead.model_validate(r) for r in rows]


@router.post("", response_model=CommentRead, status_code=status.HTTP_201_CREATED)
async def create_comment(
    data: CommentCreate,
    user: CurrentUser = Depends(require_user),
) -> CommentRead:
    _require_subject(data.subject_type)
    repo = _get_pg_repo()
    row = await repo.create_comment(
        subject_type=data.subject_type,
        subject_id=data.subject_id,
        body=data.body,
        created_by=_identity(user),
    )
    return CommentRead.model_validate(row)


@router.patch("/{comment_id}/review", response_model=CommentRead)
async def review_comment(
    comment_id: UUID,
    data: CommentReview,
    admin: CurrentUser = Depends(require_editor),
) -> CommentRead:
    """Admin approves or rejects a comment, optionally adding a reply.
    Reviewing also stamps reviewed_at + reviewed_by, doubling as a 'read'
    signal."""
    repo = _get_pg_repo()
    existing = await repo.get_comment(comment_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="Comment not found")
    _require_subject(existing.subject_type)
    row = await repo.review_comment(
        comment_id,
        status=data.status,
        reply=data.reply,
        reviewed_by=_identity(admin),
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Comment not found")
    return CommentRead.model_validate(row)


@router.delete("/{comment_id}")
async def delete_comment(
    comment_id: UUID,
    user: CurrentUser = Depends(require_user),
) -> Response:
    """Authors can delete their own pending comments; admins can delete any."""
    repo = _get_pg_repo()
    row = await repo.get_comment(comment_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Comment not found")
    _require_subject(row.subject_type)
    is_admin = user.role in ("admin", "system")
    if not is_admin:
        if row.created_by != _identity(user) or row.status != "pending":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Endast författaren kan ta bort sin egen kommentar (innan den granskats)",
            )
    await repo.delete_comment(comment_id)
    return Response(status_code=204)
