"""Dokument and Anteckningar on architecture objects.

Every endpoint starts from the object: it must exist and be visible to the
caller (an object no grant reaches is a 404), and what the caller may do
with its documents and notes comes from the grants, via app/authz.py. Listings carry
those permissions so the UI can show or hide its controls without knowing the
rules.

Documents classified Begränsad are left out entirely for those who may not
read them — not listed as locked — so a title can't leak what it's about.
Documents belong to their own object only; a sub-process does not show its
parent's.
"""
from __future__ import annotations

import os
from datetime import date
from urllib.parse import quote
from uuid import UUID

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
from pydantic import ValidationError

from app.access import load_policy
from app.auth import CurrentUser
from app.authz import NodePermissions, node_permissions, require
from app.dal.postgres_repository import PostgresRepository
from app.dependencies import get_repository, require_user
from app.models.node_content import NodeDocumentORM, NodeNoteORM
from app.schemas.node import NodeRead
from app.schemas.node_content import (
    ContentSummary,
    DocumentList,
    DocumentRead,
    DocumentUpdate,
    DocumentVersionRead,
    LinkCreate,
    NoteCreate,
    NoteList,
    NoteRead,
    NoteUpdate,
)

router = APIRouter(prefix="/nodes", tags=["node-content"])

# Files live in the database (bytea), same limit as Samarbete.
MAX_UPLOAD_BYTES = 25 * 1024 * 1024

# Office documents, PDF, text, images, diagrams and mail. What the file is
# served as comes from here, never from what the browser claimed on upload.
# HTML, SVG and executables are deliberately missing: they can run code.
ALLOWED_TYPES: dict[str, str] = {
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".xlsm": "application/vnd.ms-excel.sheet.macroEnabled.12",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".vsd": "application/vnd.visio",
    ".vsdx": "application/vnd.ms-visio.drawing",
    ".odt": "application/vnd.oasis.opendocument.text",
    ".ods": "application/vnd.oasis.opendocument.spreadsheet",
    ".odp": "application/vnd.oasis.opendocument.presentation",
    ".rtf": "application/rtf",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".csv": "text/csv",
    ".json": "application/json",
    ".xml": "application/xml",
    ".bpmn": "application/xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".msg": "application/vnd.ms-outlook",
    ".eml": "message/rfc822",
    ".zip": "application/zip",
}


def _pg_repo() -> PostgresRepository:
    repo = get_repository()
    if not isinstance(repo, PostgresRepository):
        raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Kräver PostgreSQL-backend")
    return repo


def _actor(user: CurrentUser) -> str | None:
    return user.email or user.name or None


def _user_uuid(user: CurrentUser) -> UUID | None:
    """The API-key service user has no row in ea_users."""
    try:
        return UUID(user.id)
    except (TypeError, ValueError):
        return None


def _type(node: NodeRead) -> str:
    return node.type.value if hasattr(node.type, "value") else str(node.type)


async def _node(node_id: UUID, user: CurrentUser) -> tuple[NodeRead, NodePermissions]:
    node = await _pg_repo().get_node(node_id)
    if node is None:
        raise HTTPException(status_code=404, detail="Node not found")
    policy = await load_policy(user)
    policy.ensure_visible(node)
    return node, node_permissions(policy, node)


def _visible(doc: NodeDocumentORM, perms: NodePermissions) -> bool:
    return perms.read_documents and (doc.classification != "begransad" or perms.read_restricted)


def _can_edit_document(doc: NodeDocumentORM, perms: NodePermissions, user: CurrentUser) -> bool:
    return perms.manage or (perms.write_documents and doc.created_by == _actor(user))


def _document_out(doc: NodeDocumentORM, latest: dict | None, count: int, can_edit: bool) -> dict:
    return {
        **{c: getattr(doc, c) for c in (
            "id", "node_id", "kind", "title", "doc_type", "description", "classification", "url",
            "review_date", "created_at", "created_by", "updated_at", "updated_by",
        )},
        "current_version": DocumentVersionRead(**latest) if latest else None,
        "version_count": count,
        "can_edit": can_edit,
    }


