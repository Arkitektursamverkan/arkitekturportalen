import { isAuthConfigured } from "./auth/msalConfig";
import { hasAuthResponse, runRedirectBridge } from "./auth/redirectBridge";

/*
 * Ingången. Bär adressen ett inloggningssvar från Entra lämnas det först till
 * MSAL:s omdirigeringsbrygga (se auth/redirectBridge.ts) – appen laddas inte i
 * popupfönstret eller den dolda iframen. Annars startar appen, och den
 * initierar MSAL innan något renderas.
 */
async function main() {
  if (isAuthConfigured && hasAuthResponse(window.location) && (await runRedirectBridge())) return;
  const { startApp } = await import("./startApp");
  await startApp();
}

main().catch((e) => {
  console.error("Bootstrap failed:", e);
  const box = document.createElement("div");
  box.style.cssText = "padding:24px;font-family:system-ui";
  box.textContent = `Initialiseringsfel: ${e?.message ?? e}`;
  document.body.replaceChildren(box);
});
