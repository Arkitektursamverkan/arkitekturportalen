"""Samarbete — uppdrag and arbetsgrupper, with member-controlled access.

Access is decided per workspace, not by the global role: a member's role
inside the uppdrag (owner/member/reader) is what grants read and write. Two
things sit outside that — admins get owner rights everywhere, and a workspace
whose visibility is `internal` is readable by any signed-in user.

A private workspace answers 404 (not 403) to non-members, so its existence
isn't leaked.
"""
from __future__ import annotations

import os
from typing import cast
from urllib.parse import quote
from uuid import UUID

import structlog
from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Response,
    UploadFile,
    status,
)

from app.api.v1.node_content import ALLOWED_TYPES
from app.auth import CurrentUser
from app.dal.postgres_repository import PostgresRepository
from app.dependencies import get_repository, require_editor, require_user
from app.schemas.workspace import (
    DirectoryUser,
    EffectiveRole,
    EventCreate,
    EventRead,
    EventUpdate,
    FileRead,
    LinkCreate,
    MeetingCreate,
    MeetingRead,
    MeetingSummary,
    MeetingUpdate,
    MemberAdd,
    MemberRead,
    MemberRole,
    MemberUpdate,
    PageCreate,
    PageRead,
    PageSummary,
    PageUpdate,
    PostCreate,
    PostRead,
    PostUpdate,
    TaskCreate,
    TaskRead,
    TaskUpdate,
    WorkspaceCreate,
    WorkspaceKind,
    WorkspaceRead,
    WorkspaceSummary,
    WorkspaceUpdate,
)

log = structlog.get_logger(__name__)

router = APIRouter(prefix="/workspaces", tags=["workspaces"])

# Files live in the database (bytea), so keep them small enough to stay inside
# a pg_dump-based backup without pain.
MAX_UPLOAD_BYTES = 25 * 1024 * 1024


def _get_pg_repo() -> PostgresRepository:
    repo = get_repository()
    if not isinstance(repo, PostgresRepository):
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="IT-arkitekturuppdrag kräver PostgreSQL-backend",
        )
    return repo


def _user_uuid(user: CurrentUser) -> UUID | None:
    """The API-key service user has no row in ea_users, hence no membership."""
    try:
        return UUID(user.id)
    except (TypeError, ValueError):
        return None


def _is_admin(user: CurrentUser) -> bool:
    return user.role in ("admin", "system")


def _actor(user: CurrentUser) -> str | None:
    return user.email or user.name or None


class Access:
    """Resolved access to one workspace."""

    def __init__(self, workspace, role: str, is_member: bool) -> None:  # type: ignore[no-untyped-def]
        self.ws = workspace
        self.role = role
        self.is_member = is_member

    @property
    def can_write(self) -> bool:
        # An archived uppdrag is read-only; its owners can still reopen it
        # through the workspace settings, which go through require_owner.
        return self.role in ("owner", "member") and self.ws.status == "active"

    @property
    def is_owner(self) -> bool:
        return self.role == "owner"


async def _resolve_access(workspace_id: UUID, user: CurrentUser) -> Access:
    repo = _get_pg_repo()
    ws = await repo.workspaces.get_workspace(workspace_id)
    if ws is None:
        raise HTTPException(status_code=404, detail="Uppdraget finns inte")

    uid = _user_uuid(user)
    membership = await repo.workspaces.get_membership(workspace_id, uid) if uid else None
    # Admins keep owner rights even when their membership row says otherwise.
    if _is_admin(user):
        return Access(ws, "owner", membership is not None)
    if membership is not None:
        return Access(ws, membership.role, True)
    if ws.visibility == "internal":
        return Access(ws, "reader", False)
    raise HTTPException(status_code=404, detail="Uppdraget finns inte")


async def _require_write(workspace_id: UUID, user: CurrentUser) -> Access:
    access = await _resolve_access(workspace_id, user)
    if not access.can_write:
        detail = (
            "Uppdraget är arkiverat"
            if access.ws.status != "active"
            else "Du har inte skrivbehörighet i uppdraget"
        )
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)
    return access


async def _require_owner(workspace_id: UUID, user: CurrentUser) -> Access:
    access = await _resolve_access(workspace_id, user)
    if not access.is_owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Endast uppdragsägare kan göra detta",
        )
    return access


