"""Who may see and do what with the architecture objects.

Access is granted, never denied: a user's permissions on an object are the
union of every grant that reaches them (see app/models/access.py). A grant
reaches a user through everyone-signed-in, their global role, a group they
are in, or themselves; it reaches an object through all objects, the
object's type, the object itself, or — for a process — a grant on a process
above it that includes sub-processes. Admins and the API-key system user
have every permission on everything.

A request loads a `Policy` once (`load_policy`) and asks it synchronously;
the async helpers below are shorthands for endpoints that ask one question.

What a permission lets you do:
- object.read — see the object at all (implied by any other permission).
  Without it, the object and every edge touching it are left out of what
  the API returns, and asking for it directly is a 404.
- object.edit — change the object and its connections, and delete it.
- documents.read / documents.read_restricted / documents.write,
  notes.read / notes.write, content.manage — the Dokument and Anteckningar
  tabs; see app/authz.py.

Anonymous callers reach the read endpoints that take get_optional_user only
when the organisation settings allow reading without signing in; they get
what the everyone grants give.
"""
from __future__ import annotations

from typing import Annotated, Any, Iterable, Literal, TypeVar
from uuid import UUID

from fastapi import Header, HTTPException, status

from app.auth import CurrentUser
from app.schemas.common import GraphData

PERMISSIONS: tuple[str, ...] = (
    "object.read",
    "object.edit",
    "documents.read",
    "documents.read_restricted",
    "documents.write",
    "notes.read",
    "notes.write",
    "content.manage",
)
ALL_PERMISSIONS = frozenset(PERMISSIONS)

# The object types grants can be scoped to.
MANAGED_TYPES: tuple[str, ...] = (
    "Process",
    "Application",
    "InformationObject",
    "InformationSource",
    "TechnologyComponent",
    "Server",
    "ArchitecturePrinciple",
)

# Types that have no grants of their own but follow another type's: a
# server service is maintained with the servers, by the same people.
TYPE_FAMILY: dict[str, str] = {"ServerService": "Server"}

# Every object type the policy answers for.
ALL_TYPES: tuple[str, ...] = (*MANAGED_TYPES, *TYPE_FAMILY)

# Global roles a grant can name as its principal.
PRINCIPAL_ROLES: tuple[str, ...] = ("user", "superuser")

Level = Literal["none", "read", "edit"]
T = TypeVar("T")


def _type_str(t: Any) -> str:
    return t.value if hasattr(t, "value") else str(t)


