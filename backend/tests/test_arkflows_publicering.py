"""Flowcharts published from Arkitekten ("Publicera i EA-portalen").

Pure unit tests — the platform is faked, no database is touched.
"""
from __future__ import annotations

import pytest

from app.api.v1 import arkflows


def test_summary_carries_the_publication():
    s = arkflows._summary(
        {
            "external_id": "c8-x",
            "name": "4.4.5 Ny",
            "prefix": "4.4.5",
            "ea_nod_id": "nod-1",
            "ägare": "IT-chef",
            "beskrivning": "Syftet.",
            "publicerad_at": "2026-10-08T10:00:00Z",
            "scen": {"tung": True},
        }
    )
    assert s["ea_nod_id"] == "nod-1"
    assert s["ägare"] == "IT-chef"
    assert s["beskrivning"] == "Syftet."
    assert s["publicerad_at"] == "2026-10-08T10:00:00Z"
    assert "scen" not in s


def test_summary_without_publication_still_has_the_prefix():
    s = arkflows._summary({"external_id": "c8-y", "prefix": "2.2.7"})
    assert s["prefix"] == "2.2.7"
    assert s["ea_nod_id"] is None


@pytest.mark.asyncio
async def test_running_finds_an_empty_pipeline_but_reading_skips_it(monkeypatch):
    """Before the first publication the pipeline mirrors nothing.

    Reading has nothing to read there, but the sync that Arkitekten's publish
    button triggers must still find it — otherwise the very first publication
    would be told "nothing is configured to fetch flowcharts".
    """
    arkflows._cache.clear()

    async def fake_get(_client, path, **_params):
        assert path == "/data/sources"
        return [
            {"flow_id": "tom", "connector_type": "arkitekten", "record_count": 0},
            {"flow_id": "full", "connector_type": "arkitekten", "record_count": 3},
            {"flow_id": "annan", "connector_type": "two_c8", "record_count": 9},
        ]

    monkeypatch.setattr(arkflows, "_platform_get", fake_get)
    assert await arkflows._arkitekten_flow_ids(None) == ["full"]
    assert await arkflows._arkitekten_flow_ids(None, även_tomma=True) == ["tom", "full"]
    arkflows._cache.clear()


def test_summary_tells_a_systemprocess_from_a_process():
    """A Systemprocess is published onto an APPLICATION. The frontend tells the
    two targets apart on `familj` — lose it and a system flowchart would be
    offered as a process's flowchart, or not at all."""
    s = arkflows._summary(
        {"external_id": "bestallning-ny", "familj": "flodesschema", "ea_nod_id": "app-1"}
    )
    assert s["familj"] == "flodesschema"
    assert s["ea_nod_id"] == "app-1"
    assert s["prefix"] is None


# ── Behörighet och id ───────────────────────────────────────────────────────


def _falsk_plattform(monkeypatch, flows: list[dict]) -> list[str]:
    anrop: list[str] = []

    async def fake_get(_client, path, **_params):
        anrop.append(path)
        if path == "/data/sources":
            return [{"flow_id": "ark", "connector_type": "arkitekten", "record_count": len(flows)}]
        if path == "/data/ark/records":
            return {"records": [{"data": f} for f in flows], "total": len(flows), "page_size": 200}
        if path.startswith("/data/ark/records/by-external/"):
            namn = path.rsplit("/", 1)[1]
            hit = next((f for f in flows if f["external_id"] == namn), None)
            return {"data": hit} if hit else None
        raise AssertionError(path)

    monkeypatch.setattr(arkflows, "_platform_get", fake_get)
    return anrop


