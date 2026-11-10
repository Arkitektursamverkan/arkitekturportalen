import { loadRuntimeConfig } from "./config/runtimeConfig";

/*
 * Ingången. Först installationens inställningar (config/runtimeConfig.ts) –
 * msalConfig och modulerna läser dem när de laddas, så de importeras först
 * efteråt. Bär adressen ett inloggningssvar från Entra lämnas det sedan till
 * MSAL:s omdirigeringsbrygga (se auth/redirectBridge.ts) – appen laddas inte i
 * popupfönstret eller den dolda iframen. Annars startar appen, och den
 * initierar MSAL innan något renderas.
 */
async function main() {
  await loadRuntimeConfig();
  const { isAuthConfigured } = await import("./auth/msalConfig");
  const { hasAuthResponse, runRedirectBridge } = await import("./auth/redirectBridge");
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
