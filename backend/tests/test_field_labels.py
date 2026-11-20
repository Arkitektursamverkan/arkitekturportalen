"""Egna namn på objekttypernas fält, och CSV-filerna som följer dem.

Kontraktet som låses här:
- En administratör ger ett fält ett eget namn per objekttyp; värdet ligger kvar
  under samma attributnyckel.
- Mallen och exporten har det egna namnet som kolumnrubrik.
- Importen läser det egna namnet, det tekniska kolumnnamnet och attributnyckeln,
  och lägger värdet där objektets panel visar det.
- Ett namn som CSV-filerna redan använder till annat går inte att spara.
"""
import csv
import io
import uuid

import pytest
import pytest_asyncio
from pydantic import ValidationError

from app.api.v1.csv_import import (
    ENTITY_CONFIGS,
    _parse_csv,
    _parse_unified_csv,
    label_conflict,
)
from app.auth import issue_local_token
from app.domain_lists import FieldLabels, parse
from app.services import org_settings

URL = "/api/v1/org-settings/domain-lists"
AVTAL = {"Application": {"systemägare": "Avtalsägare"}}


@pytest_asyncio.fixture
async def api_headers(repo):
    admin = await repo.create_local_user(
        name="Admin", email=f"admin-{uuid.uuid4().hex}@example.org", password_hash="x", role="admin",
    )
    return {"Authorization": f"Bearer {issue_local_token(admin)}"}


@pytest_asyncio.fixture(autouse=True)
async def rena_listor(repo):
    await org_settings.set_domain_lists(repo._session_factory, None, "test")
    yield
    await org_settings.set_domain_lists(repo._session_factory, None, "test")


def _fil(text: str) -> dict:
    return {"file": ("fil.csv", text.encode("utf-8"), "text/csv")}


async def _spara(client, api_headers, nodes):
    return await client.put(
        URL, json={"disabled": [], "custom": [], "field_labels": {"nodes": nodes}}, headers=api_headers,
    )


def _rubriker(text: str) -> list[str]:
    return next(csv.reader(io.StringIO(text)))


# ── Inställningen ─────────────────────────────────────────────────────────────

def test_utan_installning_finns_inga_egna_namn():
    assert parse(None).field_labels.nodes == {}
    assert parse({"disabled": [], "custom": []}).field_labels.nodes == {}


def test_tomt_namn_ar_standardnamnet_och_blanktecken_stadas():
    labels = FieldLabels(nodes={"Application": {"systemägare": "  Avtals   ägare ", "status": "  "}})
    assert labels.nodes == {"Application": {"systemägare": "Avtals ägare"}}
    assert FieldLabels(nodes={"Application": {"status": ""}}).nodes == {}


@pytest.mark.parametrize("nodes", [
    {"Okänd": {"a": "B"}},
    {"CustomObject": {"a": "B"}},                                       # egna listor har egna fält
    {"Application": {"x_avtal": "Avtal"}},                               # egna fält byter namn i sin definition
    {"Application": {"systemägare": "Ägare", "systemförvaltare": "ägare"}},  # samma namn två gånger
    {"Application": {"systemägare": "Name"}},                            # CSV-filens egen kolumn
    {"Application": {"systemägare": "=SUMMA(A1)"}},                      # läses som formel
    {"Application": {"systemägare": "x" * 101}},
])
def test_ogiltiga_namn_avvisas(nodes):
    with pytest.raises(ValidationError):
        FieldLabels(nodes=nodes)


def test_namn_som_ar_en_annan_kolumn_i_mallen_avvisas():
    assert label_conflict(AVTAL) is None
    # Att kalla fältet vid sitt eget tekniska namn är ingen krock.
    assert label_conflict({"Application": {"systemägare": "application_owner"}}) is None
    assert "vendor" in label_conflict({"Application": {"systemägare": "Vendor"}})
    assert "lifecycle_stage" in label_conflict({"Application": {"systemägare": "Status"}})


async def test_spara_och_lasa_tillbaka(client, api_headers):
    resp = await _spara(client, api_headers, AVTAL)
    assert resp.status_code == 200, resp.text
    assert resp.json()["domain_lists"]["field_labels"]["nodes"] == AVTAL
    public = await client.get("/api/v1/org-settings/public")
    assert public.json()["domain_lists"]["field_labels"]["nodes"] == AVTAL

    assert (await _spara(client, api_headers, {"Application": {"systemägare": "Vendor"}})).status_code == 422
    assert (await _spara(client, api_headers, {"Application": {"systemägare": "Type"}})).status_code == 422


# ── Mallen ────────────────────────────────────────────────────────────────────

async def test_mallen_har_panelens_falt_och_det_egna_namnet(client, api_headers):
    before = _rubriker((await client.get("/api/v1/import/csv/template/applications", headers=api_headers)).text)
    assert before[:5] == ["name", "description", "vendor", "category", "application_owner"]
    # Fälten panelen visar finns alla i mallen.
    assert {"avdelning", "systemförvaltare", "systemadministratör", "planerad_driftstart", "planerad_avveckling"} <= set(before)

    await _spara(client, api_headers, AVTAL)
    resp = await client.get("/api/v1/import/csv/template/applications", headers=api_headers)
    rows = list(csv.reader(io.StringIO(resp.text)))
    assert rows[0][4] == "Avtalsägare"
    assert rows[0][:4] == before[:4]
    assert all(len(r) == len(rows[0]) for r in rows[1:])

    cols = (await client.get("/api/v1/import/csv/columns", headers=api_headers)).json()["applications"]
    assert cols["node_type"] == "Application"
    assert {"name": "application_owner", "attribute": "systemägare", "header": "Avtalsägare"} in cols["columns"]
    assert {"name": "vendor", "attribute": "leverantör", "header": "vendor"} in cols["columns"]


