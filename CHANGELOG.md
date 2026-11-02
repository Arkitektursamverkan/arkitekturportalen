# Ändringslogg

Ändringarna i Arkitekturportalen, nyast först. Versionerna följer
[semantisk versionering](https://semver.org/lang/sv/): en ny huvudversion
när något tas bort eller byter betydelse, en ny mindre version för nya
funktioner, en ny korrigering för rättelser.

## Ej släppt

- (inget än)

## 0.5.0 – 2026-11-02

- **PDF-visare** under fliken Filer: ögat (*Visa PDF*) öppnar PDF:en i ett fönster i portalen, som går att flytta (titelraden), ändra storlek på (nedre högra hörnet), förstora (dubbelklick) och stänga (Esc). Appen bakom går att använda medan det är öppet, och läge och storlek sparas till nästa gång. Fungerar för uppladdade PDF:er och för länkar till SharePoint och OneDrive: filen hämtas med Microsoft Graph i den inloggade användarens namn, så man ser bara det man har behörighet till i SharePoint. Kräver den delegerade Graph-behörigheten `Files.Read.All` med administratörsmedgivande i portalens appregistrering. Länkar som inte är en PDF får ett meddelande och en knapp för att öppna dem där de finns.
- Neo4j: attributen sparas som JSON-sträng. Tidigare kraschade skrivningar med `CypherTypeError` när attributen var en dict; äldre värden läses som förut.
- Beroenden uppdaterade: FastAPI 0.162, uvicorn 0.54, SQLAlchemy 2.1.6, alembic 1.20.1, pydantic 2.14.2, MSAL 5.27, axios 1.21, cytoscape 3.34 och nginx 1.31 i webbens Docker-avbild.
## 0.4.0 – 2026-10-26

- Ny modul **Förändringsstatistik** (`changes`): rapporten Förändringsstatistik under Rapporter visar hur arkitekturen förändras – tillagda, uppdaterade och borttagna objekt per BDAT-lager (verksamhet, information, applikation, teknik) och objekttyp mellan två datum. Grafer över förändringar och antal objekt över tid, per objekttyp och per ändrat fält; klick i graferna borrar ned (en stapel öppnar perioden, en typ eller ett fält filtrerar). Filter på händelse, källa och vem som ändrat, sorterbara tabeller per objekt och per händelse, CSV-export. Arkiverade objekt räknas som borttagna, återställda som tillagda. Alla inloggade ser rapporten, men bara de objekt de får se; vem som ändrat visas för administratörer. Underlaget är revisionsloggen (`GET /api/v1/change-statistics`).
- Med modulen på tömmer *Töm revisionsloggen* inte längre objekthistoriken, som statistiken räknas från.
- Revisionsloggen sparar vem som skapat, ändrat eller tagit bort ett objekt (tidigare tomt för ändringar i portalen), och synkroniseringens arkiveringar och processträd står på Synkronisering.

## 0.3.2 – 2026-10-26

- Inloggningen: MSAL initieras färdigt innan appen renderas eller något anropar den, så felet `uninitialized_public_client_application` (synligt på inloggningssidan utan Entra-inställningar) är borta. Inloggningsfel från Microsoft visas på svenska med felkod i stället för att krascha.
- MSAL lyft till `@azure/msal-browser` 5 och `@azure/msal-react` 5. Webbplatsens rot är MSAL 5:s omdirigeringsbrygga, så appregistreringen behöver ingen ny omdirigeringsadress; `index.html` skickas nu med `Cache-Control: no-store`.
- Frontendtester med Vitest (`npm test`), även i CI.
- Beroenden uppdaterade: alembic 1.20, bcrypt 5 (lösenord längre än 72 byte kapas som förut, så befintliga lösenord fungerar), neo4j-drivrutinen 6, structlog 26 och anyio 4.15.
- Frontendens beroenden uppdaterade: Vite 8 (Rolldown) med `@vitejs/plugin-react` 6, Vitest 4, react-router-dom 7 och zustand 5.
- Backendens beroenden uppdaterade: SQLAlchemy 2.1 (med `[asyncio]`, som numera behövs för greenlet), FastAPI 0.156, httpx 0.28, pydantic-settings 2.16.1 och ruff 0.17 med en egen `ruff.toml`.
- Borttagningsloggen sparar tidpunkten med tidszon; tidigare lästes den som serverns lokala tid.

## 0.3.1 – 2026-10-23

- Beroenden uppdaterade: React 19 (med MSAL 4), MUI 9, ESLint 10 med typescript-eslint 8 (flat config), TypeScript 6, i18next 26 med react-i18next 17, recharts 3, Node 24 LTS och nginx 1.29 i webbens Docker-avbild, WeasyPrint 70 för PDF-exporterna, pydantic 2.14, pydantic-settings 2.16, asyncpg 0.32, pyjwt 2.15, python-multipart 0.0.32, jinja2 3.1.6, pytest 9, pytest-cov 7, mypy 2.4 och nyare GitHub Actions. TypeScript 7 väntar.

## 0.3.0 – 2026-10-23

- Modulen Arkitekten (`arkitekten`): processbilderna och länken till Arkitekten (`ARKITEKTEN_URL`). Kräver Integrationsplattformen.
- Familjen `affarsprocess` från Arkitekten 0.2; det äldre namnet `2c8` läses som förut.
- Fliken Flödesschema heter Processbild.

## 0.2.2 – 2026-10-22

- Fliken Systemprocesser på en applikation: systemprocesser som publicerats ur Arkitekten visas hos applikationen.

## 0.2.1 – 2026-10-19

- Första versionen i Arkitektursamverkan: organisationsinställningar, innehållspaket, moduler, färdiga avbilder och ren historik.
