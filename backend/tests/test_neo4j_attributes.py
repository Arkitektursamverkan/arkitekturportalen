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
