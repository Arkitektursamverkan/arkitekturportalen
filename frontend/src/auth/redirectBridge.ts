/**
 * MSAL 5:s omdirigeringsbrygga på webbplatsens rot.
 *
 * Entra skickar inloggningssvaret (code/error + state) till redirectUri, som
 * här är rotsidan. Med MSAL 5 måste den sidan lämna svaret vidare med
 * broadcastResponseToMainFrame(): till huvudfönstret för popup och dold iframe
 * (tyst förnyelse, katalogens Graph-behörighet), och via sessionStorage för
 * omdirigeringsflödet. Genom att rotsidan själv är bryggan behöver
 * appregistreringarna ingen ny omdirigeringsadress.
 */

/** Sant när adressen bär ett svar från Entras authorize-slutpunkt. */
export function hasAuthResponse(location: Pick<Location, "hash" | "search">): boolean {
  for (const raw of [location.hash.replace(/^#/, ""), location.search.replace(/^\?/, "")]) {
    if (!raw) continue;
    const params = new URLSearchParams(raw);
    if (params.has("state") && (params.has("code") || params.has("error"))) return true;
  }
  return false;
}

/**
 * Lämnar svaret till MSAL:s brygga. Sant om bryggan tog hand om det (sidan
 * navigerar vidare eller stängs); falskt om svaret inte kom från MSAL – då
 * har bryggan rensat adressen och appen startar som vanligt.
 */
export async function runRedirectBridge(): Promise<boolean> {
  const { broadcastResponseToMainFrame } = await import("@azure/msal-browser/redirect-bridge");
  try {
    await broadcastResponseToMainFrame();
    return true;
  } catch (error) {
    console.warn("Inloggningssvaret kunde inte tolkas och ignoreras:", error);
    return false;
  }
}
