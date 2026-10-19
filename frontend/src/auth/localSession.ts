/**
 * Local-account JWT helpers. Tokens are stored in sessionStorage (cleared on
 * browser close); the backend issues HS256 tokens valid for 12h by default.
 */
const TOKEN_KEY = "ea_local_token";

export function setLocalToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token);
  // Notify any listening components (cross-tab sync handled by storage event)
  window.dispatchEvent(new CustomEvent("ea-local-token-change"));
}

export function getLocalToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function clearLocalToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
  window.dispatchEvent(new CustomEvent("ea-local-token-change"));
}

interface JwtPayload {
  exp?: number;
}

function decodePayload(token: string): JwtPayload | null {
  try {
    const part = token.split(".")[1];
    const padded = part.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

export function hasValidLocalToken(): boolean {
  const token = getLocalToken();
  if (!token) return false;
  const payload = decodePayload(token);
  if (!payload?.exp) return false;
  return payload.exp * 1000 > Date.now();
}
