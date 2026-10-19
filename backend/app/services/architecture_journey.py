"""Arkitekturresan's built-in steps and the stored ones.

The default walks through the governance documents (Arkitekturstyrning);
an installation without that module sees none of those steps until an
editor adds its own (the web app hides steps whose page is switched off)."""
from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.architecture_journey import ArchitectureJourneyORM
from app.schemas.architecture_journey import JourneyContent, JourneyRead

DEFAULT: dict[str, Any] = {
    "title": "IT-arkitektur, en pågående resa",
    "intro": (
        "Arkitekturarbetet är inte ett projekt med ett slutdatum — det är en kontinuerlig process där vi hela "
        "tiden lär oss mer om var vi är, var vi vill komma och hur vi bäst tar oss dit."
    ),
    "steps": [
        {
            "id": "nulaege", "title": "Nulägesanalys", "subtitle": "Var är vi idag?", "icon": "assessment",
            "body": (
                "En kartläggning av det befintliga IT-landskapet: applikationer, processer, informationsflöden och "
                "tekniska komponenter. Nulägesanalysen ger oss en gemensam bild av vad vi har idag — vad som "
                "fungerar väl, vad som är åldersstiget och var det finns beroenden vi behöver förstå innan vi kan "
                "planera nästa steg."
            ),
            "link_path": "/nulaagesanalys", "link_label": "Öppna Nulägesanalys", "document": "nulaagesanalys",
        },
        {
            "id": "malarkitektur", "title": "Målarkitektur", "subtitle": "Vart vill vi?", "icon": "flag",
            "body": (
                "En beskrivning av det önskade framtida tillståndet för organisationens IT-miljö. Målarkitekturen "
                "pekar ut riktningen för hur applikationer, data och teknik ska samverka för att stödja "
                "verksamhetens mål — på kort och lång sikt. Den ger oss en gemensam målbild att styra mot."
            ),
            "link_path": "/target-architecture", "link_label": "Öppna Målarkitektur",
            "document": "target_architecture",
        },
        {
            "id": "gap", "title": "GAP-analys", "subtitle": "Vad saknas för att komma dit?", "icon": "analytics",
            "body": (
                "Genom att jämföra nuläget med målbilden identifierar vi GAP:en — de skillnader och brister som "
                "behöver adresseras. GAP-analysen ligger till grund för prioritering av insatser och investeringar "
                "och hjälper oss att fokusera på det som ger störst nytta på vägen mot målarkitekturen."
            ),
            "link_path": "/gap-analys", "link_label": "Öppna GAP-analys", "document": "gap_analys",
        },
        {
            "id": "principer", "title": "Arkitekturprinciper", "subtitle": "Hur ska vi fatta beslut längs vägen?",
            "icon": "gavel",
            "body": (
                "Principer som vägleder oss i arkitekturbeslut och säkerställer att vi rör oss i rätt riktning. De "
                "fungerar som en kompass när vi möter vägval och hjälper oss att fatta konsekventa, välgrundade "
                "beslut över tid — oavsett vem som är inblandad i beslutsprocessen."
            ),
            "link_path": "/architecture-principles", "link_label": "Öppna Arkitekturprinciper",
            "document": "principles",
        },
    ],
}


async def read(session_factory: async_sessionmaker[AsyncSession]) -> JourneyRead:
    async with session_factory() as s:
        row = await s.get(ArchitectureJourneyORM, 1)
    if row is None:
        return JourneyRead(content=JourneyContent.model_validate(DEFAULT), is_default=True)
    return JourneyRead(
        content=JourneyContent.model_validate(row.content), is_default=False,
        updated_at=row.updated_at, updated_by=row.updated_by,
    )


async def save(
    session_factory: async_sessionmaker[AsyncSession], content: JourneyContent | None, updated_by: str | None,
) -> JourneyRead:
    """Store the journey, or with content=None go back to the default."""
    async with session_factory() as s:
        row = await s.get(ArchitectureJourneyORM, 1)
        if content is None:
            if row is not None:
                await s.delete(row)
        else:
            data = content.model_dump(mode="json")
            if row is None:
                s.add(ArchitectureJourneyORM(id=1, content=data, updated_by=updated_by))
            else:
                row.content, row.updated_by = data, updated_by
        await s.commit()
    return await read(session_factory)
