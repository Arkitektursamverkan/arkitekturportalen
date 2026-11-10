"""Neo4j kan inte lagra map-värden som egenskaper, så attributes sparas som JSON-sträng."""
from __future__ import annotations

from app.dal.neo4j_repository import _dump_attrs, _load_attrs, _record_to_node_read


def test_attribut_sparas_som_strang_och_lases_tillbaka():
    attrs = {"x": 1, "nested": {"y": [1, 2]}, "namn": "å"}
    raw = _dump_attrs(attrs)
    assert isinstance(raw, str)
    assert _load_attrs(raw) == attrs


def test_tomma_och_saknade_attribut():
    assert _dump_attrs(None) == "{}"
    assert _load_attrs(None) == {}
    assert _load_attrs("") == {}
    assert _load_attrs({"gammal": True}) == {"gammal": True}


def test_nod_lases_med_json_attribut():
    node = _record_to_node_read({
        "id": "00000000-0000-0000-0000-000000000001",
        "type": "Application",
        "name": "A",
        "attributes": '{"x": 1}',
    })
    assert node.attributes == {"x": 1}


async def test_sokning_skickar_sokordet_som_text_inte_som_regex():
    """Sökordet går som parameter till CONTAINS – aldrig in i ett =~-uttryck."""
    from app.dal.neo4j_repository import SEARCH_NODES_CYPHER, Neo4jRepository

    calls: list[tuple[str, dict]] = []

    class _Result:
        def __aiter__(self):
            return self

        async def __anext__(self):
            raise StopAsyncIteration

    class _Session:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def run(self, cypher, **params):
            calls.append((cypher, params))
            return _Result()

    class _Driver:
        def session(self):
            return _Session()

    repo = Neo4jRepository.__new__(Neo4jRepository)
    repo._driver = _Driver()  # type: ignore[assignment]
    farligt = "(a+)+$.*"
    assert await repo.search_nodes(farligt, limit=5) == []
    cypher, params = calls[0]
    assert cypher == SEARCH_NODES_CYPHER
    assert "=~" not in cypher and "CONTAINS toLower($q)" in cypher
    assert params == {"q": farligt, "limit": 5}
