"""Data access for Samarbete — uppdrag and arbetsgrupper (workspaces).

Kept in its own module rather than in PostgresRepository: the feature owns
seven tables of its own and touches none of the graph. PostgresRepository exposes it
as `repo.workspaces`.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from typing import Any, cast
from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.engine import CursorResult
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.user import UserORM
from app.models.workspace import (
    WorkspaceEventORM,
    WorkspaceFileORM,
    WorkspaceMeetingORM,
    WorkspaceMemberORM,
    WorkspaceORM,
    WorkspacePageORM,
    WorkspacePostORM,
    WorkspaceTaskORM,
)

# Columns of ea_workspace_files except the payload — listings must never pull
# file bytes into memory.
_FILE_META_COLUMNS = (
    WorkspaceFileORM.id,
    WorkspaceFileORM.workspace_id,
    WorkspaceFileORM.filename,
    WorkspaceFileORM.content_type,
    WorkspaceFileORM.size_bytes,
    WorkspaceFileORM.description,
    WorkspaceFileORM.uploaded_at,
    WorkspaceFileORM.uploaded_by,
    WorkspaceFileORM.url,
)


class WorkspaceRepository:
    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory

    # ── Workspaces ──────────────────────────────────────────────────────────

    async def list_workspaces(
        self,
        *,
        user_id: UUID | None,
        is_admin: bool,
        include_archived: bool = True,
        kind: str | None = None,
    ) -> list[tuple[WorkspaceORM, str | None, int]]:
        """Return (workspace, my_membership_role, member_count) for what the
        user may see: their memberships, plus internal workspaces, plus
        everything when admin. `kind` narrows it to uppdrag or arbetsgrupper."""
        async with self._session_factory() as s:
            counts = dict(
                (
                    await s.execute(
                        select(WorkspaceMemberORM.workspace_id, func.count())
                        .group_by(WorkspaceMemberORM.workspace_id)
                    )
                ).tuples().all()
            )
            my_roles: dict[UUID, str] = {}
            if user_id is not None:
                my_roles = dict(
                    (
                        await s.execute(
                            select(WorkspaceMemberORM.workspace_id, WorkspaceMemberORM.role)
                            .where(WorkspaceMemberORM.user_id == user_id)
                        )
                    ).tuples().all()
                )

            stmt = select(WorkspaceORM).order_by(WorkspaceORM.name)
            if not include_archived:
                stmt = stmt.where(WorkspaceORM.status == "active")
            if kind is not None:
                stmt = stmt.where(WorkspaceORM.kind == kind)
            rows = list((await s.execute(stmt)).scalars().all())

        out: list[tuple[WorkspaceORM, str | None, int]] = []
        for w in rows:
            role = my_roles.get(w.id)
            if not (is_admin or role is not None or w.visibility == "internal"):
                continue
            out.append((w, role, counts.get(w.id, 0)))
        return out

    async def get_workspace(self, workspace_id: UUID) -> WorkspaceORM | None:
        async with self._session_factory() as s:
            return await s.get(WorkspaceORM, workspace_id)

    async def member_count(self, workspace_id: UUID) -> int:
        async with self._session_factory() as s:
            return int(
                (
                    await s.execute(
                        select(func.count())
                        .select_from(WorkspaceMemberORM)
                        .where(WorkspaceMemberORM.workspace_id == workspace_id)
                    )
                ).scalar_one()
            )

    async def get_membership(self, workspace_id: UUID, user_id: UUID) -> WorkspaceMemberORM | None:
        async with self._session_factory() as s:
            return (
                await s.execute(
                    select(WorkspaceMemberORM).where(
                        WorkspaceMemberORM.workspace_id == workspace_id,
                        WorkspaceMemberORM.user_id == user_id,
                    )
                )
            ).scalar_one_or_none()

    async def owns_any_workspace(self, user_id: UUID) -> bool:
        async with self._session_factory() as s:
            return (
                await s.execute(
                    select(WorkspaceMemberORM.id).where(
                        WorkspaceMemberORM.user_id == user_id,
                        WorkspaceMemberORM.role == "owner",
                    ).limit(1)
                )
            ).first() is not None

    async def create_workspace(
        self,
        *,
        name: str,
        description: str,
        visibility: str,
        kind: str = "uppdrag",
        owner_user_id: UUID | None,
        member_ids: list[UUID],
        created_by: str | None,
    ) -> WorkspaceORM:
        async with self._session_factory() as s:
            row = WorkspaceORM(
                id=uuid.uuid4(),
                name=name,
                description=description,
                kind=kind,
                status="active",
                visibility=visibility,
                created_by=created_by,
                updated_by=created_by,
            )
            s.add(row)
            await s.flush()
            seen: set[UUID] = set()
            if owner_user_id is not None:
                seen.add(owner_user_id)
                s.add(
                    WorkspaceMemberORM(
                        id=uuid.uuid4(),
                        workspace_id=row.id,
                        user_id=owner_user_id,
                        role="owner",
                        added_by=created_by,
                    )
                )
            for uid in member_ids:
                if uid in seen:
                    continue
                seen.add(uid)
                s.add(
                    WorkspaceMemberORM(
                        id=uuid.uuid4(),
                        workspace_id=row.id,
                        user_id=uid,
                        role="member",
                        added_by=created_by,
                    )
                )
            await s.commit()
            await s.refresh(row)
            return row

    async def update_workspace(
        self,
        workspace_id: UUID,
        *,
        name: str | None,
        description: str | None,
        status: str | None,
        visibility: str | None,
        updated_by: str | None,
    ) -> WorkspaceORM | None:
        async with self._session_factory() as s:
            row = await s.get(WorkspaceORM, workspace_id)
            if row is None:
                return None
            if name is not None:
                row.name = name
            if description is not None:
                row.description = description
            if status is not None:
                row.status = status
            if visibility is not None:
                row.visibility = visibility
            row.updated_at = datetime.now(timezone.utc)
            row.updated_by = updated_by
            await s.commit()
            await s.refresh(row)
            return row

    async def delete_workspace(self, workspace_id: UUID) -> bool:
        async with self._session_factory() as s:
            row = await s.get(WorkspaceORM, workspace_id)
            if row is None:
                return False
            await s.delete(row)
            await s.commit()
            return True

    # ── Members ─────────────────────────────────────────────────────────────

    async def list_members(self, workspace_id: UUID) -> list[tuple[WorkspaceMemberORM, UserORM]]:
        async with self._session_factory() as s:
            rows = (
                await s.execute(
                    select(WorkspaceMemberORM, UserORM)
                    .join(UserORM, UserORM.id == WorkspaceMemberORM.user_id)
                    .where(WorkspaceMemberORM.workspace_id == workspace_id)
                    .order_by(UserORM.name)
                )
            ).all()
            return [(m, u) for m, u in rows]

    async def add_member(
        self, workspace_id: UUID, *, user_id: UUID, role: str, added_by: str | None
    ) -> WorkspaceMemberORM | None:
        """Add a member, or update the role if they are already one."""
        async with self._session_factory() as s:
            existing = (
                await s.execute(
                    select(WorkspaceMemberORM).where(
                        WorkspaceMemberORM.workspace_id == workspace_id,
                        WorkspaceMemberORM.user_id == user_id,
                    )
                )
            ).scalar_one_or_none()
            if existing is not None:
                existing.role = role
                await s.commit()
                await s.refresh(existing)
                return existing
            if await s.get(UserORM, user_id) is None:
                return None
            row = WorkspaceMemberORM(
                id=uuid.uuid4(),
                workspace_id=workspace_id,
                user_id=user_id,
                role=role,
                added_by=added_by,
            )
            s.add(row)
            await s.commit()
            await s.refresh(row)
            return row

    async def set_member_role(
        self, workspace_id: UUID, user_id: UUID, role: str
    ) -> WorkspaceMemberORM | None:
        async with self._session_factory() as s:
            row = (
                await s.execute(
                    select(WorkspaceMemberORM).where(
                        WorkspaceMemberORM.workspace_id == workspace_id,
                        WorkspaceMemberORM.user_id == user_id,
                    )
                )
            ).scalar_one_or_none()
            if row is None:
                return None
            row.role = role
            await s.commit()
            await s.refresh(row)
            return row

    async def remove_member(self, workspace_id: UUID, user_id: UUID) -> bool:
        async with self._session_factory() as s:
            res = cast(CursorResult[Any], await s.execute(
                delete(WorkspaceMemberORM).where(
                    WorkspaceMemberORM.workspace_id == workspace_id,
                    WorkspaceMemberORM.user_id == user_id,
                )
            ))
            await s.commit()
            return res.rowcount > 0

    async def count_owners(self, workspace_id: UUID) -> int:
        async with self._session_factory() as s:
            return int(
                (
                    await s.execute(
                        select(func.count())
                        .select_from(WorkspaceMemberORM)
                        .where(
                            WorkspaceMemberORM.workspace_id == workspace_id,
                            WorkspaceMemberORM.role == "owner",
                        )
                    )
                ).scalar_one()
            )

    async def list_directory_users(self) -> list[UserORM]:
        async with self._session_factory() as s:
            return list(
                (await s.execute(select(UserORM).order_by(UserORM.name))).scalars().all()
            )

    # ── Document pages ──────────────────────────────────────────────────────

    async def list_pages(self, workspace_id: UUID) -> list[WorkspacePageORM]:
        async with self._session_factory() as s:
            return list(
                (
                    await s.execute(
                        select(WorkspacePageORM)
                        .where(WorkspacePageORM.workspace_id == workspace_id)
                        .order_by(WorkspacePageORM.sort_order, WorkspacePageORM.created_at)
                    )
                ).scalars().all()
            )

    async def get_page(self, page_id: UUID) -> WorkspacePageORM | None:
        async with self._session_factory() as s:
            return await s.get(WorkspacePageORM, page_id)

    async def create_page(
        self, workspace_id: UUID, *, title: str, body: str, created_by: str | None
    ) -> WorkspacePageORM:
        async with self._session_factory() as s:
            next_order = (
                await s.execute(
                    select(func.coalesce(func.max(WorkspacePageORM.sort_order), -1) + 1)
                    .where(WorkspacePageORM.workspace_id == workspace_id)
                )
            ).scalar_one()
            row = WorkspacePageORM(
                id=uuid.uuid4(),
                workspace_id=workspace_id,
                title=title,
                body=body,
                sort_order=int(next_order),
                created_by=created_by,
                updated_by=created_by,
            )
            s.add(row)
            await s.commit()
            await s.refresh(row)
            return row

    async def update_page(
        self,
        page_id: UUID,
        *,
        title: str | None,
        body: str | None,
        sort_order: int | None,
        updated_by: str | None,
    ) -> WorkspacePageORM | None:
        async with self._session_factory() as s:
            row = await s.get(WorkspacePageORM, page_id)
            if row is None:
                return None
            if title is not None:
                row.title = title
            if body is not None:
                row.body = body
            if sort_order is not None:
                row.sort_order = sort_order
            row.updated_at = datetime.now(timezone.utc)
            row.updated_by = updated_by
            await s.commit()
            await s.refresh(row)
            return row

    async def delete_page(self, page_id: UUID) -> bool:
        async with self._session_factory() as s:
            row = await s.get(WorkspacePageORM, page_id)
            if row is None:
                return False
            await s.delete(row)
            await s.commit()
            return True

    # ── Meetings ────────────────────────────────────────────────────────────

    async def list_meetings(self, workspace_id: UUID) -> list[WorkspaceMeetingORM]:
        async with self._session_factory() as s:
            return list(
                (
                    await s.execute(
                        select(WorkspaceMeetingORM)
                        .where(WorkspaceMeetingORM.workspace_id == workspace_id)
                        .order_by(
                            WorkspaceMeetingORM.meeting_date.desc().nullslast(),
                            WorkspaceMeetingORM.created_at.desc(),
                        )
                    )
                ).scalars().all()
            )

    async def get_meeting(self, meeting_id: UUID) -> WorkspaceMeetingORM | None:
        async with self._session_factory() as s:
            return await s.get(WorkspaceMeetingORM, meeting_id)

    async def create_meeting(
        self,
        workspace_id: UUID,
        *,
        title: str,
        meeting_date: date | None,
        template: str,
        body: str,
        created_by: str | None,
    ) -> WorkspaceMeetingORM:
        async with self._session_factory() as s:
            row = WorkspaceMeetingORM(
                id=uuid.uuid4(),
                workspace_id=workspace_id,
                title=title,
                meeting_date=meeting_date,
                template=template,
                body=body,
                created_by=created_by,
                updated_by=created_by,
            )
            s.add(row)
            await s.commit()
            await s.refresh(row)
            return row

    async def update_meeting(
        self,
        meeting_id: UUID,
        *,
        title: str | None,
        meeting_date: date | None,
        clear_meeting_date: bool,
        body: str | None,
        updated_by: str | None,
    ) -> WorkspaceMeetingORM | None:
        async with self._session_factory() as s:
            row = await s.get(WorkspaceMeetingORM, meeting_id)
            if row is None:
                return None
            if title is not None:
                row.title = title
            if clear_meeting_date:
                row.meeting_date = None
            elif meeting_date is not None:
                row.meeting_date = meeting_date
            if body is not None:
                row.body = body
            row.updated_at = datetime.now(timezone.utc)
            row.updated_by = updated_by
            await s.commit()
            await s.refresh(row)
            return row

    async def delete_meeting(self, meeting_id: UUID) -> bool:
        async with self._session_factory() as s:
            row = await s.get(WorkspaceMeetingORM, meeting_id)
            if row is None:
                return False
            await s.delete(row)
            await s.commit()
            return True

    # ── Calendar ────────────────────────────────────────────────────────────

    async def list_events(self, workspace_id: UUID) -> list[WorkspaceEventORM]:
        async with self._session_factory() as s:
            return list(
                (
                    await s.execute(
                        select(WorkspaceEventORM)
                        .where(WorkspaceEventORM.workspace_id == workspace_id)
                        .order_by(WorkspaceEventORM.starts_at)
                    )
                ).scalars().all()
            )

    async def get_event(self, event_id: UUID) -> WorkspaceEventORM | None:
        async with self._session_factory() as s:
            return await s.get(WorkspaceEventORM, event_id)

    async def create_event(
        self,
        workspace_id: UUID,
        *,
        title: str,
        starts_at: datetime,
        ends_at: datetime | None,
        all_day: bool,
        location: str,
        description: str,
        created_by: str | None,
    ) -> WorkspaceEventORM:
        async with self._session_factory() as s:
            row = WorkspaceEventORM(
                id=uuid.uuid4(),
                workspace_id=workspace_id,
                title=title,
                starts_at=starts_at,
                ends_at=ends_at,
                all_day=all_day,
                location=location,
                description=description,
                created_by=created_by,
                updated_by=created_by,
            )
            s.add(row)
            await s.commit()
            await s.refresh(row)
            return row

    async def update_event(
        self, event_id: UUID, *, changes: dict, updated_by: str | None
    ) -> WorkspaceEventORM | None:
        """`changes` holds only the fields the caller actually sent — an
        explicit null in it clears `ends_at`, which a plain default could not
        tell apart from an absent field."""
        async with self._session_factory() as s:
            row = await s.get(WorkspaceEventORM, event_id)
            if row is None:
                return None
            for field in ("title", "starts_at", "ends_at", "all_day", "location", "description"):
                if field in changes:
                    setattr(row, field, changes[field])
            row.updated_at = datetime.now(timezone.utc)
            row.updated_by = updated_by
            await s.commit()
            await s.refresh(row)
            return row

    async def delete_event(self, event_id: UUID) -> bool:
        async with self._session_factory() as s:
            row = await s.get(WorkspaceEventORM, event_id)
            if row is None:
                return False
            await s.delete(row)
            await s.commit()
            return True

    # ── Files ───────────────────────────────────────────────────────────────

    async def list_files(self, workspace_id: UUID) -> list[dict]:
        async with self._session_factory() as s:
            rows = (
                await s.execute(
                    select(*_FILE_META_COLUMNS)
                    .where(WorkspaceFileORM.workspace_id == workspace_id)
                    .order_by(WorkspaceFileORM.uploaded_at.desc())
                )
            ).all()
            return [dict(r._mapping) for r in rows]

    async def get_file_meta(self, file_id: UUID) -> dict | None:
        async with self._session_factory() as s:
            row = (
                await s.execute(
                    select(*_FILE_META_COLUMNS).where(WorkspaceFileORM.id == file_id)
                )
            ).first()
            return dict(row._mapping) if row is not None else None

    async def get_file_with_data(self, file_id: UUID) -> WorkspaceFileORM | None:
        async with self._session_factory() as s:
            return await s.get(WorkspaceFileORM, file_id)

    async def create_file(
        self,
        workspace_id: UUID,
        *,
        filename: str,
        content_type: str,
        description: str,
        data: bytes,
        uploaded_by: str | None,
        url: str | None = None,
    ) -> dict:
        async with self._session_factory() as s:
            row = WorkspaceFileORM(
                id=uuid.uuid4(),
                workspace_id=workspace_id,
                filename=filename,
                content_type=content_type,
                size_bytes=len(data),
                description=description,
                data=data,
                uploaded_by=uploaded_by,
                url=url,
            )
            s.add(row)
            await s.commit()
            return {
                "id": row.id,
                "workspace_id": row.workspace_id,
                "filename": row.filename,
                "content_type": row.content_type,
                "size_bytes": row.size_bytes,
                "description": row.description,
                "uploaded_at": row.uploaded_at,
                "uploaded_by": row.uploaded_by,
                "url": row.url,
            }

    async def delete_file(self, file_id: UUID) -> bool:
        async with self._session_factory() as s:
            row = await s.get(WorkspaceFileORM, file_id)
            if row is None:
                return False
            await s.delete(row)
            await s.commit()
            return True

    # ── Discussion ──────────────────────────────────────────────────────────

    async def list_posts(self, workspace_id: UUID) -> list[WorkspacePostORM]:
        async with self._session_factory() as s:
            return list(
                (
                    await s.execute(
                        select(WorkspacePostORM)
                        .where(WorkspacePostORM.workspace_id == workspace_id)
                        .order_by(WorkspacePostORM.created_at)
                    )
                ).scalars().all()
            )

    async def get_post(self, post_id: UUID) -> WorkspacePostORM | None:
        async with self._session_factory() as s:
            return await s.get(WorkspacePostORM, post_id)

    async def create_post(
        self,
        workspace_id: UUID,
        *,
        body: str,
        parent_id: UUID | None,
        created_by: str | None,
        author_name: str | None,
    ) -> WorkspacePostORM:
        async with self._session_factory() as s:
            row = WorkspacePostORM(
                id=uuid.uuid4(),
                workspace_id=workspace_id,
                parent_id=parent_id,
                body=body,
                created_by=created_by,
                author_name=author_name,
            )
            s.add(row)
            await s.commit()
            await s.refresh(row)
            return row

    async def update_post(self, post_id: UUID, *, body: str) -> WorkspacePostORM | None:
        async with self._session_factory() as s:
            row = await s.get(WorkspacePostORM, post_id)
            if row is None:
                return None
            row.body = body
            row.edited_at = datetime.now(timezone.utc)
            await s.commit()
            await s.refresh(row)
            return row

    async def delete_post(self, post_id: UUID) -> bool:
        async with self._session_factory() as s:
            row = await s.get(WorkspacePostORM, post_id)
            if row is None:
                return False
            await s.delete(row)
            await s.commit()
            return True

    # ── Tasks ───────────────────────────────────────────────────────────────

    async def list_tasks(self, workspace_id: UUID) -> list[tuple[WorkspaceTaskORM, str | None]]:
        async with self._session_factory() as s:
            rows = (
                await s.execute(
                    select(WorkspaceTaskORM, UserORM.name)
                    .outerjoin(UserORM, UserORM.id == WorkspaceTaskORM.assignee_user_id)
                    .where(WorkspaceTaskORM.workspace_id == workspace_id)
                    .order_by(WorkspaceTaskORM.sort_order, WorkspaceTaskORM.created_at)
                )
            ).all()
            return [(t, name) for t, name in rows]

    async def get_task(self, task_id: UUID) -> WorkspaceTaskORM | None:
        async with self._session_factory() as s:
            return await s.get(WorkspaceTaskORM, task_id)

    async def assignee_name(self, user_id: UUID | None) -> str | None:
        if user_id is None:
            return None
        async with self._session_factory() as s:
            row = await s.get(UserORM, user_id)
            return row.name if row is not None else None

    async def create_task(
        self,
        workspace_id: UUID,
        *,
        title: str,
        description: str,
        assignee_user_id: UUID | None,
        due_date: date | None,
        created_by: str | None,
    ) -> WorkspaceTaskORM:
        async with self._session_factory() as s:
            next_order = (
                await s.execute(
                    select(func.coalesce(func.max(WorkspaceTaskORM.sort_order), -1) + 1)
                    .where(WorkspaceTaskORM.workspace_id == workspace_id)
                )
            ).scalar_one()
            row = WorkspaceTaskORM(
                id=uuid.uuid4(),
                workspace_id=workspace_id,
                title=title,
                description=description,
                status="todo",
                assignee_user_id=assignee_user_id,
                due_date=due_date,
                sort_order=int(next_order),
                created_by=created_by,
                updated_by=created_by,
            )
            s.add(row)
            await s.commit()
            await s.refresh(row)
            return row

    async def update_task(
        self,
        task_id: UUID,
        *,
        title: str | None,
        description: str | None,
        status: str | None,
        due_date: date | None,
        clear_due_date: bool,
        assignee_user_id: UUID | None,
        set_assignee: bool,
        sort_order: int | None,
        updated_by: str | None,
    ) -> WorkspaceTaskORM | None:
        async with self._session_factory() as s:
            row = await s.get(WorkspaceTaskORM, task_id)
            if row is None:
                return None
            if title is not None:
                row.title = title
            if description is not None:
                row.description = description
            if status is not None and status != row.status:
                row.status = status
                row.completed_at = datetime.now(timezone.utc) if status == "done" else None
            if set_assignee:
                row.assignee_user_id = assignee_user_id
            if clear_due_date:
                row.due_date = None
            elif due_date is not None:
                row.due_date = due_date
            if sort_order is not None:
                row.sort_order = sort_order
            row.updated_at = datetime.now(timezone.utc)
            row.updated_by = updated_by
            await s.commit()
            await s.refresh(row)
            return row

    async def delete_task(self, task_id: UUID) -> bool:
        async with self._session_factory() as s:
            row = await s.get(WorkspaceTaskORM, task_id)
            if row is None:
                return False
            await s.delete(row)
            await s.commit()
            return True
