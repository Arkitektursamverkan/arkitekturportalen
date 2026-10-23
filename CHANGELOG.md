# Ändringslogg

Ändringarna i Arkitekturportalen, nyast först. Versionerna följer
[semantisk versionering](https://semver.org/lang/sv/): en ny huvudversion
när något tas bort eller byter betydelse, en ny mindre version för nya
funktioner, en ny korrigering för rättelser.

## Ej släppt

- Beroenden uppdaterade: React 19 (med MSAL 4), MUI 9, ESLint 10 med typescript-eslint 8 (flat config), TypeScript 6, i18next 26 med react-i18next 17, recharts 3, Node 24 LTS och nginx 1.29 i webbens Docker-avbild, WeasyPrint 70 för PDF-exporterna, pydantic 2.14, pydantic-settings 2.16, asyncpg 0.32, pyjwt 2.15, python-multipart 0.0.32, jinja2 3.1.6, pytest 9, pytest-cov 7, mypy 2.4 och nyare GitHub Actions. TypeScript 7 väntar.

## 0.3.0 – 2026-10-23

- Modulen Arkitekten (`arkitekten`): processbilderna och länken till Arkitekten (`ARKITEKTEN_URL`). Kräver Integrationsplattformen.
- Familjen `affarsprocess` från Arkitekten 0.2; det äldre namnet `2c8` läses som förut.
- Fliken Flödesschema heter Processbild.

## 0.2.2 – 2026-10-22

- Fliken Systemprocesser på en applikation: systemprocesser som publicerats ur Arkitekten visas hos applikationen.

## 0.2.1 – 2026-10-19

- Första versionen i Arkitektursamverkan: organisationsinställningar, innehållspaket, moduler, färdiga avbilder och ren historik.
