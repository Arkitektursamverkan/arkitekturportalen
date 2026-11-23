"""Flowcharts from Arkitekten, by way of the Integration Platform.

Arkitekten owns the flowcharts and their drawing rules. It publishes each one
as a *scene*: a fully routed layout with coordinates, finished SVG paths and
finished node shapes. The Integration Platform mirrors those scenes as data
records; this router hands them to the frontend, which only has to draw.

Why a proxy and not a table of our own:

  * The scenes are a MIRROR, not our data. Arkitekten's `flows/` and 2C8 are
    the sources of truth, and the platform already handles fetching, change
    detection and pruning. Copying them into `ea_nodes` would give us a second
    stale copy to keep in sync.
  * It keeps the platform's consumer key server-side. The browser never sees it.
  * No new table means no Alembic migration, so this feature cannot alter the
    database schema.

The link between a scene and a Process node is `attributes.prefix` — the 2C8
numbering ("2.2.7") that the existing 2C8 sync already writes onto Process
nodes. Nothing new has to be stored to connect the two.

Naming note: this is `arkflows`, not `flows`, because "flow" in the Integration
Platform means an ETL pipeline. Two different things with one name is a debugging
tax nobody needs.
"""
from __future__ import annotations

import os
import re
import time
import uuid
from typing import Any
from urllib.parse import quote

import httpx
import structlog
from fastapi import APIRouter, Depends, HTTPException

from app.access import (
    CLASSIFIED_PREFIX,
    UNKNOWN_CLASS,
    get_optional_user,
    hidden_node_ids,
    load_policy,
)
from app.auth import CurrentUser
from app.dependencies import get_repository, require_admin
from app.platform_access import configured_url

logger = structlog.get_logger()

router = APIRouter(prefix="/arkflows", tags=["arkflows"])

# Same environment variables as the existing platform integration (sync.py) —
# one place to configure, not two.
#
# Where the platform is: INTEGRATION_PLATFORM_URL, or the address the platform
# registered (Render) – read on every call, since a registration can come after
# the start. Unknown = the endpoints answer 503 and say what to configure.
def _platform_url() -> str:
    return configured_url()

# Without a separate read key the admin key reads too: it may everything the
# read key may, and is already on the api service – so an installation (Render)
# needs no step after the start to create one.
PLATFORM_API_KEY = (
    os.environ.get("INTEGRATION_PLATFORM_API_KEY")
    or os.environ.get("INTEGRATION_PLATFORM_ADMIN_KEY", "")
)

# Running a pipeline is a WRITE on the platform, and its consumer key cannot do
# that — `require_admin_key` there accepts only the admin key or an admin JWT.
# Hence a second, separate variable: reading scenes and triggering a fetch are
# different powers, and a portal that only displays them should be able to have
# the first without the second. Empty = the manual trigger is switched off, and
# the endpoint says so instead of failing at the platform with a bare 403.
PLATFORM_ADMIN_KEY = os.environ.get("INTEGRATION_PLATFORM_ADMIN_KEY", "")

# Scenes change when someone edits a flowchart — rarely, and never urgently.
# A short cache keeps a page of thumbnails from becoming a burst of calls.
_CACHE_TTL = 120.0

# A flowchart's id as Arkitekten writes it (lower case, digits and dashes) –
# with some room, but never anything that could change the platform path.
_FLOW_ID = re.compile(r"^[A-Za-z0-9._-]{1,200}$")
_cache: dict[str, tuple[float, Any]] = {}


def _cached(key: str) -> Any | None:
    hit = _cache.get(key)
    if hit and time.monotonic() - hit[0] < _CACHE_TTL:
        return hit[1]
    return None


def _store(key: str, value: Any) -> Any:
    _cache[key] = (time.monotonic(), value)
    return value


def _require_admin_key() -> str:
    if not PLATFORM_ADMIN_KEY:
        raise HTTPException(
            503,
            "INTEGRATION_PLATFORM_ADMIN_KEY is not configured — the portal may "
            "read flowcharts but not ask the Integration Platform to fetch new "
            "ones. Set it on the api service to enable the manual sync.",
        )
    return PLATFORM_ADMIN_KEY


def _require_key() -> str:
    if not _platform_url():
        raise HTTPException(
            503,
            "INTEGRATION_PLATFORM_URL is not configured — the portal does not "
            "know where the Integration Platform is.",
        )
    if not PLATFORM_API_KEY:
        raise HTTPException(
            503,
            "Neither INTEGRATION_PLATFORM_API_KEY nor INTEGRATION_PLATFORM_ADMIN_KEY "
            "is configured — the portal cannot read flowcharts from the "
            "Integration Platform.",
        )
    return PLATFORM_API_KEY


