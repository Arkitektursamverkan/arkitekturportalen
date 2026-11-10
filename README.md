# Arkitekturportalen — EA-applikationen

A clickable, visual EA tool integrating external sources (SharePoint systems, 2C8 processes), with interactive graph-based views, process hierarchy, CSV import/export, and overlap/gap analysis.

## Tech stack

| Layer | Choice |
|---|---|
| Backend | Python 3.14 + FastAPI 0.115 + SQLAlchemy 2.0 async |
| Database | PostgreSQL 16 (default) · Neo4j 5 (opt-in) |
| Frontend | React 18 + TypeScript 5 + Vite 5 + MUI v5 + Cytoscape.js |
| Container | Docker + docker-compose |
| CI | GitHub Actions |

---

## Installing for an organisation

Run it from the ready-made images with the
[arkitekturportalen-drift](https://github.com/Arkitektursamverkan/arkitekturportalen-drift)
repository: `./installera.sh` asks for host name, TLS, sign-in, modules and
example content, and `./uppgradera.sh` upgrades with a backup first. The quick
start below builds from source, for development.

## Quick start

### 1. Clone and configure

```bash
git clone https://github.com/Arkitektursamverkan/arkitekturportalen.git
cd arkitekturportalen
cp .env.example .env
```

Fill in `.env`. At least `API_KEY`, `LOCAL_AUTH_SECRET` and `POSTGRES_PASSWORD`
(`openssl rand -hex 32` each): with `APP_ENV=production`, the default, the API
refuses to start with empty or placeholder secrets. For a quick local try-out,
set `APP_ENV=development` instead.

Nothing installation-specific is built into the images. Entra settings reach
the browser through `/config.js`, written when the web container starts. TLS,
extra ports or a custom nginx config go in your own compose overlay, listed in
`COMPOSE_FILE` in `.env`.

Running the Integration Platform on the same server? Create a shared network
once with `docker network create arkitekturportalen`, add
`deploy/integration-platform.yml` to `COMPOSE_FILE` here and the platform's
`deploy/shared-network.yml` to its own. The portal then finds the platform at
`http://integration-platform:8000/api/v1` without any further settings.

### 2. Start with Docker Compose

```bash
docker compose up --build
```

- **Web UI**: http://localhost:3000 (`WEB_PORT`)
- **API docs**: http://localhost:3000/api/docs
- **Health**: http://localhost:3000/api/v1/health

### 3. Load demo data

Either click **"Ladda demodata"** on the Home page, or:

```bash
curl -X POST http://localhost:8000/api/v1/seed \
  -H "X-Api-Key: dev-secret-key"
```

This runs the mock imports (SharePoint + 2C8) and creates all owned nodes and relationships.

---

## Switching to Neo4j

```bash
EA_DB_ENGINE=neo4j docker compose --profile neo4j up --build
```

The frontend is unchanged — the DAL swaps the adapter automatically.

---

## Local development (without Docker)

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt

# Start PostgreSQL locally (or point DATABASE_URL at your instance)
export DATABASE_URL="postgresql+asyncpg://ea_user:ea_pass@localhost:5432/ea_db"
export API_KEY="dev-secret-key"
export EA_DB_ENGINE=postgres

alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev       # starts at http://localhost:5173
```

Vite proxies `/api` to `http://localhost:8000` automatically.

---

## Run tests

```bash
cd backend
pytest tests/ -v --cov=app
```

Tests require a running PostgreSQL instance. The DATABASE_URL is read from the environment or defaults to `postgresql+asyncpg://ea_user:ea_pass@localhost:5432/ea_db_test`.

---

## Manual imports (API)

```bash
# Import Applications from SharePoint (mock)
curl -X POST "http://localhost:8000/api/v1/import/sharepoint?mode=mock" \
  -H "X-Api-Key: dev-secret-key"

# Import Processes from 2C8 (mock)
curl -X POST "http://localhost:8000/api/v1/import/2c8?mode=mock" \
  -H "X-Api-Key: dev-secret-key"
```

---

## Rapporter

All reports live under **Rapporter** in the sidebar.

### Tags

A report carries one or more tags, and the listing is grouped by tag by
default — A–Ö is one click away and the choice is remembered per browser. A
report with two tags appears under both headings; an untagged one lands under
"Övrigt".

The seeded tags are the BDAT domains the Domän menu already uses, widened with
the themes that cut across domains:

| Tagg | Rapporter |
|---|---|
| Verksamhet | Process–Applikation, Överlapp & Luckor, Verksamhetspåverkan |
| Applikation | Applikationsportfölj, Redundansanalys, Överlapp & Luckor, Integrationsanalys, Leverantörsberoende, Livscykelstatus |
| Information | Dataklassificering, Behandlingsregister (GDPR) |
| Teknik | Driftformsöversikt, Teknisk skuld, Teknikleverantörer, Teknikportfölj |
| Säkerhet & kontinuitet | Riskregister, Verksamhetspåverkan, NIS2-efterlevnad, Behandlingsregister, Autentisering |
| Ekonomi | Kostnadsöversikt |
| Styrning & utveckling | EA-mognad, Ägaröversikt, Strategisk färdplan, GAP-analys progress |
| Datakvalitet | Manuellt tillagda objekt, Flaggade objekt |
| Enkäter | Publicerade enkätrapporter — varje ny upplaga taggas vid publicering |

### Renaming

An admin renames a report from the pencil next to its tags — one name, shown
in both languages, in the menu and as the page heading. What an organisation
calls a report is an editorial decision, not a translation.

A built-in report keeps its translated name underneath and can be handed back
with **Återställ**. A published survey edition owns its `name` column — its
CSV and PDF filenames read it — so renaming one writes to the edition itself
and there is no original to restore.

The heading comes from `<ReportTitle fallback={…} />`, which each report page
renders inside its own `<Typography>`; a component rather than a hook so it
survives pages that return early.

### Tags

Every report page shows its own tags top right. Admins retag from the label
icon there, and reach **Hantera taggar** (rename, recolour, reorder, add,
delete) from the same menu. Deleting a tag only untags its reports.

The bar is rendered once by `AppShell` for whichever report the route points
at — the report pages are independent components with no shared shell, so a
new report gets its tag bar without touching it.

API under `/api/v1/report-tags` — readable by any signed-in user (the sidebar
needs it on every page), writable by admins.

### Adding a report

`frontend/src/config/reportCatalog.tsx` is the single source of truth for the
built-in reports: the sidebar, the tag bar and the Home-shortcut registry all
read it. A new report needs one entry there plus a route in
`frontend/src/router/index.tsx`.

Tags link to a report by a stable key rather than a foreign key, because the
built-in reports are React pages with no database rows: `"portfolio"` for a
built-in report (the path segment after `/reports/`), `"published:<uuid>"` for
a published survey edition.

---

## Graph views

All explorer views are accessible from the collapsible **Utforskare** (Explorer) menu in the sidebar.

| View | URL | Description |
|---|---|---|
| Processer | `/processes?id=<uuid>` | Hierarchical process tree with E2E graph (Process → Apps → InfoObjects → Sources → Tech) |
| Applikationslandskap | `/systems?id=<uuid>` | Application-centric view showing all connected nodes |
| Informationsobjekt | `/info-objects?id=<uuid>` | Information object and its related apps, sources, and processes |
| Informationskällor | `/info-sources?id=<uuid>` | Information source and its connected nodes |
| Teknikkomponenter | `/tech-components?id=<uuid>` | Technology component and the applications that run on it |
| Integrationer | `/landscape` | All applications with INTEGRATES_WITH edges, filterable by category |
| Överlapp & Luckor | `/overlap-gaps` | Analysis: overlaps and missing coverage |

### Process hierarchy

Processes support a parent–child hierarchy via the `parent_id` attribute. In the Process Explorer, top-level (root) processes are displayed at the top, with child processes nested and expandable. Parent processes can be assigned when creating or editing a process, and are preserved through CSV import/export.

### Connections

The Connections page (`/connections`, admin only) provides:
- **Table view**: searchable list of all connections with inline replace and delete
- **Visual view**: interactive Cytoscape graph — click a source node, then a target to create connections
- **Filters**: both views share node type and edge type multi-select filters to narrow down large datasets

---

## CSV import & export

### Export

`GET /api/v1/import/csv/export` — downloads all nodes and connections as a single unified CSV file that can be re-imported directly.

### Import

Two import modes available on the Import page (`/import`):

- **Complete (unified)**: single CSV with `[NODES]` and `[CONNECTIONS]` sections covering all types
- **Per type**: separate CSV files for each node type (Processes, Applications, etc.)

The unified CSV format:

```
[NODES]
id,type,name,description,category,vendor,owner,classification,system,frequency,parent_id
proc-001,Process,Ekonomiprocesser,Övergripande,...,,,,,,,
proc-002,Process,Fakturahantering,Ta emot...,...,,,,,,dagligen,proc-001

[CONNECTIONS]
source,target,type
app-001,proc-001,SUPPORTS
```

Features: auto-detect delimiter (comma/semicolon), UTF-8 and Latin-1 encoding, upsert on re-import, `parent_id` round-trip for process hierarchy.

---

## Architecture — node & edge metamodel

### Node types

| Type | Source | Colour |
|---|---|---|
| Process | 2C8 | Green |
| Application | SharePoint | Blue |
| InformationObject | Owned | Orange |
| InformationSource | Owned | Purple |
| TechnologyComponent | Owned | Red |

### Edge types

| Edge | Direction | Meaning |
|---|---|---|
| SUPPORTS | App → Process | App supports this process |
| USES | Process → InfoObject | Process uses this information |
| HANDLES | App → InfoObject | App manages this information |
| REALIZES | InfoSource → InfoObject | Module/source is the realization |
| CONTAINS | App → InfoSource | App contains this data source |
| RUNS_ON | App → TechComponent | App runs on this infrastructure |
| INTEGRATES_WITH | App → App | Integration; `attributes.direction` is `SOURCE_TO_TARGET` (→), `BIDIRECTIONAL` (↔) or `TARGET_TO_SOURCE` (←) |

---

## DAL — switching database engines

The `GraphRepository` ABC in `backend/app/dal/graph_repository.py` defines all operations. Both `PostgresRepository` and `Neo4jRepository` implement it. The active implementation is selected in `app/main.py` lifespan based on `EA_DB_ENGINE`.

No service or API code imports from the concrete adapters.

---

## Authentication

Write operations (POST/PATCH/DELETE) require the header:
```
X-Api-Key: <your API_KEY>
```

Read operations are open (no key needed). Set `API_KEY` in `.env`.

---

## IT-arkitekturuppdrag (workspaces)

A workspace is a collaboration surface for one assignment — pages (Markdown),
meeting notes started from a template, uploaded files, a discussion board and a
task list — with its own member list. Reached from **IT-arkitekturuppdrag** in the sidebar (`/uppdrag`),
API under `/api/v1/workspaces`.

Access is decided per workspace, not by the global role:

| Role in the workspace | May do |
|---|---|
| Ägare (owner) | Manage members, settings and all content |
| Medlem (member) | Read and write content |
| Läsare (reader) | Read only |

Admins get owner rights everywhere. A workspace is **private** by default —
non-members get 404, so its existence isn't leaked — or **internal**, which any
signed-in user may read but only members may write. Creating a workspace
requires admin or superuser; the creator becomes its owner, and an ordinary
`user` can own the workspaces they are made owner of.

Uploaded files are stored as bytea in `ea_workspace_files` (max 25 MB each), so
they follow the existing pg_dump-based backup and restore.

---

## Language

The UI defaults to **Swedish**. Toggle to English via the language button in the top bar (EN/SV). The preference is stored in `localStorage`.

---

## Postman collection

Import `docs/ea-poc.postman.json` into Postman. Set the `baseUrl` variable to `http://localhost:8000/api/v1`.

---

## Seed data overview

**10 Applications** (from SharePoint mock): SAP S/4HANA, Workday, ServiceNow, Microsoft 365, Salesforce, Azure AD, Power BI, Jira, Confluence, DocuSign

**10 Processes** (from 2C8 mock): Employee Onboarding, Invoice Processing, IT Service Request, Budget Planning, Customer Acquisition, Payroll Run, Vendor Procurement, IT Change Management, Performance Review, Financial Reporting

**Owned nodes**: 10 InformationObjects, 7 InformationSources, 6 TechnologyComponents

**Relationships**: ~50 edges covering all edge types, including deliberate overlaps (Employee Onboarding supported by both Workday and Microsoft 365) and gaps (Performance Review Data has no InformationSource realization).

## Licence

Arkitekturportalen is free software under the [EUPL-1.2](LICENSE) (European
Union Public Licence), which is available in all official EU languages,
including Swedish.

The built frontend (the `arkitekturportalen-web` image) bundles
`cytoscape-svg`, which is under GPL-3.0, and is therefore distributed as a
whole under GPL-3.0 – which the EUPL-1.2's list of compatible licences allows.
The source code in this repository stays under EUPL-1.2. See [NOTICE](NOTICE),
which also lists the other dependencies under copyleft licences.
