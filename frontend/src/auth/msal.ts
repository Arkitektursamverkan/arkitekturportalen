/**
 * Den enda MSAL-instansen och dess start.
 *
 * MSAL 4/5 kräver att `initialize()` är klar innan något annat anrop görs
 * (annars `uninitialized_public_client_application`). Därför skapas instansen
 * här, och allt som behöver den – main.tsx innan appen renderas, axios-
 * interceptorn, katalogen – går via initMsal()/getMsal(), som väntar ut
 * initieringen och omdirigeringssvaret först. Utan Entra-inställningar skapas
 * ingen instans alls och appen kör med bara lokala konton.
 */
import {
  AccountInfo,
  AuthError,
  AuthenticationResult,
  EventType,
  PublicClientApplication,
} from "@azure/msal-browser";
import { buildMsalConfig, isAuthConfigured } from "./msalConfig";

export interface MsalStart {
  /** Initierad instans, eller null när Entra inte är inställt (eller inte gick att starta). */
  instance: PublicClientApplication | null;
  /** Fel från inloggningssvaret eller starten, att visa på inloggningssidan. */
  error: unknown;
}

let start: Promise<MsalStart> | null = null;

async function startMsal(): Promise<MsalStart> {
  if (!isAuthConfigured) return { instance: null, error: null };

  const instance = new PublicClientApplication(buildMsalConfig());
  try {
    await instance.initialize();
  } catch (error) {
    // T.ex. en webbläsare utan Web Crypto (sidan över http). Lokala konton
    // fungerar ändå, så appen startar utan Microsoft-inloggningen.
    console.error("MSAL kunde inte startas:", error);
    return { instance: null, error };
  }

  // MSAL 5: LOGIN_SUCCESS bär ett AccountInfo, ACQUIRE_TOKEN_SUCCESS ett AuthenticationResult.
  instance.addEventCallback((event) => {
    if (event.eventType === EventType.LOGIN_SUCCESS && event.payload) {
      instance.setActiveAccount(event.payload as AccountInfo);
    } else if (event.eventType === EventType.ACQUIRE_TOKEN_SUCCESS && event.payload) {
      const result = event.payload as AuthenticationResult;
      if (result.account && !instance.getActiveAccount()) instance.setActiveAccount(result.account);
    }
  });

  // Svaret från en inloggning med omdirigering. MsalProvider anropar samma
  // funktion och får då samma (redan avgjorda) löfte.
  let error: unknown = null;
  try {
    const result = await instance.handleRedirectPromise();
    if (result?.account) instance.setActiveAccount(result.account);
  } catch (e) {
    error = e;
  }

  if (!instance.getActiveAccount()) {
    const [first] = instance.getAllAccounts();
    if (first) instance.setActiveAccount(first);
  }
  return { instance, error };
}

/** Skapar och initierar instansen en gång; senare anrop får samma resultat. */
export function initMsal(): Promise<MsalStart> {
  start ??= startMsal();
  return start;
}

/** Den initierade instansen, eller null utan Entra. Säker att anropa när som helst. */
export async function getMsal(): Promise<PublicClientApplication | null> {
  return (await initMsal()).instance;
}

/** Bara för tester. */
export function resetMsalForTests(): void {
  start = null;
}

const MESSAGES: Record<string, string> = {
  access_denied: "Inloggningen avbröts eller nekades.",
  user_cancelled: "Inloggningen avbröts.",
  consent_required: "Appen behöver godkännas av en administratör i Entra ID innan du kan logga in.",
  interaction_required: "Logga in igen för att fortsätta.",
  login_required: "Sessionen har gått ut. Logga in igen.",
  interaction_in_progress: "En inloggning pågår redan. Vänta eller ladda om sidan.",
  no_network_connectivity: "Ingen kontakt med Microsoft. Kontrollera nätverket och försök igen.",
  crypto_nonexistent: "Webbläsaren saknar stöd för säker inloggning (sidan måste visas över https).",
  invalid_request: "Inloggningsbegäran avvisades av Microsoft.",
  invalid_client: "Appregistreringen i Entra ID godtog inte begäran.",
  unauthorized_client: "Appregistreringen i Entra ID godtog inte begäran.",
  server_error: "Microsoft kunde inte slutföra inloggningen. Försök igen.",
  temporarily_unavailable: "Microsofts inloggning är tillfälligt otillgänglig. Försök igen.",
};

/**
 * Ett läsbart meddelande för ett inloggningsfel. MSAL 5 lägger bara en länk i
 * `message`, så felkoden (och Entras AADSTS-kod) får bära informationen.
 */
export function describeAuthError(error: unknown): string {
  if (error instanceof AuthError) {
    const text = MESSAGES[error.errorCode] ?? "Inloggningen misslyckades.";
    const aadsts = /AADSTS\d+/.exec(`${error.errorMessage ?? ""} ${error.subError ?? ""}`)?.[0];
    const code = aadsts ? `${error.errorCode}, ${aadsts}` : error.errorCode;
    return `${text} (${code})`;
  }
  if (error instanceof Error && error.message) return error.message;
  return "Inloggningen misslyckades.";
}
