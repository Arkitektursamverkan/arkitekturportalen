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

    monkeypatch.setattr(arkflows, "PLATFORM_URL", "http://plattform.test/api/v1")
    monkeypatch.setattr(arkflows, "PLATFORM_API_KEY", "k")
    with pytest.raises(HTTPException) as fel:
        await arkflows._platform_get(Klient(), "/data/sources")
    assert fel.value.status_code == 502
    assert "intern detalj" not in str(fel.value.detail) and "500" in str(fel.value.detail)
