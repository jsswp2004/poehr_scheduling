import { useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import IcdCodePicker, { codesFromText, uniqueByCode, dxLabel, MAX_CODES } from "../IcdCodePicker";
import { api } from "../../api/client";

const DIABETES = [
  { code: "E11.9", description: "Type 2 diabetes mellitus without complications" },
  { code: "E10.9", description: "Type 1 diabetes mellitus without complications" },
];

function Harness({ initial = [], onValue }) {
  const [value, setValue] = useState(initial);
  onValue(value);
  return <IcdCodePicker value={value} onChange={setValue} />;
}

const setup = (initial = []) => {
  let latest = initial;
  render(<Harness initial={initial} onValue={(v) => (latest = v)} />);
  return { input: screen.getByRole("combobox"), latest: () => latest };
};

beforeEach(() => {
  api.get.mockReset();
});

describe("helpers", () => {
  it("splits typed text into upper-case codes", () => {
    expect(codesFromText("e11.9, i10;  z00.00")).toEqual([
      { code: "E11.9", description: "" },
      { code: "I10", description: "" },
      { code: "Z00.00", description: "" },
    ]);
    expect(codesFromText("")).toEqual([]);
    expect(codesFromText(null)).toEqual([]);
  });
  it("keeps the first copy of a repeated code", () => {
    expect(uniqueByCode([{ code: "I10", description: "Essential" }, { code: "i10", description: "" }])).toEqual([
      { code: "I10", description: "Essential" },
    ]);
  });
  it("labels a code with its description when there is one", () => {
    expect(dxLabel({ code: "I10", description: "Essential (primary) hypertension" })).toBe(
      "I10 - Essential (primary) hypertension"
    );
    expect(dxLabel({ code: "I10" })).toBe("I10");
  });
});

describe("IcdCodePicker", () => {
  it("shows matches as you type and saves the picked code with its description", async () => {
    api.get.mockResolvedValue({ data: { results: DIABETES } });
    const { input, latest } = setup();
    await userEvent.type(input, "diab");
    const option = await screen.findByText("Type 2 diabetes mellitus without complications");
    expect(api.get).toHaveBeenCalledTimes(1); // debounced: one call for the whole word
    expect(api.get.mock.calls[0][1].params).toEqual({ q: "diab", limit: 15 });
    expect(api.get.mock.calls[0][1].headers).toEqual({ Authorization: "Bearer tok" });
    await userEvent.click(option);
    expect(latest()).toEqual([DIABETES[0]]);
    expect(screen.getByText("E11.9")).toBeInTheDocument(); // chip
  });

  it("does not search for fewer than two characters", async () => {
    const { input } = setup();
    await userEvent.type(input, "e");
    await new Promise((r) => setTimeout(r, 450));
    expect(api.get).not.toHaveBeenCalled();
  });

  it("does not offer a code that is already on the order", async () => {
    api.get.mockResolvedValue({ data: { results: DIABETES } });
    const { input, latest } = setup([DIABETES[0]]);
    await userEvent.type(input, "diab");
    await screen.findByText("Type 1 diabetes mellitus without complications");
    expect(screen.queryByText("Type 2 diabetes mellitus without complications")).not.toBeInTheDocument();
    await userEvent.click(screen.getByText("Type 1 diabetes mellitus without complications"));
    expect(latest().map((d) => d.code)).toEqual(["E11.9", "E10.9"]);
  });

  it("typing a code that is already on the order does not duplicate it", async () => {
    api.get.mockRejectedValue(new Error("down"));
    const { input, latest } = setup([DIABETES[0]]);
    await userEvent.type(input, "e11.9{Enter}");
    expect(latest().map((d) => d.code)).toEqual(["E11.9"]);
  });

  it("still lets staff type a code when the search is unavailable", async () => {
    api.get.mockRejectedValue(new Error("503"));
    const { input, latest } = setup();
    await userEvent.type(input, "e11.9");
    expect(await screen.findByText(/Code search is unavailable/)).toBeInTheDocument();
    await userEvent.type(input, "{Enter}");
    expect(latest()).toEqual([{ code: "E11.9", description: "" }]);
  });

  it("takes the description from the search when the typed code matches a result", async () => {
    api.get.mockResolvedValue({ data: { results: DIABETES } });
    const { input, latest } = setup();
    await userEvent.type(input, "E11.9");
    await screen.findByText("Type 2 diabetes mellitus without complications");
    await userEvent.type(input, "{Enter}");
    await waitFor(() => expect(latest()).toHaveLength(1));
    expect(latest()[0].code).toBe("E11.9");
  });

  it("splits several pasted codes", async () => {
    api.get.mockRejectedValue(new Error("down"));
    const { input, latest } = setup();
    await userEvent.click(input);
    await userEvent.paste("e11.9, i10");
    await userEvent.type(input, "{Enter}");
    expect(latest().map((d) => d.code)).toEqual(["E11.9", "I10"]);
  });

  it("shows codes already on the order and lets one be removed", async () => {
    const { latest } = setup([DIABETES[0], { code: "I10", description: "" }]);
    expect(screen.getByText("E11.9")).toBeInTheDocument();
    const chip = screen.getByText("I10").closest(".MuiChip-root");
    await userEvent.click(within(chip).getByTestId("CancelIcon"));
    expect(latest().map((d) => d.code)).toEqual(["E11.9"]);
  });

  it("caps the list at the server's limit", async () => {
    const many = Array.from({ length: MAX_CODES }, (_, i) => ({ code: `A${i}`, description: "" }));
    api.get.mockRejectedValue(new Error("down"));
    const { input, latest } = setup(many);
    await userEvent.type(input, "B99{Enter}");
    expect(latest()).toHaveLength(MAX_CODES);
  });
});
