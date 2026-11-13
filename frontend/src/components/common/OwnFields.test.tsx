import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { DomainLists } from "@/config/domainLists";
import OwnFields from "./OwnFields";

let lists: DomainLists;
const enqueueSnackbar = vi.fn();

vi.mock("@/api/orgSettings", () => ({ usePublicOrgSettings: () => ({ data: { domain_lists: lists } }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock("notistack", () => ({ useSnackbar: () => ({ enqueueSnackbar }) }));

const medFält: DomainLists = {
  disabled: [],
  custom: [],
  extra_fields: {
    nodes: {},
    edges: {
      INTEGRATES_WITH: [
        { key: "x_integrationstyp", label: "Integrationstyp", type: "choice", options: ["REST", "SOAP"] },
        { key: "x_avtal", label: "Avtal", type: "text", options: [] },
      ],
    },
  },
};

function visa(props: Partial<React.ComponentProps<typeof OwnFields>> = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(
    <MemoryRouter>
      <OwnFields
        kind="edges" type="INTEGRATES_WITH" ownerId="e1" canEdit onSave={onSave}
        attributes={{ direction: "BIDIRECTIONAL", x_avtal: "Dnr 7" }} {...props}
      />
    </MemoryRouter>,
  );
  return onSave;
}

describe("OwnFields", () => {
  afterEach(() => { cleanup(); enqueueSnackbar.mockClear(); });

  it("shows the type's fields with their stored values, and nothing of the built-in attributes", () => {
    lists = medFält;
    visa();
    expect(screen.getByText("Integrationstyp")).toBeTruthy();
    expect((screen.getByLabelText("Avtal") as HTMLInputElement).value).toBe("Dnr 7");
    expect(screen.queryByText("BIDIRECTIONAL")).toBeNull();
  });

  it("saves a text when the field is left, trimmed, and only when it changed", async () => {
    lists = medFält;
    const onSave = visa();
    const avtal = screen.getByLabelText("Avtal");
    fireEvent.blur(avtal);
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.change(avtal, { target: { value: "  Dnr 8 " } });
    fireEvent.blur(avtal);
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ x_avtal: "Dnr 8" }));
  });

  it("clears a field with an empty value", async () => {
    lists = medFält;
    const onSave = visa();
    const avtal = screen.getByLabelText("Avtal");
    fireEvent.change(avtal, { target: { value: "" } });
    fireEvent.blur(avtal);
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ x_avtal: null }));
  });

  it("puts the old value back and says why when the save is refused", async () => {
    lists = medFält;
    const onSave = visa();
    onSave.mockRejectedValueOnce(new Error("nej"));
    const avtal = screen.getByLabelText("Avtal") as HTMLInputElement;
    fireEvent.change(avtal, { target: { value: "Nytt" } });
    fireEvent.blur(avtal);
    await waitFor(() => expect(enqueueSnackbar).toHaveBeenCalled());
    expect(avtal.value).toBe("Dnr 7");
  });

  it("is read-only for someone who may not change the connection", () => {
    lists = medFält;
    visa({ canEdit: false });
    expect(screen.queryByLabelText("Avtal")).toBeNull();
    expect(screen.getByText("Dnr 7")).toBeTruthy();
  });

  it("shows nothing for a type without fields – except the way in for an admin", () => {
    lists = { disabled: [], custom: [] };
    visa();
    expect(screen.queryByText("ownFields.add")).toBeNull();
    cleanup();
    visa({ isAdmin: true });
    expect(screen.getByText("ownFields.add").closest("a")?.getAttribute("href")).toBe("/domain-lists");
  });
});
