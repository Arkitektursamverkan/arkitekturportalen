import { acquireGraphToken } from "@/auth/graphToken";
import { filesRequest, isAuthConfigured } from "@/auth/msalConfig";

/**
 * PDF:er som länkas från SharePoint eller OneDrive.
 *
 * SharePoint låter sig inte visas i en ram på en annan webbplats, så filen
 * hämtas i stället med Microsoft Graph, i den inloggade användarens namn
 * (Files.Read.All, delegerad): användaren ser bara det hen redan har
 * behörighet till i SharePoint. Portalens server är inte inblandad.
 */

const GRAPH = "https://graph.microsoft.com/v1.0";

/** Länkar som Graph kan slå upp: SharePoint och OneDrive för företag. */
export function isSharePointUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && /(^|\.)sharepoint\.com$/i.test(u.hostname);
  } catch {
    return false;
  }
}

/** Kan PDF:er från SharePoint visas här? Kräver inloggning med Microsoft-konto. */
export const canViewSharePoint = isAuthConfigured;

/** Graphs id för en delningslänk eller adress: "u!" + base64url av adressen. */
export function shareId(url: string): string {
  const bytes = new TextEncoder().encode(url);
  let bin = "";
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return "u!" + btoa(bin).replace(/=+$/, "").replace(/\//g, "_").replace(/\+/g, "-");
}

interface DriveItem {
  name: string;
  file?: { mimeType?: string };
  "@microsoft.graph.downloadUrl"?: string;
}

export interface FetchedPdf {
  blob: Blob;
  name: string;
}

async function graphGet(path: string, token: string): Promise<Response> {
  const res = await fetch(`${GRAPH}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Prefer: "redeemSharingLinkIfNecessary" },
  });
  if (res.status === 401 || res.status === 403 || res.status === 404) {
    throw new Error("Filen gick inte att hämta från SharePoint. Den kan ha flyttats, eller så har du inte behörighet till den.");
  }
  if (!res.ok) throw new Error(`SharePoint svarade med fel ${res.status}.`);
  return res;
}

export async function fetchSharePointPdf(url: string): Promise<FetchedPdf> {
  const token = await acquireGraphToken(
    filesRequest,
    "PDF:er från SharePoint kan bara visas för den som är inloggad med Microsoft-konto.",
  );
  const id = shareId(url);
  const item = (await (await graphGet(`/shares/${id}/driveItem`, token)).json()) as DriveItem;
  if (!item.file) throw new Error("Länken pekar inte på en fil.");
  const isPdf = item.file.mimeType === "application/pdf" || /\.pdf$/i.test(item.name);
  if (!isPdf) throw new Error(`${item.name} är inte en PDF och kan inte visas här.`);

  // Hämtningsadressen är förautentiserad och kortlivad; utan den går det via Graph.
  const downloadUrl = item["@microsoft.graph.downloadUrl"];
  const res = downloadUrl ? await fetch(downloadUrl) : await graphGet(`/shares/${id}/driveItem/content`, token);
  if (!res.ok) throw new Error(`SharePoint svarade med fel ${res.status}.`);
  const blob = await res.blob();
  return { blob: blob.type === "application/pdf" ? blob : new Blob([blob], { type: "application/pdf" }), name: item.name };
}