class Policy:
    """One user's effective grants, ready to answer per object."""

    def __init__(
        self,
        *,
        full: bool = False,
        grants: Iterable[Any] = (),
        parents: dict[str, str | None] | None = None,
    ) -> None:
        self.full = full
        self._all: set[str] = set()
        self._by_type: dict[str, set[str]] = {}
        self._by_node: dict[str, set[str]] = {}
        # Grants on a process that also reach every process below it.
        self._by_subtree: dict[str, set[str]] = {}
        self._parents = parents or {}
        for g in grants:
            perms = set(g.permissions)
            if g.scope_type == "all":
                self._all |= perms
            elif g.scope_type == "types":
                for t in g.node_types:
                    self._by_type.setdefault(t, set()).update(perms)
            elif g.scope_type == "node" and g.node_id:
                target = self._by_subtree if g.include_children else self._by_node
                target.setdefault(str(g.node_id), set()).update(perms)

    @property
    def needs_parents(self) -> bool:
        return bool(self._by_subtree)

    # ── Questions ───────────────────────────────────────────────────────────

    def ancestors(self, node_id: str) -> list[str]:
        """Processes above the given one, nearest first."""
        out: list[str] = []
        seen = {node_id}
        parent = self._parents.get(node_id)
        while parent and parent not in seen:
            out.append(parent)
            seen.add(parent)
            parent = self._parents.get(parent)
        return out

    def type_perms(self, node_type: Any) -> frozenset[str]:
        """What holds for every object of the type, whatever else applies."""
        if self.full:
            return ALL_PERMISSIONS
        return _with_read(self._all | self._type_grants(_type_str(node_type)))

    def _type_grants(self, t: str) -> set[str]:
        family = TYPE_FAMILY.get(t)
        own = self._by_type.get(t, set())
        return own | self._by_type.get(family, set()) if family else own

    def perms(self, node_id: Any, node_type: Any, *, parent_id: Any = None) -> frozenset[str]:
        """Permissions on one object. `parent_id` stands in for the object's
        place in the process tree when it doesn't exist yet."""
        if self.full:
            return ALL_PERMISSIONS
        t = _type_str(node_type)
        p = set(self._all) | self._type_grants(t)
        nid = str(node_id) if node_id is not None else None
        if nid:
            p |= self._by_node.get(nid, set()) | self._by_subtree.get(nid, set())
        if self._by_subtree and t == "Process":
            start = nid or (str(parent_id) if parent_id else None)
            chain = self.ancestors(start) if start else []
            if not nid and parent_id:
                chain = [str(parent_id), *chain]
            for a in chain:
                p |= self._by_subtree.get(a, set())
        return _with_read(p)

    def can(self, perm: str, node_id: Any, node_type: Any) -> bool:
        return perm in self.perms(node_id, node_type)

    def can_see(self, node_id: Any, node_type: Any) -> bool:
        return self.can("object.read", node_id, node_type)

    def level(self, node_id: Any, node_type: Any) -> Level:
        p = self.perms(node_id, node_type)
        return "edit" if "object.edit" in p else "read" if "object.read" in p else "none"

    def type_level(self, node_type: Any) -> Level:
        p = self.type_perms(node_type)
        return "edit" if "object.edit" in p else "read" if "object.read" in p else "none"

    def node_ids_with_grants(self) -> set[str]:
        return set(self._by_node) | set(self._by_subtree)

    # ── Raising ─────────────────────────────────────────────────────────────

    def ensure_visible(self, node: Any) -> None:
        """404 for an object the user may not see — as if it did not exist."""
        if not self.can_see(node.id, node.type):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Node not found")

    def require_edit(self, node: Any) -> None:
        self.ensure_visible(node)
        if not self.can("object.edit", node.id, node.type):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Behörighet saknas")

    def require_create(self, node_type: Any, parent_id: Any = None) -> None:
        """A new object needs edit on its type — or, for a sub-process, edit
        reaching the place in the tree it is created at."""
        if "object.edit" not in self.perms(None, node_type, parent_id=parent_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Behörighet saknas")

    def require_edge_write(self, source: Any, target: Any) -> None:
        """An edge belongs to both its ends: you must see both and may edit
        at least one — a server maintainer connects the services that run
        on it; an application's förvaltare connects it to what it uses."""
        self.ensure_visible(source)
        self.ensure_visible(target)
        if not (self.can("object.edit", source.id, source.type) or self.can("object.edit", target.id, target.type)):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Behörighet saknas")

    # ── Filtering ───────────────────────────────────────────────────────────

    def filter_nodes(self, nodes: Iterable[T], type_of=lambda n: n.type, id_of=lambda n: n.id) -> list[T]:  # type: ignore[no-untyped-def]
        if self.full:
            return list(nodes)
        return [n for n in nodes if self.can_see(id_of(n), type_of(n))]

    def filter_graph(self, graph: GraphData) -> GraphData:
        if self.full:
            return graph
        nodes = [n for n in graph.nodes if self.can_see(n.id, n.type)]
        keep = {n.id for n in nodes}
        edges = [e for e in graph.edges if e.source in keep and e.target in keep]
        return GraphData(nodes=nodes, edges=edges)


def _with_read(p: set[str]) -> frozenset[str]:
    # Any permission on an object means you may see it.
    return frozenset(p | {"object.read"}) if p else frozenset()


# ── Loading ─────────────────────────────────────────────────────────────────

async def load_policy(user: CurrentUser | None) -> Policy:
    if user is not None and user.role in ("admin", "system"):
        return Policy(full=True)
    from app.dal.postgres_repository import PostgresRepository
    from app.dependencies import get_repository

    repo = get_repository()
    if not isinstance(repo, PostgresRepository):
        # Grants live in PostgreSQL. Without it: everyone reads, editors edit.
        editor = user is not None and user.role == "superuser"
        return Policy(full=editor, grants=[_Everyone()])
    grants = await repo.access.grants_for(user)
    policy = Policy(grants=grants)
    if policy.needs_parents:
        policy = Policy(grants=grants, parents=await repo.access.process_parents())
    return policy


class _Everyone:
    permissions = ("object.read", "documents.read", "notes.read")
    scope_type = "all"
    node_types: tuple[str, ...] = ()
    node_id = None
    include_children = False


async def get_optional_user(
    authorization: Annotated[str | None, Header()] = None,
    x_api_key: Annotated[str | None, Header()] = None,
) -> CurrentUser | None:
    """The signed-in user, or None when no credentials were sent at all and
    the installation allows reading without signing in (otherwise 401)."""
    if not authorization and not x_api_key:
        from app.services import org_settings
        if not org_settings.current().anonymous_read:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing or invalid authentication")
        return None
    from app.dependencies import get_current_user
    return await get_current_user(authorization=authorization, x_api_key=x_api_key)


# ── Shorthands for endpoints asking one question ────────────────────────────

async def ensure_visible(user: CurrentUser | None, node: Any) -> Policy:
    policy = await load_policy(user)
    policy.ensure_visible(node)
    return policy


async def filter_nodes(user: CurrentUser | None, nodes: Iterable[T]) -> list[T]:
    return (await load_policy(user)).filter_nodes(nodes)


async def filter_graph(user: CurrentUser | None, graph: GraphData) -> GraphData:
    return (await load_policy(user)).filter_graph(graph)


async def hidden_node_ids(user: CurrentUser | None, policy: Policy | None = None) -> set[str]:
    """Ids of every object (archived too) the user may not see."""
    policy = policy or await load_policy(user)
    if policy.full:
        return set()
    from app.dependencies import get_repository
    repo = get_repository()
    hidden: set[str] = set()
    # Objects of a type the user sees in full need no look; the rest are
    # checked one by one, since a grant may reach a single object.
    for t in ALL_TYPES:
        if "object.read" in policy.type_perms(t):
            continue
        for archived in (False, True):
            for n in await repo.list_nodes(node_type=t, archived=archived, limit=100_000):
                if not policy.can_see(n.id, n.type):
                    hidden.add(str(n.id))
    return hidden


def filter_edges(edges: Iterable[T], hidden_ids: set[str]) -> list[T]:
    """Drop edges with either end among the hidden nodes."""
    if not hidden_ids:
        return list(edges)
    out = []
    for e in edges:
        src = str(getattr(e, "source_id", None) or getattr(e, "source", ""))
        tgt = str(getattr(e, "target_id", None) or getattr(e, "target", ""))
        if src not in hidden_ids and tgt not in hidden_ids:
            out.append(e)
    return out


async def effective_access(user: CurrentUser) -> tuple[dict[str, Level], Level]:
    """What /users/me reports: the level per object type that holds for the
    whole type — what create buttons go by — and whether to offer the
    Servrar pages, which is "read" also when a grant reaches only some
    servers or server services (the pages then list just those)."""
    policy = await load_policy(user)
    type_access: dict[str, Level] = {t: policy.type_level(t) for t in ALL_TYPES}
    servers = type_access["Server"]
    if servers == "none" and policy.node_ids_with_grants():
        from app.dependencies import get_repository
        repo = get_repository()
        for nid in policy.node_ids_with_grants():
            node = await repo.get_node(UUID(nid))
            if node is not None and TYPE_FAMILY.get(_type_str(node.type), _type_str(node.type)) == "Server":
                servers = "read"
                break
    return type_access, servers
