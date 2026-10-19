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
import time
from typing import Any

import httpx
import structlog
from fastapi import APIRouter, Depends, HTTPException

from app.access import get_optional_user
from app.dependencies import require_admin

logger = structlog.get_logger()

router = APIRouter(prefix="/arkflows", tags=["arkflows"])

# Same environment variables as the existing platform integration (sync.py) —
# one place to configure, not two.
#
# No default: where the platform lives depends on the installation. Empty =
# the endpoints answer 503 and say what to configure.
PLATFORM_URL = os.environ.get("INTEGRATION_PLATFORM_URL", "").rstrip("/")
PLATFORM_API_KEY = os.environ.get("INTEGRATION_PLATFORM_API_KEY", "")

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
    if not PLATFORM_URL:
        raise HTTPException(
            503,
            "INTEGRATION_PLATFORM_URL is not configured — the portal does not "
            "know where the Integration Platform is.",
        )
    if not PLATFORM_API_KEY:
        raise HTTPException(
            503,
            "INTEGRATION_PLATFORM_API_KEY is not configured — the portal cannot "
            "read flowcharts from the Integration Platform.",
        )
    return PLATFORM_API_KEY


async def _platform_get(client: httpx.AsyncClient, path: str, **params: Any) -> Any:
    resp = await client.get(
        f"{PLATFORM_URL}{path}",
        headers={"X-Api-Key": _require_key()},
        params=params or None,
    )
    if resp.status_code == 404:
        return None
    if resp.status_code != 200:
        logger.warning("arkflows.platform_error", path=path, status=resp.status_code)
        raise HTTPException(
            502, f"Integration Platform error ({resp.status_code}): {resp.text[:200]}"
        )
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
    }


@router.get("", dependencies=[Depends(get_optional_user)])
async def list_arkflows() -> dict:
    """Every flowchart available to the portal, without the scenes."""
    cached = _cached("index")
    if cached is not None:
        return cached

    out: list[dict] = []
    async with httpx.AsyncClient(timeout=30.0) as client:
        for flow_id in await _arkitekten_flow_ids(client):
            page = 1
            while True:
                data = await _platform_get(
                    client, f"/data/{flow_id}/records", page=page, page_size=200
                )
                if not data:
                    break
                for rec in data.get("records", []):
                    out.append(_summary(rec.get("data") or {}))
                if page * data.get("page_size", 200) >= data.get("total", 0):
                    break
                page += 1

    return _store("index", {"flows": out})


@router.get("/{ark_flow_id}", dependencies=[Depends(get_optional_user)])
async def get_arkflow(ark_flow_id: str) -> dict:
    """One flowchart, scene included — what the canvas draws."""
    cached = _cached(f"flow:{ark_flow_id}")
    if cached is not None:
        return cached

    async with httpx.AsyncClient(timeout=30.0) as client:
        for flow_id in await _arkitekten_flow_ids(client):
            rec = await _platform_get(
                client, f"/data/{flow_id}/records/by-external/{ark_flow_id}"
            )
            if rec:
                data = rec.get("data") or {}
                return _store(
                    f"flow:{ark_flow_id}", {**_summary(data), "scen": data.get("scen")}
                )

    raise HTTPException(404, f"No flowchart named {ark_flow_id!r}")


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
                f"{PLATFORM_URL}/flows/{flow_id}/execute",
                headers={"X-Api-Key": _require_admin_key()},
            )
            if resp.status_code >= 400:
                logger.warning(
                    "arkflows.sync_failed", flow_id=flow_id, status=resp.status_code
                )
                raise HTTPException(
                    502,
                    f"Integration Platform error ({resp.status_code}): {resp.text[:200]}",
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