@pytest.mark.asyncio
@pytest.mark.parametrize("ogiltigt", ["..%2F..%2Fadmin", "a b", "x" * 201, "%3F"])
async def test_ogiltigt_floedes_id_anropar_inte_plattformen(client, api_headers, monkeypatch, ogiltigt):
    """REGRESSION: id:t sattes rakt in i plattformens sökväg."""
    monkeypatch.setenv("INTEGRATION_PLATFORM_URL", "http://plattform.test/api/v1")
    arkflows._cache.clear()
    anrop = _falsk_plattform(monkeypatch, [])
    resp = await client.get(f"/api/v1/arkflows/{ogiltigt}", headers=api_headers)
    assert resp.status_code == 404
    assert anrop == []


@pytest.mark.asyncio
async def test_floden_filtreras_mot_processens_behorighet(client, api_headers, monkeypatch):
    """REGRESSION: flödesscheman visades oavsett behörighet till sin process."""
    from app.access import Policy

    monkeypatch.setenv("INTEGRATION_PLATFORM_URL", "http://plattform.test/api/v1")

    async def nod(namn, **attr):
        resp = await client.post(
            "/api/v1/nodes", json={"type": "Process", "name": namn, "attributes": attr}, headers=api_headers,
        )
        assert resp.status_code == 201
        return resp.json()["id"]

    dold = await nod("Ark dold", prefix="9.9.1")
    synlig = await nod("Ark synlig", prefix="9.9.2")
    flows = [
        {"external_id": "via-nod-dold", "ea_nod_id": dold, "scen": {}},
        {"external_id": "via-prefix-dold", "prefix": "9.9.1", "scen": {}},
        {"external_id": "via-nod-synlig", "ea_nod_id": synlig, "scen": {}},
        {"external_id": "utan-koppling", "scen": {}},
    ]
    arkflows._cache.clear()
    _falsk_plattform(monkeypatch, flows)

    async def policy(_user):
        return Policy(full=True, hidden_ids={dold})

    monkeypatch.setattr(arkflows, "load_policy", policy)
    ids = {f["id"] for f in (await client.get("/api/v1/arkflows", headers=api_headers)).json()["flows"]}
    assert ids == {"via-nod-synlig", "utan-koppling"}
    assert (await client.get("/api/v1/arkflows/via-nod-dold", headers=api_headers)).status_code == 404
    assert (await client.get("/api/v1/arkflows/via-prefix-dold", headers=api_headers)).status_code == 404
    assert (await client.get("/api/v1/arkflows/via-nod-synlig", headers=api_headers)).status_code == 200
    arkflows._cache.clear()


@pytest.mark.asyncio
async def test_plattformens_felkropp_visas_inte(monkeypatch):
    """REGRESSION: plattformens felsvar skickades vidare till klienten."""
    from fastapi import HTTPException

    class Svar:
        status_code = 500
        text = "Traceback: intern detalj"

    class Klient:
        async def get(self, *_a, **_k):
            return Svar()

    monkeypatch.setenv("INTEGRATION_PLATFORM_URL", "http://plattform.test/api/v1")
    monkeypatch.setattr(arkflows, "PLATFORM_API_KEY", "k")
    with pytest.raises(HTTPException) as fel:
        await arkflows._platform_get(Klient(), "/data/sources")
    assert fel.value.status_code == 502
    assert "intern detalj" not in str(fel.value.detail) and "500" in str(fel.value.detail)


# ── Origin and sync status ────────────────────────────────────────────────────

FLODE = "a81cdecd-8fc3-49ff-93a9-1eb96ac830ba"


def test_summary_carries_the_origin_but_not_the_pipeline_id():
    s = arkflows._summary(
        {"external_id": "ap-x", "ursprung": {"system": " Källsystemet ", "automatisk": True, "flode": FLODE}}
    )
    assert s["ursprung"] == {"system": "Källsystemet", "automatisk": True}
    assert arkflows._summary({"external_id": "ap-y"})["ursprung"] is None
    assert arkflows._summary({"external_id": "ap-z", "ursprung": {"automatisk": True}})["ursprung"] is None


def test_the_pipeline_id_must_be_a_uuid():
    assert arkflows._synkflöde({"ursprung": {"system": "K", "flode": FLODE}}) == FLODE
    assert arkflows._synkflöde({"ursprung": {"system": "K", "flode": "../admin"}}) is None
    assert arkflows._synkflöde({}) is None