async def _document(node_id: UUID, document_id: UUID, user: CurrentUser):  # type: ignore[no-untyped-def]
    """The node, the caller's permissions and the document — 404 when the
    document isn't on this node or isn't visible to the caller."""
    node, perms = await _node(node_id, user)
    doc = await _pg_repo().node_content.get_document(document_id)
    if doc is None or doc.node_id != node_id or not _visible(doc, perms):
        raise HTTPException(status_code=404, detail="Dokumentet finns inte")
    return node, perms, doc


async def _read_upload(file: UploadFile) -> dict:
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
    return {
        "filename": filename,
        "content_type": ALLOWED_TYPES[ext],
        "size_bytes": total,
        "data": b"".join(chunks),
    }


# ── Documents ───────────────────────────────────────────────────────────────

@router.get("/{node_id}/documents", response_model=DocumentList)
async def list_documents(node_id: UUID, user: CurrentUser = Depends(require_user)) -> DocumentList:
    node, perms = await _node(node_id, user)
    repo = _pg_repo()

    documents = [
        DocumentRead(**_document_out(d, latest, n, _can_edit_document(d, perms, user)))
        for d, latest, n in await repo.node_content.list_documents(node.id)
        if _visible(d, perms)
    ]
    return DocumentList(permissions=perms, documents=documents)