def test_varje_mallrad_ryms_i_kolumnerna():
    for cfg in ENTITY_CONFIGS.values():
        assert set(cfg.attr_map) <= set(cfg.columns)
        assert all(len(row) <= len(cfg.columns) for row in cfg.template_rows)
        # Två kolumner får inte skriva samma attribut.
        assert len(set(cfg.attr_map.values())) == len(cfg.attr_map)


# ── Importen ──────────────────────────────────────────────────────────────────

def test_importen_laser_alla_stavningar_av_rubriken():
    cfg = ENTITY_CONFIGS["applications"]
    labels = AVTAL["Application"]
    for rubrik in ("Avtalsägare", "avtalsägare", " AVTALSÄGARE ", "application_owner", "systemägare"):
        rows, errors = _parse_csv(f"name;{rubrik}\nA;Anna\n".encode(), cfg, labels)
        assert errors == []
        assert rows[0]["application_owner"] == "Anna", rubrik
    # Utan namnbytet är rubriken okänd och värdet hamnar inte i fältet.
    rows, _ = _parse_csv("name;Avtalsägare\nA;Anna\n".encode(), cfg, {})
    assert rows[0]["application_owner"] == ""


async def test_ifylld_mall_hamnar_i_panelens_falt(client, repo, api_headers):
    await _spara(client, api_headers, {"Application": {"systemägare": "Avtalsägare", "status": "Läge"}})
    mall = (await client.get("/api/v1/import/csv/template/applications", headers=api_headers)).text
    rubriker = _rubriker(mall)
    namn = f"Fältnamn {uuid.uuid4().hex[:6]}"
    rad = {"name": namn, "vendor": "Leverantören", "Avtalsägare": "Anna Avtal", "Läge": "I drift", "hosting": "SaaS", "systemförvaltare": "Frida"}
    assert set(rad) <= set(rubriker)
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    w.writerow(rubriker)
    w.writerow([rad.get(r, "") for r in rubriker])

    preview = await client.post("/api/v1/import/csv/preview/applications", files=_fil(buf.getvalue()), headers=api_headers)
    assert preview.json()["errors"] == []
    assert preview.json()["rows"][0]["application_owner"] == "Anna Avtal"

    resp = await client.post("/api/v1/import/csv/applications", files=_fil(buf.getvalue()), headers=api_headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["created"] == 1 and resp.json()["errors"] == []
    [node] = [n for n in await repo.list_nodes(node_type="Application", limit=100_000) if n.name == namn]
    assert node.attributes == {
        "leverantör": "Leverantören", "systemägare": "Anna Avtal", "status": "I drift",
        "driftform": "SaaS", "systemförvaltare": "Frida",
    }


# ── Den samlade filen ─────────────────────────────────────────────────────────

async def test_samlad_fil_foljer_namnen_per_typ(client, repo, api_headers):
    # leverantör finns på tre typer: byter bara en av dem namn står kolumnen kvar.
    await _spara(client, api_headers, {"Application": {"systemägare": "Avtalsägare", "leverantör": "Tillverkare"}})
    mall = (await client.get("/api/v1/import/csv/template/unified", headers=api_headers)).text
    rubriker = next(r for r in csv.reader(io.StringIO(mall)) if r and r[0] == "type")
    assert "Avtalsägare" in rubriker and "application_owner" not in rubriker
    assert "vendor" in rubriker and "Tillverkare" not in rubriker

    text = (
        "[NODES]\ntype,name,description,Tillverkare,Avtalsägare,environment\n"
        "Application,App,,SAP,Anna,\n"
        "TechnologyComponent,Databas,,Microsoft,,\n"
        "Server,S1,,,,Produktion\n"
    )
    nodes, _, errors = _parse_unified_csv(text.encode())
    assert errors == []
    app, tech, server = nodes
    assert app["attributes"] == {"leverantör": "SAP", "systemägare": "Anna"}
    # En rubrik typen inte känner prövas som en annan typs kolumn.
    assert tech["attributes"] == {"leverantör": "Microsoft"}
    assert server["attributes"] == {"miljö": "Produktion"}


async def test_exporten_gar_att_lasa_in_igen(client, repo, api_headers):
    await _spara(client, api_headers, AVTAL)
    namn = f"Export {uuid.uuid4().hex[:6]}"
    resp = await client.post(
        "/api/v1/nodes", headers=api_headers,
        json={"type": "Application", "name": namn, "attributes": {
            "systemägare": "Anna", "leverantör": "SAP", "status": "I drift", "hosting": "Äldre import",
        }},
    )
    assert resp.status_code == 201, resp.text
    export = (await client.get("/api/v1/import/csv/export", headers=api_headers)).text
    rows = list(csv.reader(io.StringIO(export)))
    rubriker = rows[1]
    assert "Avtalsägare" in rubriker
    rad = dict(zip(rubriker, next(r for r in rows if len(r) > 1 and r[1] == namn), strict=True))
    assert (rad["Avtalsägare"], rad["vendor"], rad["lifecycle_stage"]) == ("Anna", "SAP", "I drift")
    # Det en äldre import lade under kolumnens namn följer med i samma kolumn.
    assert rad["hosting"] == "Äldre import"

    # (Other tests' objects of types the unified file cannot hold give errors of their own.)
    nodes, _, _ = _parse_unified_csv(export.encode())
    [back] = [n for n in nodes if n["name"] == namn]
    assert back["attributes"] == {"leverantör": "SAP", "systemägare": "Anna", "status": "I drift", "driftform": "Äldre import"}