def test_the_browser_never_gets_the_servers_own_notes():
    assert arkflows._utåt({"id": "ap-x", "scen": {}, "_synkflode": FLODE}) == {"id": "ap-x", "scen": {}}


class _Svar:
    def __init__(self, status, payload):
        self.status_code = status
        self._payload = payload

    def json(self):
        return self._payload


def _plattform(monkeypatch, *, pipeline, scheman, körningar):
    """Fakes the three platform calls the sync status makes."""

    class Klient:
        def __init__(self, **_kw):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            return False

        async def get(self, url, headers=None, params=None):
            assert headers == {"X-Api-Key": "admin-nyckel"}
            if url.endswith(f"/flows/{FLODE}"):
                return pipeline
            if url.endswith("/schedules"):
                return scheman
            assert url.endswith("/executions") and params["flow_id"] == FLODE and params["status"] == "success"
            return körningar

    async def flow(_id):
        return {"id": "ap-x", "ea_nod_id": None, "prefix": None, "_synkflode": FLODE}

    async def syns(_user):
        return lambda _flow: False

    arkflows._cache.clear()
    monkeypatch.setattr(arkflows, "_flow", flow)
    monkeypatch.setattr(arkflows, "_hidden_flow_filter", syns)
    monkeypatch.setattr(arkflows, "PLATFORM_ADMIN_KEY", "admin-nyckel")
    monkeypatch.setattr(arkflows, "_platform_url", lambda: "http://plattform/api/v1")
    monkeypatch.setattr(arkflows.httpx, "AsyncClient", Klient)


@pytest.mark.asyncio
async def test_sync_is_active_when_the_pipeline_and_a_schedule_are_switched_on(monkeypatch):
    _plattform(
        monkeypatch,
        pipeline=_Svar(200, {"id": FLODE, "enabled": True}),
        scheman=_Svar(200, [
            {"flow_id": FLODE, "enabled": True, "next_run_at": "2026-11-19T16:00:00Z"},
            {"flow_id": "en-annan", "enabled": True, "next_run_at": "2026-11-19T15:00:00Z"},
        ]),
        körningar=_Svar(200, {"executions": [{"finished_at": "2026-11-19T14:01:02Z"}]}),
    )
    assert await arkflows.get_arkflow_sync("ap-x", None) == {
        "känd": True, "aktiv": True, "senast": "2026-11-19T14:01:02Z", "nästa": "2026-11-19T16:00:00Z",
    }


@pytest.mark.asyncio
async def test_sync_is_not_active_when_the_pipeline_or_its_schedule_is_off(monkeypatch):
    _plattform(
        monkeypatch,
        pipeline=_Svar(200, {"id": FLODE, "enabled": False}),
        scheman=_Svar(200, [{"flow_id": FLODE, "enabled": True, "next_run_at": "2026-11-19T16:00:00Z"}]),
        körningar=_Svar(200, {"executions": []}),
    )
    assert (await arkflows.get_arkflow_sync("ap-x", None))["aktiv"] is False

    _plattform(
        monkeypatch,
        pipeline=_Svar(200, {"id": FLODE, "enabled": True}),
        scheman=_Svar(200, [{"flow_id": FLODE, "enabled": False, "next_run_at": None}]),
        körningar=_Svar(200, {"executions": [{"finished_at": "2026-11-19T14:01:02Z"}]}),
    )
    svar = await arkflows.get_arkflow_sync("ap-x", None)
    assert svar["känd"] is True and svar["aktiv"] is False and svar["nästa"] is None


@pytest.mark.asyncio
async def test_a_removed_pipeline_means_the_sync_is_off(monkeypatch):
    _plattform(monkeypatch, pipeline=_Svar(404, {}), scheman=_Svar(200, []), körningar=_Svar(200, {"executions": []}))
    assert await arkflows.get_arkflow_sync("ap-x", None) == {"känd": True, "aktiv": False, "senast": None, "nästa": None}


