"""Innehållspaket: organisationens innehåll som filer, utanför migreringarna.

Kontraktet som låses här:
- Export följt av import på samma installation ändrar ingenting.
- Import lägger till och uppdaterar på en naturlig nyckel men tar aldrig
  bort; samma paket två gånger ändrar inget andra gången.
- --dry-run räknar men skriver inte.
- Dokumenten med versionshistorik skrivs så att importen syns i historiken.
- Ett paket i fel format eller med okända filer avvisas innan något skrivs.
"""
import json
import uuid

import pytest
from sqlalchemy import select

from app.models.audit import AuditLogORM
from app.models.glossary_term import GlossaryTermORM
from app.models.workspace import WorkspaceORM
from app.schemas.common import NodeType
from app.schemas.node import NodeCreate
from app.services import content_pack as cp


def _pack(**files) -> dict:
    return {cp.MANIFEST: {"format": cp.FORMAT, "version": cp.VERSION, "name": "test"}, **files}


def _principle(identifier: str, name: str, **attrs) -> dict:
    return {
        "name": name, "description": "",
        "attributes": {"identifier": identifier, "domain": "Övergripande", "purpose": "Syfte", "not": "",
                       "but": "", "means": "", "status": "Förslag", **attrs},
    }


async def _term(repo, term: str) -> GlossaryTermORM | None:
    async with repo._session_factory() as s:
        return (await s.execute(select(GlossaryTermORM).where(GlossaryTermORM.term == term))).scalar_one_or_none()


@pytest.mark.asyncio
async def test_export_och_import_pa_samma_installation_andrar_inget(repo):
    tag = uuid.uuid4().hex[:8]
    await repo.create_node(NodeCreate(type=NodeType.ARCHITECTURE_PRINCIPLE, **_principle(f"AP-{tag}", "Exportprincip")))
    await repo.update_target_architecture({"vision": f"Vision {tag}"}, updated_by="test")
    await cp.import_pack(repo, _pack(**{
        "glossary.json": [{"term": f"Begrepp {tag}", "definition": "Förklaring"}],
        "home-blocks.json": [{"key": f"block-{tag}", "body": "Text", "enabled": True}],
        "workgroups.json": [{"name": f"Grupp {tag}", "description": "Syfte"}],
        "gap-tasks.json": [{"gap_item_id": f"G-{tag}", "title": "Aktivitet", "due_date": "2027-01-31"}],
        "report-tags.json": [{"slug": f"tag-{tag}", "name": "Tagg", "reports": ["risk"]}],
        "document-metadata.json": [{"document_type": f"doc-{tag}", "entries": [{"label": "Ansvarig", "value": "X"}]}],
    }), apply=True)

    files = await cp.export_pack(repo, "export")
    assert {"principles.json", "target-architecture.json", "glossary.json", "workgroups.json"} <= set(files)
    assert any(p["attributes"]["identifier"] == f"AP-{tag}" for p in files["principles.json"])
    assert files["target-architecture.json"] == {"content": {"vision": f"Vision {tag}"}}

    results = await cp.import_pack(repo, files, apply=True)
    assert all(r.created == 0 and r.updated == 0 for r in results.values()), results


@pytest.mark.asyncio
async def test_import_skapar_och_uppdaterar_men_tar_inte_bort(repo):
    tag = uuid.uuid4().hex[:8]
    kvar = f"Kvar {tag}"
    await cp.import_pack(repo, _pack(**{"glossary.json": [
        {"term": kvar, "definition": "Finns inte i nästa paket"},
        {"term": f"Ändras {tag}", "definition": "Före"},
    ]}), apply=True)

    pack = _pack(**{
        "glossary.json": [{"term": f"Ändras {tag}", "definition": "Efter"}, {"term": f"Ny {tag}", "definition": "Ny"}],
        "principles.json": [_principle(f"AP-NY-{tag}", "Ny princip")],
    })

    # Torrkörning: räknar, skriver inget.
    torr = await cp.import_pack(repo, pack, apply=False)
    assert (torr["Ordlista"].created, torr["Ordlista"].updated) == (1, 1)
    assert torr["Arkitekturprinciper"].created == 1
    assert await _term(repo, f"Ny {tag}") is None
    assert (await _term(repo, f"Ändras {tag}")).definition == "Före"

    await cp.import_pack(repo, pack, apply=True)
    assert (await _term(repo, f"Ändras {tag}")).definition == "Efter"
    assert (await _term(repo, f"Ny {tag}")).definition == "Ny"
    assert await _term(repo, kvar) is not None
    principer = await repo.list_nodes(node_type=NodeType.ARCHITECTURE_PRINCIPLE.value, limit=10_000)
    assert [p.name for p in principer if p.attributes.get("identifier") == f"AP-NY-{tag}"] == ["Ny princip"]

    igen = await cp.import_pack(repo, pack, apply=True)
    assert all(r.created == 0 and r.updated == 0 for r in igen.values())


