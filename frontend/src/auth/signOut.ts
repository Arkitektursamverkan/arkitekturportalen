import { clearLocalToken, hasValidLocalToken } from "./localSession";
import { getMsal } from "./msal";

/**
 * Loggar ut: ett lokalt konto genom att glömma biljetten, ett Microsoft-konto
 * via Entras utloggning (som kommer tillbaka till webbplatsens rot).
 */
export async function signOut(reload: () => void = () => window.location.reload()): Promise<void> {
  if (hasValidLocalToken()) {
    clearLocalToken();
    reload();
    return;
  }
  const msal = await getMsal();
  if (msal) {
    const account = msal.getActiveAccount() ?? msal.getAllAccounts()[0];
    await msal.logoutRedirect({
      account: account ?? undefined,
      postLogoutRedirectUri: window.location.origin,
    });
    return;
  }
  reload();
}
