"""What a user may do with one architecture object, as the UI needs it.

The permissions come from the grants in app/access.py; this module only
names them the way the frontend reads them, so the UI never re-derives the
rules. Private notes are outside these rules — only their author ever sees
them.
"""
from __future__ import annotations

from typing import Any

from fastapi import HTTPException, status
from pydantic import BaseModel

from app.access import Policy


class NodePermissions(BaseModel):
    """Sent with every listing and by GET /nodes/{id}/permissions."""

    edit_object: bool = False
    read_documents: bool = False
    read_restricted: bool = False
    write_documents: bool = False
    read_notes: bool = False
    write_notes: bool = False
    # Edit and delete what others wrote or uploaded.
    manage: bool = False


def node_permissions(policy: Policy, node: Any) -> NodePermissions:
    p = policy.perms(node.id, node.type)
    return NodePermissions(
        edit_object="object.edit" in p,
        read_documents="documents.read" in p,
        read_restricted="documents.read_restricted" in p,
        write_documents="documents.write" in p,
        read_notes="notes.read" in p,
        write_notes="notes.write" in p,
        manage="content.manage" in p,
    )


def require(allowed: bool) -> None:
    if not allowed:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Behörighet saknas")
