# Ändringslogg

Ändringarna i Arkitekturportalen, nyast först. Versionerna följer
[semantisk versionering](https://semver.org/lang/sv/): en ny huvudversion
när något tas bort eller byter betydelse, en ny mindre version för nya
funktioner, en ny korrigering för rättelser.

## Ej släppt

## 0.33.1 – 2026-11-24

- **Komponenter heter vad de är.** En applikation som innehåller en annan visas som **Har komponent** – i valet av relationstyp under *Kopplingar*, när man skapar ett objekt, i grafernas linjer och i tabellen över kopplingar. Under *Lägg till objekt* (+) i systemvyn går det åt båda hållen: *Applikation (Har komponent)* och *Applikation (Ingår i)*. Lagras som förut (`CONTAINS`); ingen migrering.
- **Rättat:** *Lägg till objekt* visade `nodeTypes.CustomObject` i stället för *Eget objekt*.

## 0.33.0 – 2026-11-24

- **En applikation kan vara en komponent i en annan.** Kopplingstypen *Innehåller* går nu även mellan två applikationer – t.ex. *EA-portalen innehåller Ljuset i huset* – under *Kopplingar*, när man skapar ett objekt och i grafen (*Integrerar med* är fortfarande förvalet). Systemvyn för komponenten visar också applikationen den ingår i. En koppling som skulle göra en applikation till en del av sig själv, direkt eller längre ner, avvisas (409). Ingen migrering.

## 0.32.1 – 2026-11-24

- **Startsidan varnar bara dagen innan och samma dag.** Bannern om verksamhetskritiska händelser visas från dagen före händelsen (»i morgon«) och medan den pågår – inte längre en vecka i förväg. Bara frontend; ingen migrering.

## 0.32.0 – 2026-11-23

- **Gemensam inloggning.** Ny organisationsinställning under *Administration → Organisation*: med den påslagen loggar portalen in av sig själv med Microsoft när webbläsaren redan har en Microsoft-session – utan knappen *Logga in med Microsoft* – och Arkitekten (från 0.20.0) och installationens andra appar gör likadant (de läser inställningen ur `GET /installation` respektive `/org-settings/public`). Av = varje app har sin egen inloggningsknapp. Standard från miljön: `SHARED_LOGIN` (av). Ingen automatisk inloggning efter *Logga ut* i fliken; högst ett automatiskt försök per minut. Migrering 0077.

- **Grupper från Entra ID.** En grupp under *Behörigheter → Grupper* kan kopplas till en Entra-grupp (objekt-id). Dess medlemmar läggs då inte upp för hand: vid varje inloggning med Microsoft sätts användaren in i, eller tas ut ur, de kopplade grupperna efter token's gruppanspråk. Grupper utan koppling fungerar som förut. App-registreringen ska skicka gruppanspråket (Token configuration → groups claim, t.ex. "Security groups"); en token med för många grupper ändrar ingenting. Migrering 0076 (ny kolumn `entra_group_id`).

## 0.31.0 – 2026-11-23

- **Klassningen styr vem som ser bilderna från Arkitekten.** En process, systemprocess eller systemskiss vars informationsklassning kräver en *skyddsklass* (läggs upp i Arkitekten 0.19.0 under *Inställningar → Informationsklassning*) syns bara för den som har klassen på objektet bilden är publicerad på – annars finns bilden inte (404), varken i listan eller som djuplänk. Under *Behörigheter → Roller* står varje skyddsklass som bilderna kräver som en egen rad, *Se bilder klassade …*, och delas ut med en roll på allt, en objekttyp eller ett enskilt objekt, som andra rättigheter. En skyddsklass ger inte själv rätt att se objektet – den visar klassade bilder på objekt man redan ser. Administratörer ser allt; en nivå som inte längre finns i Arkitektens modell ser bara administratörer. Oklassade bilder och nivåer utan skyddsklass är öppna som förut. *Kontrollera åtkomst* visar skyddsklasserna. Kräver integrationsplattformen 0.14.0 (som för vidare klassningen). Ingen migrering.

## 0.30.0 – 2026-11-23

- **Bildrutan säger vilken version och klassning bilden har.** På fliken *Systemskiss* står skissens version i rutan över bilden (t.ex. »version 1.0 (fastslagen)«) – den version Arkitekten (från 0.18.0) skickar, som är den senast fastslagna. För alla bilder från Arkitekten – processer, systemprocesser och skisser – visas informationsklassningen som ett märke i rutan när installationen har slagit på klassning och valt att visa den i exporten. Märket syns också när rutan är minimerad. Bara frontend; ingen migrering. Äldre scener visar ingenting nytt.

## 0.29.0 – 2026-11-20

Innehåller också det som står under 0.28.0, som aldrig släpptes som egen version – migrering 0075 körs alltså vid den här uppgraderingen.

- **Fältens namn går att byta.** Under *Administration → Listor* finns kortet **Fältens namn**: en administratör ger objekttypernas fält de namn organisationen använder, till exempel *Avtalsägare* i stället för *Systemägare* på applikationer. Alla fält går att byta namn på – standardfälten, CSV-mallens fält och det objekten bär med sig från en synk. Bara namnet som visas ändras: värdet ligger kvar under samma nyckel, så rapporter, synkar och tidigare importer fungerar som förut. Det egna namnet visas i objektets panel, när ett objekt skapas, i ändringsförslag, i Ägaröversikten och i förändringsstatistiken. Ett tömt namn ger tillbaka standardnamnet. Ingen migrering.
- **CSV-mallarna följer fältens namn.** Mallen per objekttyp, den samlade mallen och exporten har det egna namnet som kolumnrubrik, och importen läser både det egna namnet, det tidigare kolumnnamnet och fältets nyckel – en mall som fylldes i före namnbytet går fortfarande att läsa in. I den samlade filen får en kolumn som flera objekttyper delar det egna namnet bara när typerna är överens. Ett namn som redan är en annan kolumn i mallen går inte att spara.
- **Applikationsmallen har samma fält som applikationen.** Mallen saknade Avdelning, Systemförvaltare, Systemadministratör och de planerade datumen, och kolumnerna `application_owner`, `lifecycle_stage` och `hosting` hamnade under egna nycklar som varken panelen eller rapporterna läste. De fyller nu Systemägare, Status och Driftform. Detsamma gäller processernas ägare, kategori och frekvens, informationsobjektens klassificering och informationskällornas typ och klassificering: det som läses in visas i objektets standardfält. Det som en tidigare import lade under de gamla nycklarna ligger kvar och följer med i exporten i rätt kolumn.
- **Den samlade importen lägger värdena där sidorna läser dem.** Den sparade applikationers, processers och informationsobjekts värden under kolumnnamnen (`vendor`) i stället för fältens nycklar (`leverantör`), så en export som lästes in igen fyllde inte fälten.
- **Felbesked vid avvisade uppgifter.** När API:t avvisade ett fält visade sidorna »[object Object]« eller bara att det inte gick att spara; nu visas skälet.

## 0.28.0 – 2026-11-20

- **Systemskisserna har en egen behörighet.** Vem som ser en systemskiss på en server styrs nu under *Behörigheter*, med den nya behörigheten **Se objektets systemskisser** (`sketches.read`). Den läggs i en roll och delas ut som alla andra – till alla, en global roll, en grupp eller en person, för alla servrar eller en enda – och kräver ingen administratörsroll. Att få se servern räcker inte längre för att se skissen. **Vid uppgradering:** rollen Förvaltare får behörigheten (migrering 0075), så de som förvaltar servrar ser skisserna som förut; den som bara är Läsare på en server ser inte längre skissen förrän den får en roll med behörigheten. Administratörer ser allt som tidigare.
- **Kopplingsförslagets uppgifter följer med kopplingen.** En rad i en egen rapport av typen Kopplingsförslag kan bära värden för kopplingens egna fält (`fält`, nycklar som börjar med `x_`) – motiveringen, till exempel, i ett eget fält som installationen lagt på kopplingstypen. Värdena skrivs på kopplingen när **Koppla** skapar den och syns sedan i kopplingens panel. Ett värde för ett fält som kopplingstypen inte har lämnas utanför. En koppling som redan finns rörs inte.
- **Egna fält visar hela sin text.** Ett längre värde i ett eget fält rann ut ur objektets eller kopplingens panel på en enda rad. Fältet bryter nu texten och växer med den, och texten har samma storlek som panelens övriga uppgifter.

## 0.27.0 – 2026-11-20

- **Maximera bilden.** Processbilder, systemprocesser och systemskisser har en knapp bredvid *Anpassa till fönstret* som låter bilden ta hela webbläsarfönstret; samma knapp eller Esc lämnar tillbaka det. Bilden anpassas till den nya ytan, och systemskissens lagerrad och valet av bild följer med – man kan byta lager utan att lämna det maximerade läget.

## 0.26.1 – 2026-11-20

- **Rutan med bildens namn och beskrivning går att flytta, skala och minimera.** Den låg fast uppe till vänster över processbilder och systemskisser och kunde skymma det man ville se. Dra i rubriken för att flytta den, i hörnet för att ändra storlek, och tryck på pilen för att visa bara namnet. Valet minns i webbläsaren.

## 0.26.0 – 2026-11-20

- **Systemskiss på en server.** En systemskiss som publicerats på en server från Arkitekten (0.17.0 eller senare) visas under den nya fliken *Systemskiss* på servern, bredvid Dokument och Anteckningar. Skissens lager – typiskt ett per applikation – väljs i en rad över bilden, och bilden kan laddas ner som SVG. Fliken finns bara på servrar som har en skiss, och den som inte får se servern får inte se skissen. Skisserna kommer samma väg som processbilderna (Integrationsplattformens Arkitekten-koppling med familjen *alla*); ingen ny tabell och ingen migrering.

## 0.25.0 – 2026-11-19

- **Egna rapporter.** En installation kan läsa in en egen rapport som data – resultatet av en engångsgenomgång, till exempel – i stället för att den byggs in i produkten. Rapporten läses in med `PUT /api/v1/custom-reports/{nyckel}` (administratör eller API-nyckeln), visas under Rapporter och är synlig bara för administratörer om inget annat anges (`admin_only`). För den som inte får se den finns den inte: varken i menyn eller på sin adress. Ny tabell `ea_custom_reports` (migrering 0074).
- **Rapporttypen Kopplingsförslag.** Varje rad föreslår en koppling mellan två objekt, med grupp, säkerhet och motivering. Inget kopplas när rapporten läses in: en administratör väljer **Koppla** (kopplingen skapas, som om den dragits för hand) eller **Avstå** per rad, eller för en hel grupp efter en bekräftelse. Ett beslut går att ångra; en koppling som redan skapats står då kvar och tas bort på objektet. Rapporten filtreras på status, grupp, kopplingstyp, säkerhet och objekttyp, går att söka i och grupperas på grupp, från-objekt, till-objekt, kopplingstyp eller säkerhet. En rad vars koppling redan finns visas som ”Finns redan”, och besluten står kvar när rapporten läses in på nytt. Formatet står i `backend/app/api/v1/custom_reports.py`.

## 0.24.0 – 2026-11-19

- **Processbilden säger var den kommer ifrån.** En processbild som en integration läser in i Arkitekten från ett annat system visar det under rubriken – ”Kommer från … – ritad automatiskt i Arkitekten” – tillsammans med om synken är aktiv, när processen senast hämtades och när den hämtas nästa gång. Är synken avstängd står det, och bilden visar då läget när den senast hämtades. Uppgiften kommer med processbilden (Arkitekten 0.15.0, Integrationsplattformen 0.13.0); synkens läge frågar portalen plattformen om (`GET /arkflows/{id}/synk`, kräver `INTEGRATION_PLATFORM_ADMIN_KEY`). Kan plattformen inte svara står ingenting om synken. Bilder ritade för hand visar ingenting nytt.
- **Flagga en process.** Flikarna Processbild och Graf i processvyn har en flaggknapp. Vid processbilden väljer man mellan **Processbilden är fel** (bilden visar inte processen som den är beskriven) och **Avvikelse i process** (det som görs skiljer sig från det som är beskrivet); vid grafen finns bara avvikelsen. Knappen visar hur många flaggor processen har, och rutan listar dem med svar. Det är vanliga kvalitetsflaggor: de står i objektpanelen och i rapporten Flaggade objekt, där en redaktör svarar på dem. De två nya flaggtyperna kan bara sättas på en process. Flaggning kräver inloggning.

## 0.23.0 – 2026-11-18

- **Verksamhetskalendern: filtrera på ansvarig och se vilka poster som hör ihop.** Ovanför kalendern finns ett nytt filter, **Ansvarig / kontakt**, där du väljer en eller flera ansvariga; då visas bara deras poster, både i månadsvyn och i Kommande 30 dagar. Filtret står kvar när du bläddrar mellan månader. Varje ansvarig har dessutom en egen färgad prick som står först i posten, så att man ser vilka poster som har samma ansvarig. Pricken finns också i filtret, i listan över kommande händelser (tillsammans med namnet) och i postens detaljruta, och namnet står i rutan som visas när man håller pekaren över en post. Stor och liten bokstav spelar ingen roll: ”Ekonomi” och ”ekonomi” räknas som samma. Poster utan ansvarig har ingen prick, och filtret visas först när någon post har en ansvarig. Förändringarna i IT-miljön påverkas inte av filtret.

## 0.22.0 – 2026-11-17

- **Verksamhetskalendern kan fyllas från Integrationsplattformen.** I importguiden och i synkprofilerna finns ett nytt mål, **Verksamhetskalender**, bredvid objekttyperna. Varje post i flödet blir en fastställd heldagshändelse på sitt datum. Mappa namn och datum (ÅÅÅÅ-MM-DD), och om du vill beskrivning, antal dagar, ansvarig och avdelningar. Med en synkprofil hålls kalendern efter: ändrat datum flyttar händelsen, och en post som försvinner i källan tas bort ur kalendern. Det en redaktör lägger till i portalen – kopplade objekt, ändringsstopp, övriga beroenden – ligger kvar, medan fälten från källan skrivs över vid nästa körning. Händelsen visar att den hämtas från en integration. En omkörning utan ändringar skriver ingenting i ändringsloggen, och en källa som svarar tomt tömmer inte kalendern. **Kräver databasmigrering** (0073: två nya kolumner på kalenderhändelserna), som körs automatiskt vid start.

## 0.21.0 – 2026-11-17

- **Ägaröversikten: sök per person.** Överst i rapporten finns fältet **Sök person**. Välj en person och rapporten visar alla roller personen har: ett objekt per rad med typ och roller, och en summering per roll. Sökningen går över alla objekttyper och alla rollfält – systemägare, systemförvaltare, systemadministratör, ägare, dataägare, teknisk ägare, ansvarig med flera – och ett fält med flera namn (åtskilda med komma, semikolon eller snedstreck) räknas för var och en. Arkiverade objekt är inte med. Översikten kan också grupperas efter **Systemadministratör**. Bara webbdelen är ändrad; ingen databasändring.

## 0.20.0 – 2026-11-17

- **Förändringsstatistiken räknar netto per objekt.** Ett objekt som lagts till och tagits bort igen under perioden – eller tagits bort och kommit tillbaka, hur många gånger som helst – är ingen förändring av landskapet, men varje vändning räknades som en tillagd och en borttagen. Nu räknas varje objekt en gång, efter hur perioden slutade för det: nytt, borttaget eller oförändrat. Rutan **Fram och tillbaka** visar hur många objekt som saknar nettoeffekt och hur många händelser som därför inte räknas. Växeln **Netto per objekt / Alla händelser** bredvid filtren ger det gamla sättet att räkna tillbaka; den styr rutorna, graferna, tabellerna och CSV-exporten. Nettoförändringen är densamma i båda lägena. Gäller också historiken bakåt. Ingen databasändring.
- **Rättat: synkningen arkiverade och återställde "Processer utan prefix" varannan körning.** Behållaren för processer utan prefix hölls bara vid liv de körningar då en process saknade förälder; körningen efter arkiverades den, och nästa körning tömde processernas förälder och skapade om den. I statistiken blev det en tillagd och en borttagen process för varje par av körningar. Behållaren ligger nu kvar så länge källan har någon process som hör hemma i den, och arkiveras först när den är tom.

## 0.19.0 – 2026-11-16

- **Enkäter: lista över dem som inte svarat.** Under *Mottagare* på en enkät finns knappen **Inte svarat**. Den visar vilka som fått enkäten men inte svarat – en rad per person med namn och e-post, och hur många av personens objekt som är obesvarade när enkäten går ut per objekt. Adresserna kan kopieras till Outlooks Till-fält, och listan kan laddas ner som CSV för Excel. Den som inte fått enkäten utskickad är inte med. Ingen databasändring.

## 0.18.0 – 2026-11-13

- **Egna fält på objekt och kopplingar.** Under *Administration → Listor → Egna fält* lägger en administratör fält på de inbyggda objekttyperna och på kopplingstyperna – en kort text eller ett av några val, till exempel *Integrationstyp* på *Integrerar med*. Fälten fylls i i panelen som öppnas när man klickar på ett objekt eller en koppling, av den som får ändra det. En synk skriver inte över värdena, och i förändringsstatistiken visas fälten med sina namn. Nya ändpunkter: `PATCH /api/v1/nodes/{id}/fields` och `PATCH /api/v1/edges/{id}/fields`. Ingen databasändring.
- **Rättat: detaljpanelen hängde kvar.** Rutan med ett objekts eller en kopplings uppgifter låg kvar öppen när man gick vidare till en annan sida i menyn. Den stängs nu när man lämnar sidan.
- **Rättat: riktningen stod två gånger på en koppling.** Under riktningsknapparna visades också den råa raden *direction BIDIRECTIONAL*. Den är borta.

## 0.17.0 – 2026-11-12

- **CSV-import av servrar och servertjänster.** Två nya typer under *Import → CSV → Per typ*, med mallar: **Servrar** (hostnamn, servertyp, operativsystem, miljö, placering, ansvarig) och **Servertjänster** (leverantör, komponenttyp, driftform, miljö, livscykelstatus, ansvarig). Kolumnen `servers` i servertjänstfilen tar servrarnas namn, kommaseparerade, och ger kopplingarna *körs på* (RUNS_ON); en server som inte finns, eller flera med samma namn, rapporteras utan att stoppa importen. För de här två typerna är **namnet nyckeln**: importeras filen igen uppdateras objekten med samma namn (oavsett skiftläge), och befintliga kopplingar läggs inte till igen. Den samlade filen (*Allt i en fil*) tar också typerna `Server` och `ServerService`, och deras kolumner sparas under samma fältnamn som sidorna Servrar och Servertjänster visar.

## 0.16.2 – 2026-11-11

- **Förändringsstatistiken räknar inte systemfälten.** `parent_id`, `parent_name`, `parent_prefix` och `workflow_state` hålls uppdaterade av systemet (synkningen skriver om dem nästan varje körning) och fick uppdateringarna att se många gånger fler ut än de var. De visas inte längre bland de ändrade fälten, och en sparning som bara rört dem räknas inte som en uppdatering. Gäller också historiken bakåt.

## 0.16.1 – 2026-11-11

- **Säkerhet:** `PUT /api/v1/installation/plattform` godtar nu bara `X-Installation-Secret` (`SYNC_WEBHOOK_SECRET`), inte API-nyckeln. API-nyckeln har även Arkitekten, och den anmälda adressen får plattformens administratörsnyckel. Adressen måste dessutom vara intern – privat IP-adress, loopback eller ett tjänstnamn utan punkt – så att nyckeln aldrig kan skickas ut på internet. Plattformen (0.10.0) anmäler sig redan så, så inget behöver ändras i installationen.

## 0.16.0 – 2026-11-10

- **Plattformen anmäler sin adress till portalen** (`PUT /api/v1/installation/plattform`, med `X-Installation-Secret` = `SYNC_WEBHOOK_SECRET` eller API-nyckeln). Portalen använder den när `INTEGRATION_PLATFORM_URL` inte är satt – modulen Arkitekten, processbilderna, import och synkprofiler. Satt `INTEGRATION_PLATFORM_URL` vinner alltid, så compose-installationer påverkas inte. På Render behöver portal-api därmed ingen referens till plattform-api: med referenser åt båda hållen slutade varje Blueprint-synk med fel.

## 0.15.1 – 2026-11-10

- Portalen lär sig sin adress bara ur API-förfrågningar som kommit genom webben (`X-Forwarded-Proto`) och lyckats. På Render lärde den sig annars den privata tjänstens eget namn (`portal-api-….onrender.com`) ur Renders kontroll av en ny tjänst.

## 0.15.0 – 2026-11-10

- **Installationen konfigurerar sig själv** – för Render, där inget ska behöva skrivas in efter starten:
  - Portalen lär sig sin publika adress ur förfrågningarna genom webben (Host och proxyns `X-Forwarded-Proto`) när `PDF_APP_BASE_URL` inte är satt – PDF-länkarna och Arkitektens länk tillbaka. Interna namn (utan punkt, IP-adresser, localhost) lärs aldrig, och en egen domän ersätts inte av `*.onrender.com`. Ny tabell `ea_installation` (migrering 0072).
  - Arkitekten anmäler sin adress (`PUT /api/v1/installation/arkitekten`, API-nyckeln), och webben länkar dit när `ARKITEKTEN_URL` inte är satt på webben.
  - `GET /api/v1/installation` ger installationens andra tjänster portalens och Arkitektens adresser och Entra-uppgifterna – med API-nyckeln (Arkitekten) även nya `ENTRA_CLIENT_SECRET`, med `X-Installation-Secret` = `SYNC_WEBHOOK_SECRET` (plattformen) allt utom den. Entra skrivs därmed in på portal-api och ingen annanstans.
  - Webben hämtar Entra-uppgifterna och Arkitektens adress från nya publika `GET /api/v1/client-config` när `/config.js` lämnar dem tomma. Webbens egna värden vinner.
  - Webbens nginx skickar proxyns `X-Forwarded-Proto` vidare till API:t i stället för sitt eget `http`.

## 0.14.0 – 2026-11-10

- **Säkerhet: inloggningar kan återkallas.** Lokala token bär kontots tokenversion (migrering 0071); ett nytt lösenord eller ett spärrat konto gör alla tidigare utfärdade token ogiltiga. Token från äldre versioner gäller tills de går ut.
- **Konton kan spärras** (Användare → Spärra, `PUT /api/v1/users/{id}/active`). Ett spärrat konto kan inte logga in, och dess token avvisas.
- **Säkerhet: Entra** – ett lokalt konto (med lösenord) tas aldrig över av en Microsoft-inloggning med samma e-post; en administratör kopplar det (Användare → Koppla till Microsoft, `DELETE /api/v1/users/{id}/password`). Gästkonton (B2B) nekas. `BOOTSTRAP_ADMIN_EMAILS` ger administratörsroll bara så länge installationen saknar administratör. Koppling och rollbyten loggas.
- **Säkerhet: inloggningen avslöjar inte vilka konton som finns** – en okänd adress tar lika lång tid som ett fel lösenord; bcrypt körs utanför event-loopen.
- **Säkerhet: inga standardlösenord för databaserna.** docker compose kräver `POSTGRES_PASSWORD` (och `NEO4J_PASSWORD` med neo4j), och API:t vägrar starta i produktion med de lösenord som förr var förval (`ea_pass`, `ea_password`). **Uppgradering: en installation som kör med `ea_pass` byter först lösenordet** – `ALTER USER ea_user WITH PASSWORD '…'` i databasen och samma värde som `POSTGRES_PASSWORD` i `.env`.
- **Säkerhet: arbetsytornas filer** tar bara emot samma filtyper som dokumenten på objekten, och typen vid nedladdning bestäms av filändelsen (`nosniff`, `no-store`) – aldrig av vad webbläsaren påstod.
- **Säkerhet: PDF-renderingen hämtar bara portalens egna mallar och `data:`** – text i ett dokument kan inte få den att hämta adresser eller läsa filer.
- Webben skickar `Strict-Transport-Security`, men bara när begäran kom över https (direkt eller enligt proxyns `X-Forwarded-Proto`). Webbavbilden har `NOTICE` och GPL-3.0-texten för cytoscape-svg under `/licenses/`.

## 0.13.0 – 2026-11-10

- **Säkerhet: synkprofiler och plattformsimport når bara tillåtna plattformsadresser** – `INTEGRATION_PLATFORM_URL` och, om satt, nya `INTEGRATION_PLATFORM_ALLOWED_URLS` (kommaseparerad). Installationens nyckel skickas bara till `INTEGRATION_PLATFORM_URL`:s origin, och en sparad profilnyckel behålls bara när adressen är oförändrad (annars 422 "Ange plattformens API-nyckel"). Plattformens felkroppar skickas inte längre vidare till klienten.
- **Säkerhet: webhooken från plattformen verifieras med signatur** (`X-Webhook-Timestamp` + `X-Webhook-Signature`, HMAC-SHA256, högst 5 minuter gammal). Det gamla `X-Webhook-Secret` godtas fortfarande från en äldre plattform men loggas som föråldrat.
- **Säkerhet: behörigheter** – att ändra en kopplings anteckning kräver skrivrätt på kopplingen; `/views/overlap-gaps` visar bara objekt användaren får se; lösningsskisser ändras av skaparen eller en redaktör i utkast/granskning, och bara admin ändrar en godkänd eller arkiverad skiss; flödesscheman från Arkitekten följer processens behörighet och deras id valideras.
- **Säkerhet: nginx skickar klientens adress som `X-Forwarded-For` i stället för att lägga till den**, så att backend aldrig ser led som klienten själv skrivit.
- Ny `NOTICE`: webbens bygge innehåller cytoscape-svg (GPL-3.0). CI har bara läsbehörighet och actions är låsta till commit-SHA.

## 0.12.0 – 2026-11-09

- **Säkerhet: flödesscenerna från Arkitekten renas** innan de visas (DOMPurify med SVG-profil): skript, händelseattribut, `foreignObject` och `javascript:`-länkar tas bort, `<use>` får bara peka inom sidan. Tidigare kunde en scen köra skript i portalen.
- **Säkerhet: webbens nginx-mall skickar Content-Security-Policy**, `X-Content-Type-Options: nosniff` och `Referrer-Policy: strict-origin-when-cross-origin` (ny fil `security-headers.conf`, som en egen nginx-konfiguration också kan inkludera med `include /etc/nginx/ea/security-headers.conf;`). En installation som monterar egen `default.conf` påverkas inte.
- **Säkerhet: inloggning och första administratören begränsas** till 10 försök i minuten per klientadress (skurar om 5, sedan 429) för `POST` under `/api/v1/auth/` i nginx-mallen. Bakom en proxy (Render, lastbalanserare) anges proxyns adress eller nät i nya `TRUSTED_PROXY`, så att klientens adress tas från `X-Forwarded-For`.
- **Säkerhet: temahämtningen (`POST /api/v1/theme/extract`) når bara publika adresser**: bara http/https, inga interna, loopback-, länklokala eller reserverade adresser, varje omdirigering kontrolleras (högst 3) och svaret får vara högst 2 MB.
- **Säkerhet: plattformsnyckeln i synkprofiler visas inte längre i klartext** (`GET /api/v1/sync/profiles` ger `••••` + de fyra sista tecknen). Sparas profilen med den maskerade nyckeln eller tom behålls den lagrade.
- **Säkerhet: `GET /api/v1/import/platform/node-types` kräver inloggning.**
- API-nyckeln jämförs i konstant tid. Byggena tar inte med `.env`-filer, källkartor (sourcemaps) eller api:ts tester, och webbens beroenden installeras med `npm ci`.

## 0.11.0 – 2026-11-09

- **Säkerhet: första administratören kräver engångskoden `SETUP_CODE`** i produktion – utan den går inget första konto att skapa, så den som först hittar en ny installation kan inte ta den. Med Entra är formuläret stängt (administratörerna kommer från `BOOTSTRAP_ADMIN_EMAILS`).
- **Säkerhet: `APP_ENV` är `production` som standard**, så svaga eller exempelhemligheter stoppar starten även när `APP_ENV` inte är satt. Utveckling sätter `APP_ENV=development` själv.

## 0.10.0 – 2026-11-09

- **Första administratören skapas vid första besöket**: utan några konton visar inloggningssidan ett formulär för administratörskontot (ny publik `GET`/`POST /api/v1/auth/setup`). Med `BOOTSTRAP_ADMIN_EMAILS` satt får bara de adresserna skapa det.
- **Ingen separat läsnyckel till plattformen behövs**: utan `INTEGRATION_PLATFORM_API_KEY` läser portalen med `INTEGRATION_PLATFORM_ADMIN_KEY`.

## 0.9.1 – 2026-11-09

- **Render**: webben når api:t. Render ger api:t ett kort internt namn som bara går att slå upp med en sökdomän, och nginx egen uppslagning använder inte sökdomäner – webben svarade 502 på allt under `/api`. Namnet byggs nu ut med sökdomänen när containern startar (`18-api-upstream.envsh`). Med docker compose är allt som förut.

## 0.9.0 – 2026-11-09

- **Går att köra på Render och liknande plattformar.** Webbens nginx-konfiguration skrivs vid start ur en mall: `PORT` (förval 80) och `API_UPSTREAM` (förval `api:8000`) styr den, och api-adressen slås upp på nytt var tionde sekund. Förut låg adressen fast från starten, så ett api som startats om med ny adress nåddes inte förrän webben också startats om. En installation som monterar en egen `conf.d/default.conf` behåller den – mallen används då inte.
- `DATABASE_URL` tas emot i den form en hanterad databas ger den (`postgres://…`, `postgresql://…`, `sslmode=`).
- `INTEGRATION_PLATFORM_URL` kan vara en intern `host:port` och blir då `http://host:port/api/v1`.
- Api:ts kataloger för ögonblicksbilder och synkprofiler (`SNAPSHOT_DIR`, `SYNC_PROFILES_PATH`) får ägare vid start även när de ligger på en annan disk än förut, så båda kan dela en enda disk.


## 0.8.0 – 2026-11-05

- **Enkät som besvaras i en annan app**: en enkät kan få en adress under *Besvaras i en annan app* (en webbadress eller en sida på samma server). Mina enkäter öppnar då den appen i stället för portalens formulär, och svarssidan visar en knapp dit. Formuläret finns kvar som reserv. Appen skickar in svaren via det vanliga API:t (`POST /api/v1/my-surveys/{id}/answers`). Utan adress fungerar enkäten som förut. Ny kolumn `ea_surveys.answer_url` (migrering 0070).

## 0.7.0 – 2026-11-05

- **Gemensamma snabblänkar**: under Administration → Organisation lägger en administratör upp länkar som alla inloggade ser först under Snabblänkar på startsidan, före sina egna genvägar. En länk har titel, adress och valfri beskrivning och kan öppnas i en ny flik. Adressen är en webbadress (https://…) eller en sida på samma server (/…), till exempel en tjänst som ligger bredvid portalen. Högst 12 länkar. Utan inställning syns inga gemensamma länkar (`GET`/`PUT /api/v1/org-settings/shared-links`).

## 0.6.0 – 2026-11-02

- **Portalens namn** går att ändra under Administration → Organisation. Namnet visas i stället för EA-portalen i sidhuvudet, på inloggningssidan, i webbläsarens flik och i texterna, på alla språk. Tomt fält ger standardnamnet.
- Ny sida **Administration → Listor**. Informationskällor, Teknikkomponenter, Servrar och Servertjänster går att stänga av per installation: listan och dess objekt döljs för alla, i menyer, sökning och grafer, men inget raderas och synk till listan fortsätter. Applikationer, processer och informationsobjekt går inte att stänga av, eftersom rapporterna bygger på dem.
- **Egna listor**: en administratör lägger till listor med namn, domän och egna fält (text, tal, datum, val, länk). Objekten kan kopplas till andra objekt och syns i sökning och grafer, och listan kan fyllas från Integrationsplattformen, till exempel från SharePoint. Egna listor ingår inte i rapporterna eller Förändringsstatistik. Behörigheter styrs med den nya typen *Egna listor*.
- Inställningarna ligger i installationens databas och ändras inte vid uppgradering. Utan inställning är allt som förut. Efter att egna listor börjat användas går det inte att gå tillbaka till en äldre version utan att återställa databasen från backup.
- En synk med en egen källa, utanför SharePoint och 2C8, kan inte längre göra att objektlistorna slutar fungera.

## 0.5.2 – 2026-11-02

- Knappen *Ladda demodata* under Inställningar var alltid inaktiverad och sa att databasen innehöll skarp data, även i en tom portal. Nu går den att använda så länge portalen saknar objekt (en inläst ordlista räknas inte), och bara för administratörer. Hjälptexten säger var demodatan tas bort.

## 0.5.1 – 2026-11-02

- Backend på Python 3.14 och webbens bygge på Node 26 (LTS). Testverktygen: Vitest 5 och jsdom 30.

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