async def _platform_get(client: httpx.AsyncClient, path: str, **params: Any) -> Any:
    resp = await client.get(
        f"{_platform_url()}{path}",
        headers={"X-Api-Key": _require_key()},
        params=params or None,
    )
    if resp.status_code == 404:
        return None
    if resp.status_code != 200:
        # The platform's own error text stays in the log.
        logger.warning("arkflows.platform_error", path=path, status=resp.status_code, body=resp.text[:500])
        raise HTTPException(502, f"Integrationsplattformen svarade med fel ({resp.status_code})")
    return resp.json()


async def _arkitekten_flow_ids(
    client: httpx.AsyncClient, *, även_tomma: bool = False
) -> list[str]:
    """Which platform pipelines carry Arkitekten scenes.

    Discovered from `/data/sources` rather than configured, so adding a second
    Arkitekten pipeline (say, one per 2C8 repository) needs no change here and
    no environment variable to keep in step.

    Reading skips empty pipelines; RUNNING them (`även_tomma`) must not. The
    pipeline mirrors only what has been published from Arkitekten, so before
    the first publication it is empty — and the sync that Arkitekten's publish
    button triggers would otherwise answer "nothing to run".
    """
    nyckel = "sources:alla" if även_tomma else "sources"
    cached = _cached(nyckel)
    if cached is not None:
        return cached
    sources = await _platform_get(client, "/data/sources") or []
    ids = [
        str(s["flow_id"])
        for s in sources
        if s.get("connector_type") == "arkitekten" and (även_tomma or s.get("record_count"))
    ]
    return _store(nyckel, ids)


def _summary(data: dict) -> dict:
    """The index entry — everything except the scene itself.

    The scene is the bulk of a record (up to ~112 kB); a list of 200 would be
    megabytes for a page that only needs names. `GET /arkflows/{id}` fetches it
    when something is actually going to be drawn.
    """
    return {
        "id": data.get("external_id"),
        "name": data.get("name"),
        "familj": data.get("familj"),
        "prefix": data.get("prefix"),
        "actor": data.get("actor"),
        # Derived by Arkitekten from its version history and passed through —
        # never recomputed here. See its invariant 9.
        "status": data.get("status"),
        "beteckning": data.get("beteckning"),
        "saved_at": data.get("saved_at"),
        # Set when the flow was published from Arkitekten ("Publicera i
        # EA-portalen"): the Process node it belongs to, its owner and a
        # description. Absent on flows mirrored before publishing existed —
        # those are matched on `prefix`.
        "ea_nod_id": data.get("ea_nod_id"),
        "ägare": data.get("ägare"),
        "beskrivning": data.get("beskrivning"),
        "publicerad_at": data.get("publicerad_at"),
        "bredd": data.get("bredd"),
        "höjd": data.get("höjd"),
        # Set when an integration reads the process into Arkitekten from
        # another system: where it comes from, and whether the picture is
        # generated automatically. See `_ursprung`.
        "ursprung": _ursprung(data.get("ursprung")),
        # The information classification and the protection class it
        # requires (Arkitekten 0.19.0). Server-only — it decides who sees the
        # picture (`_hidden_flow_filter`); what the picture SHOWS of it is the
        # scene's `revision.klassning`, which follows Arkitekten's setting.
        "_klassning": _klassning(data.get("klassning")),
    }


_KLASS_ID = re.compile(r"^[a-z0-9-]{1,64}$")


def _klassning(v: Any) -> dict | None:
    """The classification as the platform passed it on, or None for an
    unclassified picture. A requirement that cannot be read is "okand" —
    administrators only, never open to all."""
    if not isinstance(v, dict):
        return None
    klass = v.get("skyddsklass")
    if klass is None:
        krav = None
    elif isinstance(klass, str) and _KLASS_ID.fullmatch(klass):
        krav = klass
    else:
        krav = UNKNOWN_CLASS
    namn = v["namn"] if isinstance(v.get("namn"), str) else ""
    klassnamn = v["skyddsklass_namn"] if isinstance(v.get("skyddsklass_namn"), str) else ""
    return {"nivå": str(v.get("nivå") or ""), "namn": namn[:120], "skyddsklass": krav, "skyddsklass_namn": klassnamn[:120]}


