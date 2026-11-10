import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import PdfViewerWindow, { type PdfSource } from "./PdfViewerWindow";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:pdf");
  URL.revokeObjectURL = vi.fn();
});
afterEach(cleanup);

const source = (load: PdfSource["load"], sourceUrl?: string): PdfSource => ({ title: "Avtal", load, sourceUrl });

describe("PDF-fönstret", () => {
  it("visar filen i en ram och släpper den när fönstret stängs", async () => {
    const onClose = vi.fn();
    const { container, unmount } = render(
      <PdfViewerWindow source={source(async () => ({ blob: new Blob(["%PDF"]), name: "Avtal.pdf" }))} onClose={onClose} />,
    );
    await waitFor(() => expect(container.querySelector("iframe")?.getAttribute("src")).toBe("blob:pdf"));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:pdf");
  });

  it("visar felet och länken till källan", async () => {
    render(
      <PdfViewerWindow source={source(() => Promise.reject(new Error("Ingen behörighet")), "https://contoso.sharepoint.com/x")} onClose={() => {}} />,
    );
    expect(await screen.findByText("Ingen behörighet")).toBeTruthy();
    expect(screen.getAllByRole("link").some((a) => a.getAttribute("href") === "https://contoso.sharepoint.com/x")).toBe(true);
  });
});
