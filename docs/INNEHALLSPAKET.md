# Innehållspaket

Ett innehållspaket är en organisations eget innehåll i EA-applikationen,
sparat som filer i stället för i databasmigreringarna. Med ett paket kan
innehållet flyttas mellan installationer, sparas i versionshantering och
läsas in i en ny installation.

## Vad ett paket innehåller

Ett paket är en katalog med `pack.json` och en JSON-fil per sorts innehåll.
En fil som saknas betyder att paketet inte rör den sortens innehåll, så ett
paket kan innehålla bara en ordlista eller bara principerna.

| Fil | Innehåll | Modul | Matchas på |
|---|---|---|---|
| `principles.json` | Arkitekturprinciper | Arkitekturstyrning | identifierare (t.ex. `A-1`) |
| `principle-document.json` | Principdokumentets avsnitt | Arkitekturstyrning | avsnittets nyckel |
| `target-architecture.json` | Målarkitektur | Arkitekturstyrning | (ett dokument) |
| `current-state-analysis.json` | Nulägesanalys | Arkitekturstyrning | (ett dokument) |
| `gap-analysis.json` | GAP-analys | Arkitekturstyrning | (ett dokument) |
| `gap-tasks.json` | Handlingsplanens aktiviteter | Arkitekturstyrning | GAP-punkt och rubrik |
| `glossary.json` | Ordlista | Ordlista | begrepp |
| `workgroups.json` | Arbetsgrupper (namn och syfte, inte deltagare) | Samarbeten | namn |
| `home-blocks.json` | Startsidans block, t.ex. arbetsgruppernas uppdrag | kärnan | nyckel |
| `home-banners.json` | Startsidans meddelanden | kärnan | text |
| `report-tags.json` | Rapporttaggar och vilka rapporter de sitter på | kärnan | slug |
| `architecture-journey.json` | Arkitekturresan: rubrik, ingress och steg | kärnan | (en sida) |
| `document-metadata.json` | Sidfotsuppgifter i PDF-dokumenten | kärnan | dokumenttyp |

Innehåll för en modul som inte är på hoppas över vid import, och importen
säger det. Slå på modulen under Administration → Organisation och importera
igen.

`pack.json` anger formatet och paketets namn:

```json
{ "format": "arkitekturportalen.content-pack", "version": 1, "name": "exempel", "description": "",
  "modules": ["governance"] }
```

`modules` anger vilka moduler paketet har innehåll för. Exporten fyller i det.

## Exempelpaket

Med appen följer neutrala exempelpaket att utgå från, ett per modul med
innehåll (i `backend/content_packs/`):

| Paket | Modul | Innehåll |
|---|---|---|
| `arkitekturstyrning` | Arkitekturstyrning | sju allmänna principer, principdokumentets inledning, stommar med vägledning för målarkitektur och nulägesanalys |
| `ordlista` | Ordlista | grundbegrepp inom enterprise-arkitektur |
| `samarbeten` | Samarbeten | tre exempel på arbetsgrupper och en text om deras uppdrag |

Verksamhetskalendern och Enkäter har inget exempelinnehåll: kalendern fylls
av organisationens egna händelser och enkäterna skapas i appen.

```sh
docker compose exec api python -m app.services.content_pack list
docker compose exec api python -m app.services.content_pack import ordlista
```

Arkitekturobjekt (processer, system, information …) ingår inte. De flyttas
med export och återställning under Administration → Datarensning.

## Exportera

Kör i API-containern och kopiera ut katalogen:

```sh
docker compose exec api python -m app.services.content_pack export /tmp/paket --name min-organisation
docker compose cp api:/tmp/paket ./paket
```

## Importera

```sh
docker compose cp ./paket api:/tmp/paket
docker compose exec api python -m app.services.content_pack import /tmp/paket --dry-run
docker compose exec api python -m app.services.content_pack import /tmp/paket
```

`--dry-run` visar vad som skulle skapas och uppdateras utan att skriva något.

Importen lägger till och uppdaterar men tar aldrig bort. Varje post matchas på
nyckeln i tabellen ovan och skrivs bara om den skiljer sig, så samma paket
två gånger ändrar ingenting andra gången. Principdokumentet, målarkitekturen
och analyserna skrivs med anteckningen "Importerat från innehållspaket" i
sin versionshistorik.

Ett paket kan innehålla personuppgifter, till exempel ansvariga i
handlingsplanen. Granska paketet innan det delas med andra organisationer.
