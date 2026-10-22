# Färdplan: Arkitekturportalen

EA-applikationen och Integrationsplattformen ska kunna installeras av fler
organisationer än den som byggde dem, och partner ska kunna bidra till koden.
Den här filen beskriver vad som är beslutat, vilka etapper arbetet är uppdelat
i och var vi står.

## Beslut

| Fråga | Beslut |
|---|---|
| Produktnamn | **Arkitekturportalen** (EA-applikationen och Integrationsplattformen tillsammans) |
| Licens | **EUPL-1.2** |
| Var koden ligger | GitHub-organisationen **Arkitektursamverkan** |
| Synlighet | Först ett privat repo med inbjudna partner, publikt senare |
| Ägarskap | HFAB är huvudägare: beslutar om inriktning och mergar |

## Arbetssätt

- En pull request per steg, grön CI innan merge till `main`.
- Efter varje merge driftsätts ändringen hos HFAB och verifieras innan nästa
  steg påbörjas. HFAB:s installation ska fungera som förut efter varje steg.
- Ny kod är generell: organisationsspecifika värden hämtas från miljövariabler
  eller från inställningar i databasen, aldrig hårdkodade.

## Etapper

### 1. Frikoppla installationen ✅ klar

- Inställningar för webbläsaren (Entra ID m.m.) skrivs till `/config.js` när
  webbcontainern startar i stället för att byggas in i avbilden.
- API-nyckeln skickas inte längre till webbläsaren.
- API:t vägrar starta i produktion med tomma eller exempelhemligheter
  (gäller både EA-applikationen och Integrationsplattformen).
- Generell `docker-compose.yml`; installationsspecifika tillägg (TLS, portar,
  nginx) ligger i egna compose-överlägg. `.env.example` beskriver alla
  inställningar.
- Gemensamt Docker-nät `arkitekturportalen` mellan EA-applikationen och
  Integrationsplattformen.

### 2. Organisationsinställningar och varumärke ✅ klar

1. Inställningstabell och adminsida under Administration: organisationens namn
   och kortnamn, logotyp, profilfärg, tillåtna e-postdomäner och avdelningar
   för förändringsloggen. Nuvarande miljövariabler blir standardvärden.
2. Gränssnittet och PDF-rapporterna läser namn, logotyp och färg från
   inställningarna i stället för hårdkodade värden.
3. Arbetsgruppens uppdrag (i dag hårdkodad text) blir redigerbart.
4. Anonym läsning blir en inställning, avstängd som standard. Endpoints som
   hämtar adresser eller tar emot importfiler kräver alltid inloggning.

### 3. Innehållspaket ✅ klar

Organisationsspecifikt innehåll (exempeldata, principer, begrepp m.m.) flyttas
ut ur databasmigreringarna till importerbara innehållspaket. En ny installation
startar tom; neutrala exempelpaket kommer per modul i etapp 4.

1. Paketformat och kommandon för export och import (se
   [INNEHALLSPAKET.md](INNEHALLSPAKET.md)). ✅
2. Migreringarna lägger bara in tomma dokumentstommar och neutrala
   standardvärden; organisationsspecifikt innehåll finns bara i paket. ✅
   (Historiken innehåller fortfarande det gamla innehållet; den rensas i etapp 6.)

### 4. Moduler ✅ klar

Delar av appen är valfria moduler. De väljs vid installationen
(miljövariabeln `MODULES`) och kan sedan slås på och av av en administratör
under Administration → Organisation. Utan val får en ny installation bara
kärnan. En avstängd modul syns inte och dess API svarar 404, men dess data
finns kvar; slås den på igen är allt som förut.

| Modul | Innehåll |
|---|---|
| Verksamhetskalender | Kalendern, förändringsloggen, frysperioder |
| Samarbeten | Uppdrag och arbetsgrupper (med egen kalender, sidor, möten, uppgifter) |
| Arkitekturstyrning | Arkitekturprinciper och principdokumentet, nulägesanalys, målarkitektur, GAP-analys med handlingsplan |
| Ordlista | Ordlistan och begreppsförfrågningar |
| Enkäter | Enkäter, Mina enkäter, publicerade enkätrapporter |

