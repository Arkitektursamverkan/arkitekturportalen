"""Optional modules: parts of the app an installation may switch on or off.

The core (architecture objects, views, reports, solution sketches,
administration, import and sync) is always there. Each module below is
chosen at installation (MODULES in the environment, comma-separated keys or
"all"; empty = core only) and can be switched on and off afterwards by an
admin (Administration → Organisation, stored in ea_org_settings).

A switched-off module's API answers 404 and the web app hides it, but its
tables and data stay: switching it on again brings everything back. The
tables exist in every installation, so a module needs no migration to be
switched on.
"""
from __future__ import annotations

from dataclasses import dataclass

from fastapi import HTTPException, status


@dataclass(frozen=True)
class Module:
    key: str
    name: str
    description: str
    # Needs the Integration Platform: the module's data reaches the portal only
    # through it (Arkitekten's process diagrams). Without the platform the
    # module cannot be switched on – not at installation, not by an admin.
    requires_platform: bool = False


MODULES: tuple[Module, ...] = (
    Module("calendar", "Verksamhetskalender",
           "Verksamhetens händelser och frysperioder i en gemensam kalender, med förändringsloggen."),
    Module("collaboration", "Samarbeten",
           "Uppdrag och arbetsgrupper med egen kalender, sidor, möten och uppgifter."),
    Module("governance", "Arkitekturstyrning",
           "Arkitekturprinciper och principdokumentet, nulägesanalys, målarkitektur och GAP-analys med handlingsplan."),
    Module("glossary", "Ordlista",
           "Organisationens begrepp och förfrågningar om nya begrepp."),
    Module("surveys", "Enkäter",
           "Enkäter till användarna, Mina enkäter och publicerade enkätrapporter."),
    Module("changes", "Förändringsstatistik",
           "Hur arkitekturen förändras över tid: tillagda, ändrade och borttagna objekt per BDAT-lager och objekttyp, med grafer och filter."),
    Module("arkitekten", "Arkitekten (processritaren)",
           "Processbilder ur Arkitekten på processkartan, publicering ur Arkitekten och en länk till verktyget.",
           requires_platform=True),
)

KEYS: tuple[str, ...] = tuple(m.key for m in MODULES)
_BY_KEY = {m.key: m for m in MODULES}


def platform_configured() -> bool:
    """INTEGRATION_PLATFORM_URL is set, or the platform has registered itself."""
    from app.platform_access import configured_url

    return bool(configured_url())


def unavailable_reason(key: str) -> str | None:
    """Why a module cannot be switched on in this installation, or None."""
    m = _BY_KEY.get(key)
    if m and m.requires_platform and not platform_configured():
        return f"{m.name} kräver Integrationsplattformen, som inte är installerad."
    return None


def parse(value: str) -> list[str]:
    """MODULES as written in the environment → known keys in catalogue order.
    "all" means every module; unknown keys are ignored (see unknown())."""
    wanted = {p.strip().lower() for p in value.split(",") if p.strip()}
    if "all" in wanted:
        return list(KEYS)
    return [k for k in KEYS if k in wanted]


def unknown(value: str) -> list[str]:
    """Keys in an environment value that name no module, to warn about at startup."""
    return sorted({p.strip().lower() for p in value.split(",") if p.strip()} - set(KEYS) - {"all"})


def enabled(key: str) -> bool:
    from app.services import org_settings
    return key in org_settings.current().modules and unavailable_reason(key) is None


def requires(key: str):  # type: ignore[no-untyped-def]
    """Router dependency: 404 while the module is switched off, as if the
    endpoints did not exist."""
    if key not in KEYS:
        raise ValueError(f"Unknown module {key}")

    async def _check() -> None:
        if not enabled(key):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Modulen är inte aktiverad")

    return _check
