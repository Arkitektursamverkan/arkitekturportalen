import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DescriptionField from "./DescriptionField";

const enqueueSnackbar = vi.fn();

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock("notistack", () => ({ useSnackbar: () => ({ enqueueSnackbar }) }));

function visa(props: Partial<React.ComponentProps<typeof DescriptionField>> = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(<DescriptionField ownerId="s1" value="Kör portalen" canEdit onSave={onSave} {...props} />);
  return onSave;
}

const fält = () => screen.getByLabelText("common.description") as HTMLTextAreaElement;

describe("DescriptionField", () => {
  afterEach(() => { cleanup(); enqueueSnackbar.mockClear(); });

  it("shows the stored text in a field the editor can write in", () => {
    visa();
    expect(fält().value).toBe("Kör portalen");
  });

  it("saves when the field is left, trimmed, and only when the text changed", async () => {
    const onSave = visa();
    fireEvent.blur(fält());
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.change(fält(), { target: { value: "  Rad ett\nRad två " } });
    fireEvent.blur(fält());
    await waitFor(() => expect(onSave).toHaveBeenCalledWith("Rad ett\nRad två"));
  });

  it("clears the description when the text is emptied", async () => {
    const onSave = visa();
    fireEvent.change(fält(), { target: { value: "  " } });
    fireEvent.blur(fält());
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(""));
  });

  it("puts the stored text back and says why when the save fails", async () => {
    const onSave = visa({ onSave: vi.fn().mockRejectedValue(new Error("Saknar behörighet")) });
    void onSave;
    fireEvent.change(fält(), { target: { value: "Nytt" } });
    fireEvent.blur(fält());
    await waitFor(() => expect(enqueueSnackbar).toHaveBeenCalledWith("Saknar behörighet", { variant: "error" }));
    expect(fält().value).toBe("Kör portalen");
  });

  it("shows the text, or a dash, to someone who may not edit", () => {
    visa({ canEdit: false, value: null });
    expect(screen.queryByLabelText("common.description")).toBeNull();
    expect(screen.getByText("—")).toBeTruthy();
  });
});
