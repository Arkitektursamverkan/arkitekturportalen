"""CSV-import av servrar och servertjänster: namnet är nyckeln och kolumnen
servers ger RUNS_ON-kopplingar."""
from __future__ import annotations

import uuid

import pytest

from app.api.v1.csv_import import _parse_unified_csv, _server_names



def _fil(text: str) -> dict:
    return {"file": ("fil.csv", text.encode("utf-8"), "text/csv")}


async def _noder(repo, typ: str, prefix: str):
    return [n for n in await repo.list_nodes(node_type=typ, limit=100_000) if n.name.startswith(prefix)]


def test_server_names():
    assert _server_names("A, B;C | a\nD") == ["A", "B", "C", "D"]
    assert _server_names("") == []


def test_unified_maps_server_columns_to_attributes():
    text = "[NODES]\ntype,name,description,hostname,environment,servers\nServer,S1,,s1.example.org,Produktion,\nServerService,DNS,,,Test,S1\n"
    nodes, _, errors = _parse_unified_csv(text.encode())
    assert errors == []
    server, service = nodes
    assert server["id"] == "server:s1"
    assert server["attributes"] == {"hostnamn": "s1.example.org", "miljö": "Produktion"}
    assert service["id"] == "serverservice:dns"
    assert service["attributes"] == {"miljö": "Test"}


async def test_servers_import_updates_by_name(client, repo, api_headers):
    p = f"T{uuid.uuid4().hex[:6]}"
    text = f"name;description;hostname;server_type;operating_system;environment;location;responsible\n{p}-DB;Databas;db.example.org;Virtuell;Linux;Produktion;Nord;IT\n"
    r = await client.post("/api/v1/import/csv/servers", files=_fil(text), headers=api_headers)
    assert r.status_code == 200, r.text
    assert (r.json()["created"], r.json()["updated"]) == (1, 0)

    text2 = text.replace("Linux", "Windows").replace(f"{p}-DB;", f"{p.lower()}-db;")
    r = await client.post("/api/v1/import/csv/servers", files=_fil(text2), headers=api_headers)
    assert (r.json()["created"], r.json()["updated"]) == (0, 1)

    [server] = await _noder(repo, "Server", p.lower()) or await _noder(repo, "Server", p)
    assert server.attributes["operativsystem"] == "Windows"
    assert server.attributes["hostnamn"] == "db.example.org"
    assert server.attributes["miljö"] == "Produktion"


async def test_server_services_connect_to_servers(client, repo, api_headers):
    p = f"T{uuid.uuid4().hex[:6]}"
    servers = f"name,description\n{p}-A,\n{p}-B,\n"
    r = await client.post("/api/v1/import/csv/servers", files=_fil(servers), headers=api_headers)
    assert r.json()["created"] == 2

    services = (
        "name,description,vendor,component_type,hosting_type,environment,lifecycle_status,responsible,servers\n"
        f'{p}-DNS,Namn,Microsoft,Nät,Egen drift,Produktion,I drift,IT,"{p}-A, {p.lower()}-b"\n'
        f"{p}-Backup,,,,,,,,{p}-Saknas\n"
    )
    r = await client.post("/api/v1/import/csv/server-services", files=_fil(services), headers=api_headers)
    body = r.json()
    assert body["created"] == 2 and body["connections"] == 2
    assert body["errors"] == [f"{p}-Backup: servern '{p}-Saknas' finns inte"]

    [dns] = [n for n in await _noder(repo, "ServerService", p) if n.name.endswith("-DNS")]
    assert dns.attributes == {
        "leverantör": "Microsoft", "komponenttyp": "Nät", "driftform": "Egen drift",
        "miljö": "Produktion", "livscykelstatus": "I drift", "ansvarig": "IT",
    }
    targets = {e.target_id for e in await repo.list_edges(source_id=dns.id, edge_type="RUNS_ON")}
    assert {n.id for n in await _noder(repo, "Server", p)} == targets

    # Samma fil igen: inget nytt objekt och ingen dubbel koppling.
    r = await client.post("/api/v1/import/csv/server-services", files=_fil(services), headers=api_headers)
    assert (r.json()["created"], r.json()["updated"], r.json()["connections"]) == (0, 2, 0)
    assert len(await repo.list_edges(source_id=dns.id, edge_type="RUNS_ON")) == 2


async def test_templates(client):
    for entity, header in (("servers", "name,description,hostname"), ("server-services", "name,description,vendor")):
        r = await client.get(f"/api/v1/import/csv/template/{entity}")
        assert r.status_code == 200
        assert r.text.startswith(header)