@pytest.mark.asyncio
async def test_principen_matchas_pa_identifierare(repo):
    tag = uuid.uuid4().hex[:8]
    await cp.import_pack(repo, _pack(**{"principles.json": [_principle(f"AP-{tag}", "Före")]}), apply=True)
    res = await cp.import_pack(
        repo, _pack(**{"principles.json": [_principle(f"AP-{tag}", "Efter", status="Beslutad")]}), apply=True,
    )
    assert (res["Arkitekturprinciper"].created, res["Arkitekturprinciper"].updated) == (0, 1)
    principer = [
        p for p in await repo.list_nodes(node_type=NodeType.ARCHITECTURE_PRINCIPLE.value, limit=10_000)
        if p.attributes.get("identifier") == f"AP-{tag}"
    ]
    assert len(principer) == 1 and principer[0].name == "Efter" and principer[0].attributes["status"] == "Beslutad"


@pytest.mark.asyncio
async def test_versionerat_dokument_far_historik(repo):
    content = {"inledning": f"Nuläge {uuid.uuid4().hex[:8]}"}
    await cp.import_pack(repo, _pack(**{"current-state-analysis.json": {"content": content}}), apply=True)
    assert (await repo.get_nulaagesanalys()).content == content
    async with repo._session_factory() as s:
        notes = (await s.execute(
            select(AuditLogORM.change_note).where(AuditLogORM.entity_type == "nulaagesanalys")
        )).scalars().all()
    assert "Importerat från innehållspaket" in notes


@pytest.mark.asyncio
async def test_arbetsgrupp_skapas_intern_och_aktiv(repo):
    namn = f"Grupp {uuid.uuid4().hex[:8]}"
    await cp.import_pack(repo, _pack(**{"workgroups.json": [{"name": namn, "description": "Syfte"}]}), apply=True)
    async with repo._session_factory() as s:
        ws = (await s.execute(select(WorkspaceORM).where(WorkspaceORM.name == namn))).scalar_one()
    assert (ws.kind, ws.visibility, ws.status) == ("arbetsgrupp", "internal", "active")


@pytest.mark.asyncio
@pytest.mark.parametrize("files", [
    {cp.MANIFEST: {"format": "något annat", "version": 1}},
    {cp.MANIFEST: {"format": cp.FORMAT, "version": 99}},
    {"glossary.json": []},
    _pack(**{"okand.json": []}),
])
async def test_fel_paket_avvisas(repo, files):
    with pytest.raises(cp.ContentPackError):
        await cp.import_pack(repo, files, apply=True)


def test_skriv_och_las_katalog(tmp_path):
    files = _pack(**{"glossary.json": [{"term": "Åtgärd", "definition": "Något som görs"}]})
    cp.write_pack(tmp_path / "paket", files)
    assert "Åtgärd" in (tmp_path / "paket" / "glossary.json").read_text(encoding="utf-8")
    assert cp.read_pack(tmp_path / "paket") == files
    with pytest.raises(cp.ContentPackError):
        cp.read_pack(tmp_path)


# ── Moduler och exempelpaket ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_avstangd_modul_hoppas_over(repo, monkeypatch):
    from app.config import settings

    tag = uuid.uuid4().hex[:8]
    monkeypatch.setattr(settings, "MODULES", "glossary")
    pack = _pack(**{
        "principles.json": [_principle(f"AP-AV-{tag}", "Avstängd")],
        "glossary.json": [{"term": f"Påslagen {tag}", "definition": "Ja"}],
    })
    res = await cp.import_pack(repo, pack, apply=True)
    assert res["Arkitekturprinciper"].skipped == "modulen Arkitekturstyrning är inte på"
    assert res["Ordlista"].created == 1 and res["Ordlista"].skipped is None
    principer = await repo.list_nodes(node_type=NodeType.ARCHITECTURE_PRINCIPLE.value, limit=10_000)
    assert not [p for p in principer if p.attributes.get("identifier") == f"AP-AV-{tag}"]
    assert "hoppas över – modulen Arkitekturstyrning" in cp._report(res, apply=True)


@pytest.mark.asyncio
async def test_export_anger_paketets_moduler(repo):
    files = await cp.export_pack(repo, "x")
    assert files[cp.MANIFEST]["modules"] == cp._pack_modules(files)


def test_exempelpaketen_foljer_med():
    packs = cp.bundled_packs()
    assert {"arkitekturstyrning", "ordlista", "samarbeten"} <= set(packs)
    for name in packs:
        files = cp.read_pack(cp.BUNDLED_DIR / name)
        cp.check_manifest(files[cp.MANIFEST])
        assert set(files) - {cp.MANIFEST} <= {k.file for k in cp.KINDS}, name
        assert files[cp.MANIFEST]["modules"] == cp._pack_modules(files), name
    assert cp.resolve_pack(cp.Path("ordlista")) == cp.BUNDLED_DIR / "ordlista"
    assert cp.resolve_pack(cp.Path("./finns-inte")) == cp.Path("./finns-inte")


@pytest.mark.asyncio
@pytest.mark.parametrize("name", ["arkitekturstyrning", "ordlista", "samarbeten"])
async def test_exempelpaketen_gar_att_lasa_in(repo, name):
    files = cp.read_pack(cp.BUNDLED_DIR / name)
    await cp.import_pack(repo, files, apply=True)
    igen = await cp.import_pack(repo, files, apply=True)
    assert all(r.created == 0 and r.updated == 0 and r.skipped is None for r in igen.values()), igen
    # Inga organisationsspecifika uppgifter i det som följer med appen.
    text = json.dumps(files, ensure_ascii=False).lower()
    assert "hfab" not in text and "halmstad" not in text
