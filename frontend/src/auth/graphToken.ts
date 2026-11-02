import { InteractionRequiredAuthError } from "@azure/msal-browser";
import { getMsal } from "./msal";

/**
 * Microsoft Graph-biljett för den inloggade användaren, med de delegerade
 * behörigheterna i `request`. Frågar i ett fönster om användaren (eller en
 * administratör) inte redan har godkänt dem.
 */
export async function acquireGraphToken(request: { scopes: string[] }, notSignedIn: string): Promise<string> {
  const msal = await getMsal();
  const account = msal ? msal.getActiveAccount() ?? msal.getAllAccounts()[0] : null;
  if (!msal || !account) throw new Error(notSignedIn);
  try {
    return (await msal.acquireTokenSilent({ ...request, account })).accessToken;
  } catch (err) {
    if (err instanceof InteractionRequiredAuthError) {
      return (await msal.acquireTokenPopup({ ...request, account })).accessToken;
    }
    throw err;
  }
}
