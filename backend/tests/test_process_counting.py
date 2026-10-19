"""Which processes the overlap and gap analyses count."""
import pytest

from app.schemas.node import NodeCreate, NodeUpdate


async def _process(repo, name, **attributes):
    return await repo.create_node(NodeCreate(type="Process", name=name, attributes=attributes))


@pytest.mark.asyncio
async def test_gaps_count_only_published_real_processes(repo):
    await _process(repo, "PC Godkänd", workflow_state="APPROVED")
    await _process(repo, "PC Utan läge")
    await _process(repo, "PC Redigerbar", workflow_state="EDITABLE")
    hidden = await _process(repo, "PC Dold")
    await repo.update_node(hidden.id, NodeUpdate(admin_hidden=True))
    marked = await _process(repo, "PC Struktur")
    await repo.update_node(marked.id, NodeUpdate(is_structure=True))
    parent = await _process(repo, "PC Förälder")
    await _process(repo, "PC Barn", parent_id=str(parent.id))

    names = {p["name"] for p in (await repo.get_gaps())["unsupported_processes"]}

    assert {"PC Godkänd", "PC Utan läge", "PC Barn"} <= names
    assert not names & {"PC Redigerbar", "PC Dold", "PC Struktur", "PC Förälder"}