async def known_classifications() -> list[dict]:
    """The protection classes the mirrored pictures require — what an
    administrator can grant under Behörigheter. Empty when the platform
    cannot be reached."""
    try:
        index = await _index()
    except Exception:  # the meta endpoint must answer anyway
        logger.warning("arkflows.classifications_unavailable")
        return []
    found: dict[str, dict] = {}
    for f in index["flows"]:
        k = f.get("_klassning") or {}
        cid = k.get("skyddsklass")
        if not cid or cid == UNKNOWN_CLASS:
            continue
        c = found.setdefault(cid, {"id": cid, "name": k.get("skyddsklass_namn") or cid, "levels": []})
        if k.get("namn") and k["namn"] not in c["levels"]:
            c["levels"].append(k["namn"])
    return list(found.values())


def _ursprung(v: Any) -> dict | None:
    """Where a flowchart comes from, as the platform passed it on — or None.

    `flode` (the platform pipeline that fetches the underlying data) stays on
    the server: the browser asks `GET /arkflows/{id}/synk` whether the sync is
    running and never needs the id.
    """
    if not isinstance(v, dict):
        return None
    system = v.get("system")
    if not isinstance(system, str) or not system.strip():
        return None
    return {"system": system.strip()[:100], "automatisk": v.get("automatisk") is True}


def _synkflöde(data: dict) -> str | None:
    """The platform pipeline behind an automatically read process, if named."""
    v = data.get("ursprung")
    flode = v.get("flode") if isinstance(v, dict) else None
    if not isinstance(flode, str):
        return None
    try:
        return str(uuid.UUID(flode))
    except ValueError:
        return None


# The family Arkitekten gives a published system sketch.
SKISSFAMILJ = "systemskiss"


async def _hidden_flow_filter(user: CurrentUser | None, flows: list[dict]):  # type: ignore[no-untyped-def]
    """A test for "may this user not see this flowchart?" – by the object it
    is published onto (`ea_nod_id`), or, for one mirrored before publishing
    existed, by the Process its `prefix` names. A flowchart that points at
    nothing the portal knows is shown, as before.

    A system sketch asks for more than seeing the object it is published on:
    the permission `sketches.read` there. It is granted like any other, under
    Behörigheter – so who sees the sketches is decided in the portal, by
    object, type or everything, and needs no administrator role.

    A CLASSIFIED picture asks for its protection class too (`cleared`), and
    is hidden when it points at nothing a clearance could be granted on.
    `flows` are the ones about to be tested: the object types a clearance is
    looked up under are read only when one of them is classified."""
    policy = await load_policy(user)
    if policy.sees_everything:
        return lambda _flow: False
    hidden = await hidden_node_ids(user, policy)
    hidden_prefixes: set[str] = set()
    visible_prefixes: set[str] = set()
    # The visible processes per prefix — where a clearance is looked for on a
    # picture that is matched on its number rather than published on a node.
    by_prefix: dict[str, list[str]] = {}
    for archived in (False, True):
        for p in await get_repository().list_nodes(node_type="Process", archived=archived, limit=100_000):
            prefix = (p.attributes or {}).get("prefix")
            if isinstance(prefix, str) and prefix:
                (hidden_prefixes if str(p.id) in hidden else visible_prefixes).add(prefix)
                if str(p.id) not in hidden:
                    by_prefix.setdefault(prefix, []).append(str(p.id))
    # The object types of the nodes pictures are published on, read once and
    # only when some picture is classified — a type grant can carry a clearance.
    types: dict[str, str] | None = None

    async def node_types() -> dict[str, str]:
        out: dict[str, str] = {}
        for t in ("Process", "Application", "Server"):
            for archived in (False, True):
                for n in await get_repository().list_nodes(node_type=t, archived=archived, limit=100_000):
                    out[str(n.id)] = t
        return out

    def cleared(flow: dict, node_ids: list[str]) -> bool:
        """Classification (Arkitekten's protection classes): a picture whose
        level requires a class is shown only to whoever holds
        `classified.<class>` on an object it is published on. An unclassified
        picture, or a level that requires nothing, is open as before; a level
        Arkitekten no longer knows ("okand") only to administrators."""
        krav = (flow.get("_klassning") or {}).get("skyddsklass")
        if not krav:
            return True
        if krav == UNKNOWN_CLASS:
            return policy.full
        perm = CLASSIFIED_PREFIX + krav
        return any(policy.can(perm, n, (types or {}).get(n, "Process")) for n in node_ids)

    def is_hidden(flow: dict) -> bool:
        if flow.get("familj") == SKISSFAMILJ:
            # Sketches are published on servers; one that points at nothing
            # has nobody who was granted it.
            nod = flow.get("ea_nod_id")
            return (
                not nod
                or str(nod) in hidden
                or not policy.can("sketches.read", nod, "Server")
                or not cleared(flow, [str(nod)])
            )
        if flow.get("ea_nod_id"):
            return str(flow["ea_nod_id"]) in hidden or not cleared(flow, [str(flow["ea_nod_id"])])
        prefix = flow.get("prefix")
        if bool(prefix) and prefix in hidden_prefixes and prefix not in visible_prefixes:
            return True
        # Not tied to any object: a classified one has nobody it was granted to.
        return not cleared(flow, by_prefix.get(prefix, []) if prefix else [])

    if any((f.get("_klassning") or {}).get("skyddsklass") for f in flows):
        types = await node_types()
    return is_hidden


