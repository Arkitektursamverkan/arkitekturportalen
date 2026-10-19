"""Behörighet till Servrar – en tilldelning ger Läsare eller Förvaltare.

(Före behörighetsmodellen hette det Läsa/Redigera per användare; migreringen
0055 gör om dem till tilldelningar och kontraktet nedan gäller oförändrat.)

Kontraktet som låses här:
- Utan behörighet syns servrarna inte någonstans: inte i nodlistan, inte
  som enskild nod, inte i sök, inte i kopplingar och inte i CSV-exporten.
  Det gäller även anrop helt utan inloggning.
- Läsa: servrarna och kopplingarna till dem syns, men går inte att ändra.
- Redigera: servern går att lägga upp, ändra och koppla tjänster till –
  även för en vanlig användare som annars inte får redigera.
- En superanvändare utan behörighet kan varken se eller skapa servrar, men
  redigerar allt annat som förut.
- Admin har alltid full åtkomst.
"""
import pytest

from app.auth import issue_local_token
from app.config import settings


async def _serverbehorighet(repo, user_id, niva: str) -> None:
    roller = {r.key: r.id for r, _ in await repo.access.list_roles()}
    await repo.access.create_grant(
        {"principal_type": "user", "user_id": user_id, "role_id": roller["forvaltare" if niva == "edit" else "lasare"],
         "scope_type": "types", "node_types": ["Server"]},
        "test", "test",
    )


async def _anvandare(repo, epost: str, roll: str = "user", servrar: str | None = None) -> dict:
    user = await repo.create_local_user(name="Behörig Berit", email=epost, password_hash="x", role=roll)
    if servrar:
        await _serverbehorighet(repo, user.id, servrar)
    return {"Authorization": f"Bearer {issue_local_token(user)}"}


async def _server_med_tjanst(client, api_headers, namn: str) -> tuple[str, str, str]:
    server = await client.post("/api/v1/nodes", json={"type": "Server", "name": namn}, headers=api_headers)
    assert server.status_code == 201
    tjanst = await client.post(
        "/api/v1/nodes", json={"type": "TechnologyComponent", "name": f"IIS på {namn}"}, headers=api_headers,
    )
    edge = await client.post(
        "/api/v1/edges",
        json={"source_id": tjanst.json()["id"], "target_id": server.json()["id"], "type": "RUNS_ON"},
        headers=api_headers,
    )
    assert edge.status_code == 201
    return server.json()["id"], tjanst.json()["id"], edge.json()["id"]


@pytest.mark.asyncio
async def test_utan_behorighet_syns_servern_inte(client, api_headers, repo, monkeypatch):
    monkeypatch.setattr(settings, "ANONYMOUS_READ", True)
    server_id, tjanst_id, edge_id = await _server_med_tjanst(client, api_headers, "Larmserver – dold")
    utan = await _anvandare(repo, "utan.servrar@example.org", roll="superuser")

    for headers in (utan, {}):  # inloggad utan behörighet, och helt anonym
        noder = (await client.get("/api/v1/nodes", params={"limit": 10000}, headers=headers)).json()
        assert server_id not in {n["id"] for n in noder}
        assert tjanst_id in {n["id"] for n in noder}
        assert (await client.get(f"/api/v1/nodes/{server_id}", headers=headers)).status_code == 404
        sok = (await client.get("/api/v1/search", params={"q": "Larmserver – dold"}, headers=headers)).json()
        assert server_id not in {n["id"] for n in sok}
        kopplingar = (await client.get("/api/v1/edges", params={"source_id": tjanst_id}, headers=headers)).json()
        assert edge_id not in {e["id"] for e in kopplingar}
        assert (await client.get(f"/api/v1/edges/{edge_id}", headers=headers)).status_code == 404
        export = (await client.get("/api/v1/import/csv/export", headers=headers)).text
        assert "Server,Larmserver – dold" not in export

    # Superanvändaren redigerar annat som förut, men får inte skapa servrar.
    assert (await client.post("/api/v1/nodes", json={"type": "Server", "name": "Smygserver"}, headers=utan)).status_code == 403
    assert (await client.post("/api/v1/nodes", json={"type": "Application", "name": "Vanlig app"}, headers=utan)).status_code == 201


@pytest.mark.asyncio
async def test_lasa_ser_men_andrar_inte(client, api_headers, repo):
    server_id, tjanst_id, edge_id = await _server_med_tjanst(client, api_headers, "Larmserver – läs")
    lasare = await _anvandare(repo, "lasa.servrar@example.org", servrar="read")

    assert (await client.get(f"/api/v1/nodes/{server_id}", headers=lasare)).status_code == 200
    kopplingar = (await client.get("/api/v1/edges", params={"target_id": server_id}, headers=lasare)).json()
    assert [e["id"] for e in kopplingar] == [edge_id]

    assert (await client.patch(f"/api/v1/nodes/{server_id}", json={"name": "Nytt namn"}, headers=lasare)).status_code == 403
    assert (await client.delete(f"/api/v1/edges/{edge_id}", headers=lasare)).status_code == 403

    me = (await client.get("/api/v1/users/me", headers=lasare)).json()
    assert me["access"] == {"servers": "read"}
    assert me["type_access"]["Server"] == "read"
    assert me["type_access"]["Application"] == "read"


