"""CSV-exporter: celler som ett kalkylprogram skulle läsa som formler får en
apostrof först, och importen tar bort den igen."""
from __future__ import annotations

import csv
import io
import uuid

import pytest

from app.csv_safety import safe_cell, safe_writer, unescape_cell
from app.services.survey_export import build_report_csv


@pytest.mark.parametrize("value", ["=1+1", "+46 70", "-x", "@SUM(A1)", "\tx", "\rx", '=HYPERLINK("https://e.example","x")'])
def test_formler_neutraliseras(value):
    assert safe_cell(value) == "'" + value
    assert unescape_cell(safe_cell(value)) == value


@pytest.mark.parametrize("value", ["Faktura", "", "a=b", "'citat", " =med mellanslag först"])
def test_vanlig_text_lamnas(value):
    assert safe_cell(value) == value
    assert unescape_cell(value) == value


def test_tal_och_tomt_lamnas():
    assert safe_cell(-3) == -3
    assert safe_cell(2.5) == 2.5
    assert safe_cell(None) is None


def test_skrivaren_skyddar_varje_cell():
    buf = io.StringIO()
    safe_writer(buf, delimiter=";").writerow(["=cmd|' /C calc'!A0", "ok", -1])
    assert next(csv.reader(io.StringIO(buf.getvalue()), delimiter=";")) == ["'=cmd|' /C calc'!A0", "ok", "-1"]


def test_enkatrapport_skyddas():
    # REGRESSION: svarstext gick rakt in i rapportens CSV.
    out = build_report_csv({
        "anonymous": True,
        "questions": [{"id": "q1", "label": "=Fråga"}],
        "rows": [{"object_name": "@App", "submitted_at": "2026-11-10", "answers": {"q1": "=1+1"}}],
    })
    rows = list(csv.reader(io.StringIO(out), delimiter=";"))
    assert rows[0][-1] == "'=Fråga"
    assert rows[1][0] == "'@App" and rows[1][-1] == "'=1+1"


@pytest.mark.asyncio
async def test_export_och_import_av_objekt(client, api_headers):
    namn = f"=HYPERLINK(\"x\") {uuid.uuid4().hex[:6]}"
    r = await client.post("/api/v1/nodes", json={"type": "Application", "name": namn}, headers=api_headers)
    assert r.status_code == 201, r.text
    exp = await client.get("/api/v1/import/csv/export", headers=api_headers)
    assert exp.status_code == 200, exp.text
    assert '"\'=HYPERLINK(""x"")' in exp.text
    assert '"=HYPERLINK(' not in exp.text

    # Exporten läses in oförändrad: apostrofen tas bort vid import.
    from app.api.v1.csv_import import _parse_unified_csv

    # (Andra tester kan ha lagt upp typer som importen inte tar – de rader
    # som gäller här är objekttypen Application.)
    nodes, _edges, _errors = _parse_unified_csv(exp.content)
    assert any(n["name"] == namn and n["type"] == "Application" for n in nodes)