def _summary(ws, role: str, is_member: bool, member_count: int) -> WorkspaceSummary:  # type: ignore[no-untyped-def]
    return WorkspaceSummary(
        id=ws.id,
        name=ws.name,
        description=ws.description,
        kind=ws.kind,
        status=ws.status,
        visibility=ws.visibility,
        my_role=cast(EffectiveRole, role),
        is_member=is_member,
        member_count=member_count,
        created_at=ws.created_at,
        created_by=ws.created_by,
        updated_at=ws.updated_at,
        updated_by=ws.updated_by,
    )


# ── Workspaces ──────────────────────────────────────────────────────────────

@router.get("", response_model=list[WorkspaceSummary])
async def list_workspaces(
    include_archived: bool = Query(True),
    kind: WorkspaceKind | None = Query(None, description="uppdrag eller arbetsgrupp"),
    user: CurrentUser = Depends(require_user),
) -> list[WorkspaceSummary]:
    repo = _get_pg_repo()
    admin = _is_admin(user)
    rows = await repo.workspaces.list_workspaces(
        user_id=_user_uuid(user),
        is_admin=admin,
        include_archived=include_archived,
        kind=kind,
    )
    out: list[WorkspaceSummary] = []
    for ws, member_role, count in rows:
        role = "owner" if admin else (member_role or "reader")
        out.append(_summary(ws, role, member_role is not None, count))
    return out


@router.post("", response_model=WorkspaceRead, status_code=status.HTTP_201_CREATED)
async def create_workspace(
    data: WorkspaceCreate,
    user: CurrentUser = Depends(require_editor),
) -> WorkspaceRead:
    repo = _get_pg_repo()
    ws = await repo.workspaces.create_workspace(
        name=data.name,
        description=data.description,
        visibility=data.visibility,
        kind=data.kind,
        owner_user_id=_user_uuid(user),
        member_ids=data.member_ids,
        created_by=_actor(user),
    )
    log.info("workspace.created", workspace_id=str(ws.id), by=_actor(user))
    return await _read_model(ws, "owner", _user_uuid(user) is not None)


async def _read_model(ws, role: str, is_member: bool) -> WorkspaceRead:  # type: ignore[no-untyped-def]
    repo = _get_pg_repo()
    members = [
        MemberRead(
            user_id=u.id,
            name=u.name,
            email=u.email,
            role=cast(MemberRole, m.role),
            added_at=m.added_at,
            added_by=m.added_by,
        )
        for m, u in await repo.workspaces.list_members(ws.id)
    ]
    base = _summary(ws, role, is_member, len(members))
    return WorkspaceRead(**base.model_dump(), members=members)


@router.get("/directory", response_model=list[DirectoryUser])
async def list_directory(user: CurrentUser = Depends(require_user)) -> list[DirectoryUser]:
    """Users that can be added as members. Open to anyone who owns an uppdrag
    (they need it to manage their own member list) and to editors/admins."""
    repo = _get_pg_repo()
    uid = _user_uuid(user)
    allowed = user.role in ("admin", "superuser", "system") or (
        uid is not None and await repo.workspaces.owns_any_workspace(uid)
    )
    if not allowed:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Saknar behörighet")
    return [
        DirectoryUser(id=u.id, name=u.name, email=u.email)
        for u in await repo.workspaces.list_directory_users()
    ]


@router.get("/{workspace_id}", response_model=WorkspaceRead)
async def get_workspace(
    workspace_id: UUID,
    user: CurrentUser = Depends(require_user),
) -> WorkspaceRead:
    access = await _resolve_access(workspace_id, user)
    return await _read_model(access.ws, access.role, access.is_member)


@router.patch("/{workspace_id}", response_model=WorkspaceRead)
async def update_workspace(
    workspace_id: UUID,
    data: WorkspaceUpdate,
    user: CurrentUser = Depends(require_user),
) -> WorkspaceRead:
    access = await _require_owner(workspace_id, user)
    repo = _get_pg_repo()
    ws = await repo.workspaces.update_workspace(
        workspace_id,
        name=data.name,
        description=data.description,
        status=data.status,
        visibility=data.visibility,
        updated_by=_actor(user),
    )
    if ws is None:
        raise HTTPException(status_code=404, detail="Uppdraget finns inte")
    return await _read_model(ws, access.role, access.is_member)