@pytest.mark.asyncio
async def test_says_nothing_when_the_platform_cannot_be_asked(monkeypatch):
    # REGRESSION-skydd: a platform error must not read as "the sync is off".
    _plattform(monkeypatch, pipeline=_Svar(500, {}), scheman=_Svar(200, []), körningar=_Svar(200, {"executions": []}))
    assert (await arkflows.get_arkflow_sync("ap-x", None))["känd"] is False
    monkeypatch.setattr(arkflows, "PLATFORM_ADMIN_KEY", "")
    assert (await arkflows.get_arkflow_sync("ap-x", None))["känd"] is False


@pytest.mark.asyncio
async def test_a_hand_drawn_flowchart_has_no_sync_to_report(monkeypatch):
    _plattform(monkeypatch, pipeline=_Svar(200, {"enabled": True}), scheman=_Svar(200, []), körningar=_Svar(200, {}))

    async def ritad(_id):
        return {"id": "ap-x", "ea_nod_id": None, "prefix": None, "_synkflode": None}

    monkeypatch.setattr(arkflows, "_flow", ritad)
    assert (await arkflows.get_arkflow_sync("ap-x", None))["känd"] is False


@pytest.mark.asyncio
async def test_systemskiss_kraver_egen_behorighet(client, api_headers, monkeypatch):
    """En systemskiss syns bara för den som har sketches.read på servern den
    är publicerad på – att få se servern räcker inte."""
    from types import SimpleNamespace

    from app.access import Policy

    monkeypatch.setenv("INTEGRATION_PLATFORM_URL", "http://plattform.test/api/v1")
    resp = await client.post("/api/v1/nodes", json={"type": "Server", "name": "Skisserver"}, headers=api_headers)
    assert resp.status_code == 201
    server = resp.json()["id"]
    flows = [
        {"external_id": "sk-miljo", "familj": "systemskiss", "ea_nod_id": server, "scen": {}},
        {"external_id": "sk-utan-server", "familj": "systemskiss", "scen": {}},
    ]
    arkflows._cache.clear()
    _falsk_plattform(monkeypatch, flows)

    def grant(*permissions, **scope):
        return SimpleNamespace(permissions=list(permissions), scope_type="types", node_types=["Server"],
                               node_id=None, include_children=False) if not scope else SimpleNamespace(
            permissions=list(permissions), node_types=[], include_children=False, **scope)

    async def synliga(*grants):
        async def policy(_user):
            return Policy(grants=grants)

        monkeypatch.setattr(arkflows, "load_policy", policy)
        return {f["id"] for f in (await client.get("/api/v1/arkflows", headers=api_headers)).json()["flows"]}

    # Ser servern (Läsare på servrar) – men inte skissen.
    assert await synliga(grant("object.read", "documents.read")) == set()
    assert (await client.get("/api/v1/arkflows/sk-miljo", headers=api_headers)).status_code == 404
    # Behörigheten på typen, eller på just den servern, visar skissen.
    assert await synliga(grant("sketches.read")) == {"sk-miljo"}
    assert await synliga(grant("sketches.read", scope_type="node", node_id=server)) == {"sk-miljo"}
    assert (await client.get("/api/v1/arkflows/sk-miljo", headers=api_headers)).status_code == 200
    # På en annan server hjälper den inte.
    assert await synliga(grant("sketches.read", scope_type="node", node_id="00000000-0000-0000-0000-00000000abcd")) == set()

    # En administratör ser allt, också en skiss som inte pekar på någon server.
    async def full(_user):
        return Policy(full=True)

    monkeypatch.setattr(arkflows, "load_policy", full)
    alla = {f["id"] for f in (await client.get("/api/v1/arkflows", headers=api_headers)).json()["flows"]}
    assert alla == {"sk-miljo", "sk-utan-server"}
    arkflows._cache.clear()