def _metadata_form(
    title: str, doc_type: str, description: str, classification: str, review_date: str,
) -> dict:
    """Form fields of an upload, checked by the same schema a link uses."""
    try:
        checked = LinkCreate(
            title=title, url="https://placeholder", doc_type=doc_type,  # type: ignore[arg-type]
            description=description, classification=classification,  # type: ignore[arg-type]
            review_date=date.fromisoformat(review_date) if review_date else None,
        )
    except (ValidationError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return checked.model_dump(exclude={"url"})


@router.post("/{node_id}/documents/file", response_model=DocumentRead, status_code=status.HTTP_201_CREATED)
async def upload_document(
    node_id: UUID,
    file: UploadFile = File(...),
    title: str = Form(""),
    doc_type: str = Form("ovrigt"),
    description: str = Form(""),
    classification: str = Form("intern"),
    review_date: str = Form(""),
    user: CurrentUser = Depends(require_user),
) -> DocumentRead:
    node, perms = await _node(node_id, user)
    require(perms.write_documents)
    upload = await _read_upload(file)
    fields = _metadata_form(title.strip() or upload["filename"], doc_type, description, classification, review_date)
    require(fields["classification"] != "begransad" or perms.read_restricted)

    repo = _pg_repo()
    doc = await repo.node_content.create_document(
        node.id, kind="file", fields=fields, file=upload,
        actor=_actor(user), node_name=node.name, node_type=_type(node),
    )
    latest = (await repo.node_content.list_versions(doc.id))[0]
    return DocumentRead(**_document_out(doc, latest, 1, True))


@router.post("/{node_id}/documents/link", response_model=DocumentRead, status_code=status.HTTP_201_CREATED)
async def create_link(
    node_id: UUID, data: LinkCreate, user: CurrentUser = Depends(require_user),
) -> DocumentRead:
    node, perms = await _node(node_id, user)
    require(perms.write_documents)
    require(data.classification != "begransad" or perms.read_restricted)
    doc = await _pg_repo().node_content.create_document(
        node.id, kind="link", fields=data.model_dump(), file=None,
        actor=_actor(user), node_name=node.name, node_type=_type(node),
    )
    return DocumentRead(**_document_out(doc, None, 0, True))


@router.patch("/{node_id}/documents/{document_id}", response_model=DocumentRead)
async def update_document(
    node_id: UUID, document_id: UUID, data: DocumentUpdate, user: CurrentUser = Depends(require_user),
) -> DocumentRead:
    _node, perms, doc = await _document(node_id, document_id, user)
    require(_can_edit_document(doc, perms, user))
    fields = data.model_dump(exclude_none=True, exclude={"clear_review_date"})
    if data.clear_review_date:
        fields["review_date"] = None
    if "url" in fields and doc.kind != "link":
        raise HTTPException(status_code=400, detail="Bara en länk har en adress")
    if fields.get("classification") == "begransad":
        require(perms.read_restricted)

    repo = _pg_repo()
    updated = await repo.node_content.update_document(doc.id, fields, _actor(user))
    if updated is None:
        raise HTTPException(status_code=404, detail="Dokumentet finns inte")
    versions = await repo.node_content.list_versions(doc.id)
    return DocumentRead(**_document_out(updated, versions[0] if versions else None, len(versions), True))


@router.post("/{node_id}/documents/{document_id}/versions", response_model=DocumentRead)
async def upload_version(
    node_id: UUID,
    document_id: UUID,
    file: UploadFile = File(...),
    comment: str = Form(""),
    user: CurrentUser = Depends(require_user),
) -> DocumentRead:
    node, perms, doc = await _document(node_id, document_id, user)
    require(_can_edit_document(doc, perms, user))
    if doc.kind != "file":
        raise HTTPException(status_code=400, detail="En länk har inga filversioner")
    upload = await _read_upload(file)

    repo = _pg_repo()
    await repo.node_content.add_version(
        doc, file={**upload, "comment": comment.strip()},
        actor=_actor(user), node_name=node.name, node_type=_type(node),
    )
    refreshed = await repo.node_content.get_document(doc.id)
    versions = await repo.node_content.list_versions(doc.id)
    return DocumentRead(**_document_out(refreshed or doc, versions[0], len(versions), True))


@router.get("/{node_id}/documents/{document_id}/versions", response_model=list[DocumentVersionRead])
async def list_versions(
    node_id: UUID, document_id: UUID, user: CurrentUser = Depends(require_user),
) -> list[DocumentVersionRead]:
    await _document(node_id, document_id, user)
    return [DocumentVersionRead(**v) for v in await _pg_repo().node_content.list_versions(document_id)]


@router.get("/{node_id}/documents/{document_id}/download")
async def download_document(
    node_id: UUID,
    document_id: UUID,
    version: int | None = Query(None, ge=1),
    user: CurrentUser = Depends(require_user),
) -> Response:
    node, _perms, doc = await _document(node_id, document_id, user)
    repo = _pg_repo()
    row = await repo.node_content.get_version_with_data(doc.id, version)
    if row is None:
        raise HTTPException(status_code=404, detail="Filen finns inte")
    if doc.classification == "begransad":
        await repo.node_content.log_download(
            doc, row.version_no, actor=_actor(user), node_name=node.name, node_type=_type(node),
        )
    # RFC 5987 filename* keeps å/ä/ö intact; the plain filename is the fallback.
    ascii_name = row.filename.encode("ascii", "replace").decode("ascii").replace('"', "_")
    return Response(
        content=row.data,
        media_type=row.content_type,
        headers={
            "Content-Disposition": (
                f'attachment; filename="{ascii_name}"; filename*=UTF-8\'\'{quote(row.filename)}'
            ),
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, no-store",
        },
    )


@router.delete("/{node_id}/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    node_id: UUID, document_id: UUID, user: CurrentUser = Depends(require_user),
) -> Response:
    node, perms, doc = await _document(node_id, document_id, user)
    require(_can_edit_document(doc, perms, user))
    await _pg_repo().node_content.delete_document(
        doc, actor=_actor(user), node_name=node.name, node_type=_type(node),
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── Notes ───────────────────────────────────────────────────────────────────

def _is_mine(note: NodeNoteORM, user: CurrentUser) -> bool:
    uid = _user_uuid(user)
    return uid is not None and note.author_user_id == uid


def _can_edit_note(note: NodeNoteORM, perms: NodePermissions, user: CurrentUser) -> bool:
    if _is_mine(note, user):
        return perms.write_notes
    # Someone else's private note is never reachable; a shared one is the
    # object manager's to tidy.
    return note.visibility == "shared" and perms.manage


def _note_out(note: NodeNoteORM, perms: NodePermissions, user: CurrentUser) -> NoteRead:
    return NoteRead(
        id=note.id, node_id=note.node_id, body=note.body, visibility=note.visibility,  # type: ignore[arg-type]
        pinned=note.pinned, author_name=note.author_name, created_at=note.created_at,
        edited_at=note.edited_at, is_mine=_is_mine(note, user),
        can_edit=_can_edit_note(note, perms, user),
    )


async def _note(node_id: UUID, note_id: UUID, user: CurrentUser):  # type: ignore[no-untyped-def]
    node, perms = await _node(node_id, user)
    note = await _pg_repo().node_content.get_note(note_id)
    visible = note is not None and note.node_id == node_id and (
        _is_mine(note, user) or (note.visibility == "shared" and perms.read_notes)
    )
    if not visible:
        raise HTTPException(status_code=404, detail="Anteckningen finns inte")
    return node, perms, note


@router.get("/{node_id}/notes", response_model=NoteList)
async def list_notes(node_id: UUID, user: CurrentUser = Depends(require_user)) -> NoteList:
    node, perms = await _node(node_id, user)
    rows = await _pg_repo().node_content.list_notes(node.id, _user_uuid(user))
    notes = [
        _note_out(n, perms, user) for n in rows
        if n.visibility == "private" or perms.read_notes
    ]
    return NoteList(permissions=perms, notes=notes)


@router.post("/{node_id}/notes", response_model=NoteRead, status_code=status.HTTP_201_CREATED)
async def create_note(
    node_id: UUID, data: NoteCreate, user: CurrentUser = Depends(require_user),
) -> NoteRead:
    node, perms = await _node(node_id, user)
    require(perms.write_notes)
    uid = _user_uuid(user)
    if data.visibility == "private" and uid is None:
        raise HTTPException(status_code=400, detail="En privat anteckning kräver ett användarkonto")
    note = await _pg_repo().node_content.create_note(
        node.id, body=data.body.strip(), visibility=data.visibility, pinned=data.pinned,
        author_user_id=uid, author_name=user.name or user.email or None,
    )
    return _note_out(note, perms, user)


@router.patch("/{node_id}/notes/{note_id}", response_model=NoteRead)
async def update_note(
    node_id: UUID, note_id: UUID, data: NoteUpdate, user: CurrentUser = Depends(require_user),
) -> NoteRead:
    _, perms, note = await _note(node_id, note_id, user)
    require(_can_edit_note(note, perms, user))
    fields = data.model_dump(exclude_none=True)
    # Only the author decides who sees what they wrote.
    if "visibility" in fields and fields["visibility"] != note.visibility:
        require(_is_mine(note, user))
    if "body" in fields:
        fields["body"] = fields["body"].strip()
    updated = await _pg_repo().node_content.update_note(note.id, fields)
    if updated is None:
        raise HTTPException(status_code=404, detail="Anteckningen finns inte")
    return _note_out(updated, perms, user)


@router.delete("/{node_id}/notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_note(
    node_id: UUID, note_id: UUID, user: CurrentUser = Depends(require_user),
) -> Response:
    _, perms, note = await _note(node_id, note_id, user)
    require(_can_edit_note(note, perms, user))
    await _pg_repo().node_content.delete_note(note.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── Summary ─────────────────────────────────────────────────────────────────

@router.get("/{node_id}/permissions", response_model=NodePermissions)
async def my_permissions(node_id: UUID, user: CurrentUser = Depends(require_user)) -> NodePermissions:
    """What the signed-in user may do with the object — the detail panel's
    edit and delete buttons go by it."""
    _, perms = await _node(node_id, user)
    return perms


@router.get("/{node_id}/content-summary", response_model=ContentSummary)
async def content_summary(node_id: UUID, user: CurrentUser = Depends(require_user)) -> ContentSummary:
    await _node(node_id, user)
    docs, notes = await _pg_repo().node_content.summary(node_id)
    return ContentSummary(documents=docs, notes=notes)