@router.get("")
async def list_arkflows(user: CurrentUser | None = Depends(get_optional_user)) -> dict:
    """Every flowchart available to the portal, without the scenes – those
    whose process (or application) the user may see."""
    index = await _index()
    is_hidden = await _hidden_flow_filter(user, index["flows"])
    return {"flows": [_utåt(f) for f in index["flows"] if not is_hidden(f)]}


async def _index() -> dict:
    # The cache holds everything; what a user may see is decided per request.
    cached = _cached("index")
    if cached is not None:
        return cached

    out: list[dict] = []
    async with httpx.AsyncClient(timeout=30.0) as client:
        for flow_id in await _arkitekten_flow_ids(client):
            page = 1
            while True:
                data = await _platform_get(
                    client, f"/data/{quote(flow_id, safe='')}/records", page=page, page_size=200
                )
                if not data:
                    break
                for rec in data.get("records", []):
                    out.append(_summary(rec.get("data") or {}))
                if page * data.get("page_size", 200) >= data.get("total", 0):
                    break
                page += 1

    return _store("index", {"flows": out})


@router.get("/{ark_flow_id}")
async def get_arkflow(ark_flow_id: str, user: CurrentUser | None = Depends(get_optional_user)) -> dict:
    """One flowchart, scene included — what the canvas draws. 404, as if it
    did not exist, when the user may not see its process."""
    if not _FLOW_ID.fullmatch(ark_flow_id):
        raise HTTPException(404, "No such flowchart")
    flow = await _flow(ark_flow_id)
    if flow is None or (await _hidden_flow_filter(user, [flow]))(flow):
        raise HTTPException(404, "No such flowchart")
    return _utåt(flow)


def _utåt(flow: dict) -> dict:
    """A flowchart as the browser gets it: without the server's own notes."""
    return {k: v for k, v in flow.items() if not k.startswith("_")}


async def _flow(ark_flow_id: str) -> dict | None:
    cached = _cached(f"flow:{ark_flow_id}")
    if cached is not None:
        return cached

    async with httpx.AsyncClient(timeout=30.0) as client:
        for flow_id in await _arkitekten_flow_ids(client):
            rec = await _platform_get(
                client,
                f"/data/{quote(flow_id, safe='')}/records/by-external/{quote(ark_flow_id, safe='')}",
            )
            if rec:
                data = rec.get("data") or {}
                return _store(
                    f"flow:{ark_flow_id}",
                    # `_synkflode` never leaves the server – see `_utåt`.
                    {**_summary(data), "scen": data.get("scen"), "_synkflode": _synkflöde(data)},
                )
    return None


_OKÄND_SYNK: dict = {"känd": False, "aktiv": False, "senast": None, "nästa": None}