Kärnan är arkitekturobjekten och kopplingarna, vyer och rapporter,
lösningsskisser, administration samt import och synk.

1. Modulregister och inställningen, API:t spärras per modul. ✅
2. Webben följer modulerna: meny, router, genvägar, startsida, toppfält och
   notiser; modulvalet under Administration → Organisation. ✅
3. Korsberoenden: notiser, principanalysen i lösningsskisser, enkätrapporter
   och rapporttaggar, rapporterna Principer och GAP-uppföljning, principtypen
   bland objekten. ✅
4. Innehållspaket per modul och neutrala exempelpaket i repot; demodatan
   (`/seed`) görs neutral. ✅ (Demodatan var redan neutral: påhittade
   standardsystem och processer.)
5. Arkitekturresan skrivs om så att den passar andra organisationer (den hör
   inte till någon modul). ✅ Redaktörer redigerar rubrik, ingress och steg;
   ett steg kan länka till en sida i portalen och visa dokumentstämplar.
6. Administratören kan ordna vänstermenyn: grupper, rubriker och ordning. ✅
   (Administration → Meny; blocken som byggs av innehållet kan flyttas men inte
   delas upp.)

### 5. Paketering ✅ klar

- ✅ Färdiga containeravbilder publiceras i GitHub Container Registry vid
  release: en tagg `vX.Y.Z` kör CI och publicerar `arkitekturportalen-api/-web`
  (och `integrationsplattformen-api/-web` från plattformens repo). Versionen syns
  i `/health` och under Administration → Organisation.
- ✅ Driftrepot `arkitekturportalen-drift`: ett compose-projekt med färdiga
  avbilder, plattformen som valbar profil och Caddy för TLS (Let's Encrypt,
  eget certifikat eller intern CA).
- ✅ Installationsguiden `installera.sh`: värdnamn och TLS, organisation och
  domäner, Entra ID och/eller lokal administratör, moduler, plattformen och
  exempelpaket. Skapar hemligheterna och plattformens nyckel för portalen.
- ✅ `uppgradera.sh` (backup först, kontroll av versionen), `backup.sh`,
  `aterstall.sh` och dokumentationen i driftrepots README.
- ✅ Provinstallation från de publicerade avbilderna, och HFAB kör samma
  avbilder.

### 6. Publicering i Arkitektursamverkan

- ✅ Koden ligger i Arkitektursamverkan med ren historik: `arkitekturportalen`,
  `integrationsplattformen` och `arkitekturportalen-drift`, med avbilderna i
  `ghcr.io/arkitektursamverkan`. Repona är privata med inbjudna partner till
  att börja med.
- ✅ Migreringarna är ihopslagna till en baslinje (`0066`: schemat och
  grunddatan ur `backend/alembic/baslinje/`, identiska med de gamla 66
  migreringarna). En databas som stod på 0066 står redan på baslinjen.
  `0067` ger alla installationer samma schema, och CI kontrollerar att
  migreringarna och modellerna inte glider isär (`scripts/kontrollera_schema.py`).
- ✅ HFAB:s driftkonfiguration, backupskript och innehållspaket ligger i ett
  eget privat repo; produktrepona innehåller inget som bara gäller HFAB.

### 7. Öppet för bidrag

Gemensamt för alla fyra repona (portalen, plattformen, driftrepot och
Arkitekten), så att samma regler gäller överallt.

- ✅ `CODEOWNERS`: huvudägaren granskar och mergar.
- ✅ Riktlinjer för bidrag (`CONTRIBUTING.md`) och säkerhetsrapporter
  (`SECURITY.md`).
- ✅ Versionerade releaser (semver) och ändringslogg (`CHANGELOG.md`).
- ✅ Dependabot föreslår uppdateringar av beroenden och avbilder varje vecka.
- Skyddad `main` med krav på granskning och grön CI: kräver GitHub Team (eller
  publika repon) – tills dess gäller regeln i `CONTRIBUTING.md`.
