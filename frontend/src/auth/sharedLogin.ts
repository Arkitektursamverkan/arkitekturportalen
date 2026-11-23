/**
 * Gemensam inloggning (Administration → Organisation): finns redan en
 * Microsoft-session i webbläsaren loggar portalen in av sig själv, utan
 * knapptryck – som Arkitekten och installationens övriga appar på samma
 * app-registrering.
 *
 * Två spärrar mot en loop: efter en utloggning i fliken loggar vi inte in
 * av oss själva (den som loggat ut vill inte bli inloggad igen), och ett
 * automatiskt försök görs högst en gång per minut – misslyckas det visas
 * inloggningssidan som vanligt.
 */
const UTLOGGAD = "ea_utloggad";
const SENAST = "ea_auto_inloggning";
const PAUS_MS = 60_000;

function läs(nyckel: string): string | null {
  try {
    return sessionStorage.getItem(nyckel);
  } catch {
    return null;
  }
}

function skriv(nyckel: string, värde: string | null): void {
  try {
    if (värde === null) sessionStorage.removeItem(nyckel);
    else sessionStorage.setItem(nyckel, värde);
  } catch {
    /* ingen lagring – då blir det bara knappen */
  }
}

/** Får sidan logga in av sig själv just nu? */
export function mayAutoLogin(now: number = Date.now()): boolean {
  if (läs(UTLOGGAD)) return false;
  return now - (Number(läs(SENAST)) || 0) > PAUS_MS;
}

export function markAutoLogin(now: number = Date.now()): void {
  skriv(SENAST, String(now));
}

/** Vid utloggning: logga inte in av dig själv igen i den här fliken. */
export function markSignedOut(): void {
  skriv(UTLOGGAD, "1");
}

/** Vid en inloggning man själv valt: automatiken gäller igen. */
export function clearSignedOut(): void {
  skriv(UTLOGGAD, null);
}