@pytest.mark.asyncio
async def test_redigera_later_vanlig_anvandare_underhalla_servrar(client, api_headers, repo):
    redaktor = await _anvandare(repo, "redigera.servrar@example.org", servrar="edit")
    tjanst = await client.post(
        "/api/v1/nodes", json={"type": "TechnologyComponent", "name": "SQL Server – redigera"}, headers=api_headers,
    )

    server = await client.post("/api/v1/nodes", json={"type": "Server", "name": "Larmserver – ny"}, headers=redaktor)
    assert server.status_code == 201
    edge = await client.post(
        "/api/v1/edges",
        json={"source_id": tjanst.json()["id"], "target_id": server.json()["id"], "type": "RUNS_ON"},
        headers=redaktor,
    )
    assert edge.status_code == 201
    assert (await client.delete(f"/api/v1/edges/{edge.json()['id']}", headers=redaktor)).status_code == 204

    # Behörigheten gäller bara servrar – rollen "user" får inte skapa annat.
    assert (await client.post("/api/v1/nodes", json={"type": "Application", "name": "Ej tillåten"}, headers=redaktor)).status_code == 403


@pytest.mark.asyncio
async def test_admin_ger_behorighet_och_har_alltid_full_atkomst(client, api_headers, repo):
    user = await repo.create_local_user(name="Tilldelad Tore", email="tilldelad@example.org", password_hash="x", role="user")
    headers = {"Authorization": f"Bearer {issue_local_token(user)}"}
    assert (await client.get("/api/v1/users/me", headers=headers)).json()["access"] == {"servers": "none"}

    roller = {r["key"]: r["id"] for r in (await client.get("/api/v1/access/roles", headers=api_headers)).json()}
    grant = await client.post(
        "/api/v1/access/grants",
        json={"principal_type": "user", "user_id": str(user.id), "role_id": roller["forvaltare"],
              "scope_type": "types", "node_types": ["Server"]},
        headers=api_headers,
    )
    assert grant.status_code == 201, grant.text
    assert (await client.get("/api/v1/users/me", headers=headers)).json()["access"] == {"servers": "edit"}

    assert (await client.delete(f"/api/v1/access/grants/{grant.json()['id']}", headers=api_headers)).status_code == 204
    assert (await client.get("/api/v1/users/me", headers=headers)).json()["access"] == {"servers": "none"}

    admin = await _anvandare(repo, "admin.servrar@example.org", roll="admin")
    assert (await client.get("/api/v1/users/me", headers=admin)).json()["access"] == {"servers": "edit"}


@pytest.mark.asyncio
async def test_servertjanster_har_samma_behorighet_som_servrar(client, api_headers, repo, monkeypatch):
    monkeypatch.setattr(settings, "ANONYMOUS_READ", True)
    """En servertjänst har inga egna tilldelningar – den följer Servrar."""
    server = await client.post("/api/v1/nodes", json={"type": "Server", "name": "DNS-server – tjänst"}, headers=api_headers)
    tjanst = await client.post(
        "/api/v1/nodes", json={"type": "ServerService", "name": "Extern DNS – test"}, headers=api_headers,
    )
    assert tjanst.status_code == 201, tjanst.text
    tjanst_id = tjanst.json()["id"]

    utan = await _anvandare(repo, "utan.tjanster@example.org", roll="superuser")
    lasare = await _anvandare(repo, "lasa.tjanster@example.org", servrar="read")
    redaktor = await _anvandare(repo, "redigera.tjanster@example.org", servrar="edit")

    assert (await client.get(f"/api/v1/nodes/{tjanst_id}", headers=utan)).status_code == 404
    assert (await client.get(f"/api/v1/nodes/{tjanst_id}")).status_code == 404
    assert (await client.post("/api/v1/nodes", json={"type": "ServerService", "name": "Smyg"}, headers=utan)).status_code == 403

    assert (await client.get(f"/api/v1/nodes/{tjanst_id}", headers=lasare)).status_code == 200
    assert (await client.patch(f"/api/v1/nodes/{tjanst_id}", json={"name": "Nytt"}, headers=lasare)).status_code == 403

    koppling = await client.post(
        "/api/v1/edges",
        json={"source_id": tjanst_id, "target_id": server.json()["id"], "type": "RUNS_ON"},
        headers=redaktor,
    )
    assert koppling.status_code == 201, koppling.text
    me = (await client.get("/api/v1/users/me", headers=redaktor)).json()
    assert me["type_access"]["ServerService"] == "edit"
