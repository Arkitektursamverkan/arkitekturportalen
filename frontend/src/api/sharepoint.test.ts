import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchSharePointPdf, isSharePointUrl, shareId } from "./sharepoint";

vi.mock("@/auth/graphToken", () => ({ acquireGraphToken: vi.fn().mockResolvedValue("biljett") }));

const LANK = "https://hfab.sharepoint.com/:b:/s/arkitektur/EabcDEF?e=x1";

describe("SharePoint-länkar", () => {
  it("känner igen SharePoint och OneDrive för företag", () => {
    expect(isSharePointUrl(LANK)).toBe(true);
    expect(isSharePointUrl("https://hfab-my.sharepoint.com/personal/a/Documents/x.pdf")).toBe(true);
    expect(isSharePointUrl("https://example.com/x.pdf")).toBe(false);
    expect(isSharePointUrl("https://sharepoint.com.example.com/x.pdf")).toBe(false);
    expect(isSharePointUrl("http://hfab.sharepoint.com/x.pdf")).toBe(false);
    expect(isSharePointUrl("inte en adress")).toBe(false);
    expect(isSharePointUrl(null)).toBe(false);
  });

  it("kodar länken som Graphs delnings-id", () => {
    // Exemplet i Microsofts dokumentation för /shares.
    expect(shareId("https://onedrive.live.com/redir?resid=1231244193912!12&authKey=1201919!12921!1")).toBe(
      "u!aHR0cHM6Ly9vbmVkcml2ZS5saXZlLmNvbS9yZWRpcj9yZXNpZD0xMjMxMjQ0MTkzOTEyITEyJmF1dGhLZXk9MTIwMTkxOSExMjkyMSEx",
    );
    expect(shareId("https://hfab.sharepoint.com/Delade dokument/Å.pdf")).toMatch(/^u![A-Za-z0-9_-]+$/);
  });
});

describe("hämta PDF", () => {
  const fetchMock = vi.fn();
  beforeEach(() => { vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

  it("hämtar filen via den förautentiserade adressen", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ name: "Avtal.pdf", file: { mimeType: "application/pdf" }, "@microsoft.graph.downloadUrl": "https://dl/x" }))
      .mockResolvedValueOnce(new Response(new Blob(["%PDF"], { type: "application/pdf" })));
    const pdf = await fetchSharePointPdf(LANK);
    expect(pdf.name).toBe("Avtal.pdf");
    expect(pdf.blob.type).toBe("application/pdf");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://graph.microsoft.com/v1.0/shares/${shareId(LANK)}/driveItem`);
    expect(init.headers.Authorization).toBe("Bearer biljett");
    expect(fetchMock.mock.calls[1][0]).toBe("https://dl/x");
  });

  it("vägrar filer som inte är PDF", async () => {
    fetchMock.mockResolvedValueOnce(json({ name: "Plan.docx", file: { mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" } }));
    await expect(fetchSharePointPdf(LANK)).rejects.toThrow("Plan.docx är inte en PDF");
  });

  it("förklarar när behörighet saknas", async () => {
    fetchMock.mockResolvedValueOnce(json({ error: {} }, 403));
    await expect(fetchSharePointPdf(LANK)).rejects.toThrow("inte behörighet");
  });
});