@router.delete("/{workspace_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workspace(
    workspace_id: UUID,
    user: CurrentUser = Depends(require_user),
) -> Response:
    await _require_owner(workspace_id, user)
    repo = _get_pg_repo()
    if not await repo.workspaces.delete_workspace(workspace_id):
        raise HTTPException(status_code=404, detail="Uppdraget finns inte")
    log.info("workspace.deleted", workspace_id=str(workspace_id), by=_actor(user))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── Members ─────────────────────────────────────────────────────────────────

@router.get("/{workspace_id}/members", response_model=list[MemberRead])
async def list_members(
    workspace_id: UUID,
    user: CurrentUser = Depends(require_user),
) -> list[MemberRead]:
    await _resolve_access(workspace_id, user)
    repo = _get_pg_repo()
    return [
        MemberRead(
            user_id=u.id,
            name=u.name,
            email=u.email,
            role=cast(MemberRole, m.role),
            added_at=m.added_at,
            added_by=m.added_by,
        )
        for m, u in await repo.workspaces.list_members(workspace_id)
    ]


@router.post("/{workspace_id}/members", response_model=list[MemberRead], status_code=status.HTTP_201_CREATED)
async def add_member(
    workspace_id: UUID,
    data: MemberAdd,
    user: CurrentUser = Depends(require_user),
) -> list[MemberRead]:
    await _require_owner(workspace_id, user)
    repo = _get_pg_repo()
    row = await repo.workspaces.add_member(
        workspace_id, user_id=data.user_id, role=data.role, added_by=_actor(user)
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Användaren finns inte")
    return await list_members(workspace_id, user)


@router.patch("/{workspace_id}/members/{member_user_id}", response_model=list[MemberRead])
async def update_member(
    workspace_id: UUID,
    member_user_id: UUID,
    data: MemberUpdate,
    user: CurrentUser = Depends(require_user),
) -> list[MemberRead]:
    await _require_owner(workspace_id, user)
    repo = _get_pg_repo()
    current = await repo.workspaces.get_membership(workspace_id, member_user_id)
    if current is None:
        raise HTTPException(status_code=404, detail="Medlemmen finns inte i uppdraget")
    if (
        current.role == "owner"
        and data.role != "owner"
        and await repo.workspaces.count_owners(workspace_id) <= 1
    ):
        raise HTTPException(status_code=400, detail="Uppdraget måste ha minst en ägare")
    await repo.workspaces.set_member_role(workspace_id, member_user_id, data.role)
    return await list_members(workspace_id, user)


@router.delete("/{workspace_id}/members/{member_user_id}", response_model=list[MemberRead])
async def remove_member(
    workspace_id: UUID,
    member_user_id: UUID,
    user: CurrentUser = Depends(require_user),
) -> list[MemberRead]:
    await _require_owner(workspace_id, user)
    repo = _get_pg_repo()
    current = await repo.workspaces.get_membership(workspace_id, member_user_id)
    if current is None:
        raise HTTPException(status_code=404, detail="Medlemmen finns inte i uppdraget")
    if current.role == "owner" and await repo.workspaces.count_owners(workspace_id) <= 1:
        raise HTTPException(status_code=400, detail="Uppdraget måste ha minst en ägare")
    await repo.workspaces.remove_member(workspace_id, member_user_id)
    return await list_members(workspace_id, user)


# ── Document pages ──────────────────────────────────────────────────────────

@router.get("/{workspace_id}/pages", response_model=list[PageSummary])
async def list_pages(
    workspace_id: UUID,
    user: CurrentUser = Depends(require_user),
) -> list[PageSummary]:
    await _resolve_access(workspace_id, user)
    repo = _get_pg_repo()
    return [PageSummary.model_validate(p) for p in await repo.workspaces.list_pages(workspace_id)]


@router.post("/{workspace_id}/pages", response_model=PageRead, status_code=status.HTTP_201_CREATED)
async def create_page(
    workspace_id: UUID,
    data: PageCreate,
    user: CurrentUser = Depends(require_user),
) -> PageRead:
    await _require_write(workspace_id, user)
    repo = _get_pg_repo()
    row = await repo.workspaces.create_page(
        workspace_id, title=data.title, body=data.body, created_by=_actor(user)
    )
    return PageRead.model_validate(row)


@router.get("/{workspace_id}/pages/{page_id}", response_model=PageRead)
async def get_page(
    workspace_id: UUID,
    page_id: UUID,
    user: CurrentUser = Depends(require_user),
) -> PageRead:
    await _resolve_access(workspace_id, user)
    repo = _get_pg_repo()
    row = await repo.workspaces.get_page(page_id)
    if row is None or row.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Sidan finns inte")
    return PageRead.model_validate(row)


@router.patch("/{workspace_id}/pages/{page_id}", response_model=PageRead)
async def update_page(
    workspace_id: UUID,
    page_id: UUID,
    data: PageUpdate,
    user: CurrentUser = Depends(require_user),
) -> PageRead:
    await _require_write(workspace_id, user)
    repo = _get_pg_repo()
    existing = await repo.workspaces.get_page(page_id)
    if existing is None or existing.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Sidan finns inte")
    row = await repo.workspaces.update_page(
        page_id,
        title=data.title,
        body=data.body,
        sort_order=data.sort_order,
        updated_by=_actor(user),
    )
    return PageRead.model_validate(row)


@router.delete("/{workspace_id}/pages/{page_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_page(
    workspace_id: UUID,
    page_id: UUID,
    user: CurrentUser = Depends(require_user),
) -> Response:
    await _require_write(workspace_id, user)
    repo = _get_pg_repo()
    existing = await repo.workspaces.get_page(page_id)
    if existing is None or existing.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Sidan finns inte")
    await repo.workspaces.delete_page(page_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── Calendar ────────────────────────────────────────────────────────────────

@router.get("/{workspace_id}/events", response_model=list[EventRead])
async def list_events(
    workspace_id: UUID,
    user: CurrentUser = Depends(require_user),
) -> list[EventRead]:
    await _resolve_access(workspace_id, user)
    repo = _get_pg_repo()
    return [EventRead.model_validate(e) for e in await repo.workspaces.list_events(workspace_id)]


@router.post("/{workspace_id}/events", response_model=EventRead, status_code=status.HTTP_201_CREATED)
async def create_event(
    workspace_id: UUID,
    data: EventCreate,
    user: CurrentUser = Depends(require_user),
) -> EventRead:
    await _require_write(workspace_id, user)
    if data.ends_at is not None and data.ends_at < data.starts_at:
        raise HTTPException(status_code=400, detail="Sluttiden ligger före starttiden")
    repo = _get_pg_repo()
    row = await repo.workspaces.create_event(
        workspace_id,
        title=data.title,
        starts_at=data.starts_at,
        ends_at=data.ends_at,
        all_day=data.all_day,
        location=data.location,
        description=data.description,
        created_by=_actor(user),
    )
    return EventRead.model_validate(row)


@router.patch("/{workspace_id}/events/{event_id}", response_model=EventRead)
async def update_event(
    workspace_id: UUID,
    event_id: UUID,
    data: EventUpdate,
    user: CurrentUser = Depends(require_user),
) -> EventRead:
    await _require_write(workspace_id, user)
    repo = _get_pg_repo()
    existing = await repo.workspaces.get_event(event_id)
    if existing is None or existing.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Kalenderposten finns inte")
    changes = data.model_dump(exclude_unset=True)
    starts_at = changes.get("starts_at", existing.starts_at)
    ends_at = changes.get("ends_at", existing.ends_at)
    if ends_at is not None and ends_at < starts_at:
        raise HTTPException(status_code=400, detail="Sluttiden ligger före starttiden")
    row = await repo.workspaces.update_event(event_id, changes=changes, updated_by=_actor(user))
    return EventRead.model_validate(row)


@router.delete("/{workspace_id}/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event(
    workspace_id: UUID,
    event_id: UUID,
    user: CurrentUser = Depends(require_user),
) -> Response:
    await _require_write(workspace_id, user)
    repo = _get_pg_repo()
    existing = await repo.workspaces.get_event(event_id)
    if existing is None or existing.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Kalenderposten finns inte")
    await repo.workspaces.delete_event(event_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── Meetings ────────────────────────────────────────────────────────────────

@router.get("/{workspace_id}/meetings", response_model=list[MeetingSummary])
async def list_meetings(
    workspace_id: UUID,
    user: CurrentUser = Depends(require_user),
) -> list[MeetingSummary]:
    await _resolve_access(workspace_id, user)
    repo = _get_pg_repo()
    return [
        MeetingSummary.model_validate(m) for m in await repo.workspaces.list_meetings(workspace_id)
    ]


@router.post("/{workspace_id}/meetings", response_model=MeetingRead, status_code=status.HTTP_201_CREATED)
async def create_meeting(
    workspace_id: UUID,
    data: MeetingCreate,
    user: CurrentUser = Depends(require_user),
) -> MeetingRead:
    await _require_write(workspace_id, user)
    repo = _get_pg_repo()
    row = await repo.workspaces.create_meeting(
        workspace_id,
        title=data.title,
        meeting_date=data.meeting_date,
        template=data.template,
        body=data.body,
        created_by=_actor(user),
    )
    return MeetingRead.model_validate(row)


@router.get("/{workspace_id}/meetings/{meeting_id}", response_model=MeetingRead)
async def get_meeting(
    workspace_id: UUID,
    meeting_id: UUID,
    user: CurrentUser = Depends(require_user),
) -> MeetingRead:
    await _resolve_access(workspace_id, user)
    repo = _get_pg_repo()
    row = await repo.workspaces.get_meeting(meeting_id)
    if row is None or row.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Mötesanteckningen finns inte")
    return MeetingRead.model_validate(row)


@router.patch("/{workspace_id}/meetings/{meeting_id}", response_model=MeetingRead)
async def update_meeting(
    workspace_id: UUID,
    meeting_id: UUID,
    data: MeetingUpdate,
    user: CurrentUser = Depends(require_user),
) -> MeetingRead:
    await _require_write(workspace_id, user)
    repo = _get_pg_repo()
    existing = await repo.workspaces.get_meeting(meeting_id)
    if existing is None or existing.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Mötesanteckningen finns inte")
    row = await repo.workspaces.update_meeting(
        meeting_id,
        title=data.title,
        meeting_date=data.meeting_date,
        clear_meeting_date="meeting_date" in data.model_fields_set and data.meeting_date is None,
        body=data.body,
        updated_by=_actor(user),
    )
    return MeetingRead.model_validate(row)


@router.delete("/{workspace_id}/meetings/{meeting_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_meeting(
    workspace_id: UUID,
    meeting_id: UUID,
    user: CurrentUser = Depends(require_user),
) -> Response:
    await _require_write(workspace_id, user)
    repo = _get_pg_repo()
    existing = await repo.workspaces.get_meeting(meeting_id)
    if existing is None or existing.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Mötesanteckningen finns inte")
    await repo.workspaces.delete_meeting(meeting_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── Files ───────────────────────────────────────────────────────────────────

@router.get("/{workspace_id}/files", response_model=list[FileRead])
async def list_files(
    workspace_id: UUID,
    user: CurrentUser = Depends(require_user),
) -> list[FileRead]:
    await _resolve_access(workspace_id, user)
    repo = _get_pg_repo()
    return [FileRead(**dict(m)) for m in await repo.workspaces.list_files(workspace_id)]


@router.post("/{workspace_id}/files", response_model=FileRead, status_code=status.HTTP_201_CREATED)
async def upload_file(
    workspace_id: UUID,
    file: UploadFile = File(...),
    description: str = Form(""),
    user: CurrentUser = Depends(require_user),
) -> FileRead:
    await _require_write(workspace_id, user)

    # Samma vitlista som dokumenten på objekten: vad filen lämnas ut som avgörs
    # här av filändelsen, aldrig av vad webbläsaren påstod vid uppladdningen.
    filename = os.path.basename(file.filename or "").strip()[:255]
    ext = os.path.splitext(filename)[1].lower()
    if not filename or ext not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Filtypen är inte tillåten. Tillåtna: " + ", ".join(sorted(ALLOWED_TYPES)),
        )

    chunks: list[bytes] = []
    total = 0
    while chunk := await file.read(1024 * 1024):
        total += len(chunk)
        if total > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"Filen är för stor (max {MAX_UPLOAD_BYTES // (1024 * 1024)} MB)",
            )
        chunks.append(chunk)
    if total == 0:
        raise HTTPException(status_code=400, detail="Filen är tom")

    repo = _get_pg_repo()
    meta = await repo.workspaces.create_file(
        workspace_id,
        filename=filename,
        content_type=ALLOWED_TYPES[ext],
        description=description,
        data=b"".join(chunks),
        uploaded_by=_actor(user),
    )
    return FileRead(**meta)


@router.post("/{workspace_id}/links", response_model=FileRead, status_code=status.HTTP_201_CREATED)
async def create_link(
    workspace_id: UUID,
    body: LinkCreate,
    user: CurrentUser = Depends(require_user),
) -> FileRead:
    await _require_write(workspace_id, user)
    repo = _get_pg_repo()
    meta = await repo.workspaces.create_file(
        workspace_id,
        filename=body.title.strip(),
        content_type="text/uri-list",
        description=body.description.strip(),
        data=b"",
        uploaded_by=_actor(user),
        url=body.url,
    )
    return FileRead(**meta)


@router.get("/{workspace_id}/files/{file_id}/download")
async def download_file(
    workspace_id: UUID,
    file_id: UUID,
    user: CurrentUser = Depends(require_user),
) -> Response:
    await _resolve_access(workspace_id, user)
    repo = _get_pg_repo()
    row = await repo.workspaces.get_file_with_data(file_id)
    if row is None or row.workspace_id != workspace_id or row.url is not None:
        raise HTTPException(status_code=404, detail="Filen finns inte")
    # RFC 5987 filename* keeps å/ä/ö intact; the plain filename is the fallback.
    ascii_name = row.filename.encode("ascii", "replace").decode("ascii").replace('"', "_")
    # Typen tas från vitlistan, inte från den lagrade: filer som laddades upp
    # före vitlistan kan ha sparats med vad webbläsaren påstod (t.ex. text/html).
    ext = os.path.splitext(row.filename)[1].lower()
    return Response(
        content=row.data,
        media_type=ALLOWED_TYPES.get(ext, "application/octet-stream"),
        headers={
            "Content-Disposition": (
                f'attachment; filename="{ascii_name}"; '
                f"filename*=UTF-8''{quote(row.filename)}"
            ),
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, no-store",
        },
    )


@router.delete("/{workspace_id}/files/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_file(
    workspace_id: UUID,
    file_id: UUID,
    user: CurrentUser = Depends(require_user),
) -> Response:
    await _require_write(workspace_id, user)
    repo = _get_pg_repo()
    meta = await repo.workspaces.get_file_meta(file_id)
    if meta is None or meta["workspace_id"] != workspace_id:
        raise HTTPException(status_code=404, detail="Filen finns inte")
    await repo.workspaces.delete_file(file_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── Discussion ──────────────────────────────────────────────────────────────

@router.get("/{workspace_id}/posts", response_model=list[PostRead])
async def list_posts(
    workspace_id: UUID,
    user: CurrentUser = Depends(require_user),
) -> list[PostRead]:
    await _resolve_access(workspace_id, user)
    repo = _get_pg_repo()
    return [PostRead.model_validate(p) for p in await repo.workspaces.list_posts(workspace_id)]


@router.post("/{workspace_id}/posts", response_model=PostRead, status_code=status.HTTP_201_CREATED)
async def create_post(
    workspace_id: UUID,
    data: PostCreate,
    user: CurrentUser = Depends(require_user),
) -> PostRead:
    await _require_write(workspace_id, user)
    repo = _get_pg_repo()
    if data.parent_id is not None:
        parent = await repo.workspaces.get_post(data.parent_id)
        if parent is None or parent.workspace_id != workspace_id:
            raise HTTPException(status_code=404, detail="Inlägget finns inte")
        if parent.parent_id is not None:
            raise HTTPException(status_code=400, detail="Svar kan inte besvaras i sin tur")
    row = await repo.workspaces.create_post(
        workspace_id,
        body=data.body,
        parent_id=data.parent_id,
        created_by=_actor(user),
        author_name=user.name or None,
    )
    return PostRead.model_validate(row)


def _may_touch_post(post, access: Access, user: CurrentUser) -> bool:  # type: ignore[no-untyped-def]
    """The author edits and deletes their own; owners moderate the board."""
    return access.is_owner or (post.created_by or "") == (_actor(user) or "\0")


@router.patch("/{workspace_id}/posts/{post_id}", response_model=PostRead)
async def update_post(
    workspace_id: UUID,
    post_id: UUID,
    data: PostUpdate,
    user: CurrentUser = Depends(require_user),
) -> PostRead:
    access = await _require_write(workspace_id, user)
    repo = _get_pg_repo()
    row = await repo.workspaces.get_post(post_id)
    if row is None or row.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Inlägget finns inte")
    if not _may_touch_post(row, access, user):
        raise HTTPException(status_code=403, detail="Du kan bara redigera dina egna inlägg")
    updated = await repo.workspaces.update_post(post_id, body=data.body)
    return PostRead.model_validate(updated)


@router.delete("/{workspace_id}/posts/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_post(
    workspace_id: UUID,
    post_id: UUID,
    user: CurrentUser = Depends(require_user),
) -> Response:
    access = await _require_write(workspace_id, user)
    repo = _get_pg_repo()
    row = await repo.workspaces.get_post(post_id)
    if row is None or row.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Inlägget finns inte")
    if not _may_touch_post(row, access, user):
        raise HTTPException(status_code=403, detail="Du kan bara ta bort dina egna inlägg")
    await repo.workspaces.delete_post(post_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── Tasks ───────────────────────────────────────────────────────────────────

def _task_read(task, assignee_name: str | None) -> TaskRead:  # type: ignore[no-untyped-def]
    return TaskRead(
        id=task.id,
        workspace_id=task.workspace_id,
        title=task.title,
        description=task.description,
        status=task.status,
        assignee_user_id=task.assignee_user_id,
        assignee_name=assignee_name,
        due_date=task.due_date,
        sort_order=task.sort_order,
        created_at=task.created_at,
        created_by=task.created_by,
        updated_at=task.updated_at,
        updated_by=task.updated_by,
        completed_at=task.completed_at,
    )


@router.get("/{workspace_id}/tasks", response_model=list[TaskRead])
async def list_tasks(
    workspace_id: UUID,
    user: CurrentUser = Depends(require_user),
) -> list[TaskRead]:
    await _resolve_access(workspace_id, user)
    repo = _get_pg_repo()
    return [_task_read(t, name) for t, name in await repo.workspaces.list_tasks(workspace_id)]


@router.post("/{workspace_id}/tasks", response_model=TaskRead, status_code=status.HTTP_201_CREATED)
async def create_task(
    workspace_id: UUID,
    data: TaskCreate,
    user: CurrentUser = Depends(require_user),
) -> TaskRead:
    await _require_write(workspace_id, user)
    repo = _get_pg_repo()
    row = await repo.workspaces.create_task(
        workspace_id,
        title=data.title,
        description=data.description,
        assignee_user_id=data.assignee_user_id,
        due_date=data.due_date,
        created_by=_actor(user),
    )
    return _task_read(row, await repo.workspaces.assignee_name(row.assignee_user_id))


@router.patch("/{workspace_id}/tasks/{task_id}", response_model=TaskRead)
async def update_task(
    workspace_id: UUID,
    task_id: UUID,
    data: TaskUpdate,
    user: CurrentUser = Depends(require_user),
) -> TaskRead:
    await _require_write(workspace_id, user)
    repo = _get_pg_repo()
    existing = await repo.workspaces.get_task(task_id)
    if existing is None or existing.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Uppgiften finns inte")
    sent = data.model_fields_set
    row = await repo.workspaces.update_task(
        task_id,
        title=data.title,
        description=data.description,
        status=data.status,
        due_date=data.due_date,
        clear_due_date="due_date" in sent and data.due_date is None,
        assignee_user_id=data.assignee_user_id,
        set_assignee="assignee_user_id" in sent,
        sort_order=data.sort_order,
        updated_by=_actor(user),
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Uppgiften finns inte")
    return _task_read(row, await repo.workspaces.assignee_name(row.assignee_user_id))


@router.delete("/{workspace_id}/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    workspace_id: UUID,
    task_id: UUID,
    user: CurrentUser = Depends(require_user),
) -> Response:
    await _require_write(workspace_id, user)
    repo = _get_pg_repo()
    existing = await repo.workspaces.get_task(task_id)
    if existing is None or existing.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Uppgiften finns inte")
    await repo.workspaces.delete_task(task_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