@router.get("/{ark_flow_id}/synk")
async def get_arkflow_sync(ark_flow_id: str, user: CurrentUser | None = Depends(get_optional_user)) -> dict:
    """Is the process still kept in step with the system it comes from?

    For a flowchart that an integration reads in automatically, the platform
    pipeline that fetches the underlying data is named in its origin. This asks
    the platform about that pipeline: `aktiv` when it is switched on AND has a
    schedule that is switched on, `senast` its last successful run, `nästa` the
    next scheduled one. `känd` is false when there is nothing to ask about or
    the platform cannot be asked (no admin key, platform down) — the page then
    says nothing rather than something untrue.
    """
    if not _FLOW_ID.fullmatch(ark_flow_id):
        raise HTTPException(404, "No such flowchart")
    flow = await _flow(ark_flow_id)
    if flow is None or (await _hidden_flow_filter(user, [flow]))(flow):
        raise HTTPException(404, "No such flowchart")
    flode = flow.get("_synkflode")
    if not flode or not PLATFORM_ADMIN_KEY or not _platform_url():
        return _OKÄND_SYNK
    cached = _cached(f"synk:{flode}")
    if cached is not None:
        return cached

    headers = {"X-Api-Key": PLATFORM_ADMIN_KEY}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            pipeline = await client.get(f"{_platform_url()}/flows/{flode}", headers=headers)
            scheman = await client.get(f"{_platform_url()}/schedules", headers=headers)
            körningar = await client.get(
                f"{_platform_url()}/executions",
                headers=headers,
                params={"flow_id": flode, "status": "success", "page_size": 1},
            )
        if pipeline.status_code == 404:
            # The pipeline is gone: nothing keeps the process in step any more.
            return _store(f"synk:{flode}", {"känd": True, "aktiv": False, "senast": None, "nästa": None})
        if pipeline.status_code != 200 or scheman.status_code != 200 or körningar.status_code != 200:
            return _OKÄND_SYNK
        påslagna = [
            s for s in scheman.json()
            if str(s.get("flow_id")) == flode and s.get("enabled")
        ]
        senaste = (körningar.json().get("executions") or [{}])[0]
        nästa = sorted(s["next_run_at"] for s in påslagna if s.get("next_run_at"))
        return _store(
            f"synk:{flode}",
            {
                "känd": True,
                "aktiv": bool(pipeline.json().get("enabled")) and bool(påslagna),
                "senast": senaste.get("finished_at"),
                "nästa": nästa[0] if nästa else None,
            },
        )
    except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
        logger.warning("arkflows.synk_error", flow_id=ark_flow_id, error=str(exc))
        return _OKÄND_SYNK


@router.post("/sync", dependencies=[Depends(require_admin)])
async def sync_arkflows() -> dict:
    """Fetch the flowcharts from Arkitekten NOW, instead of waiting for the schedule.

    What actually runs is the platform pipeline that pulls scenes from
    Arkitekten's flow service; the portal itself stores nothing. That is the
    step that lags: it is scheduled every two hours, so a change made in
    Arkitekten is invisible here until it has run – hence a button rather than
    a wait.

    Two things worth knowing about what comes back:

      * The pipeline delivers Arkitekten's FASTSLAGNA versions. A draft stays
        invisible however often this is run — that is Arkitekten's rule about
        what "gäller", not a sync problem, and the count below will not change
        when someone has only saved a draft.
      * The read cache is dropped afterwards, or the portal would keep serving
        the scenes it fetched up to two minutes ago and the button would look
        broken for exactly as long.
    """
    körningar: list[dict[str, Any]] = []
    async with httpx.AsyncClient(timeout=600.0) as client:
        flow_ids = await _arkitekten_flow_ids(client, även_tomma=True)
        if not flow_ids:
            raise HTTPException(
                502,
                "The Integration Platform has no Arkitekten pipeline to run — "
                "nothing is configured to fetch flowcharts.",
            )
        for flow_id in flow_ids:
            resp = await client.post(
                f"{_platform_url()}/flows/{quote(flow_id, safe='')}/execute",
                headers={"X-Api-Key": _require_admin_key()},
            )
            if resp.status_code >= 400:
                logger.warning(
                    "arkflows.sync_failed", flow_id=flow_id, status=resp.status_code,
                    body=resp.text[:500],
                )
                raise HTTPException(
                    502, f"Integrationsplattformen svarade med fel ({resp.status_code})"
                )
            körning = resp.json()
            körningar.append(
                {
                    "flow_id": flow_id,
                    "status": körning.get("status"),
                    "records_processed": körning.get("records_processed", 0),
                    "records_updated": körning.get("records_updated", 0),
                    "started_at": körning.get("started_at"),
                    "finished_at": körning.get("finished_at"),
                    "error_message": körning.get("error_message"),
                }
            )

    # The freshly fetched scenes must be what the next request sees.
    _cache.clear()

    return {
        "runs": körningar,
        "records_processed": sum(k["records_processed"] or 0 for k in körningar),
        "records_updated": sum(k["records_updated"] or 0 for k in körningar),
        "failed": [k["flow_id"] for k in körningar if k["status"] != "success"],
    }
