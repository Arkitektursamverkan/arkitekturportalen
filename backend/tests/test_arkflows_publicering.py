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
