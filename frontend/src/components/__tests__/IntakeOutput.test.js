import { render, screen, fireEvent } from "@testing-library/react";
import IntakeOutputSummary from "../IntakeOutputSummary";
import IntakeOutputEntryDrawer from "../IntakeOutputEntryDrawer";
import { parseVolume, convertVolumeText, formatMl } from "../../utils/ioHelpers";

describe("ioHelpers", () => {
  test("ounces become millilitres at 30 per ounce", () => {
    expect(parseVolume("8 oz")).toEqual({ ml: 240, converted: true });
    expect(parseVolume("8oz")).toEqual({ ml: 240, converted: true });
    expect(parseVolume("1.5 ounces")).toEqual({ ml: 45, converted: true });
  });
  test("plain and ml amounts are left as they are", () => {
    expect(parseVolume("240")).toEqual({ ml: 240, converted: false });
    expect(parseVolume("240 mL")).toEqual({ ml: 240, converted: false });
  });
  test("anything else is not an amount", () => {
    ["", "abc", "-5", "8 cups", null, undefined].forEach((v) => expect(parseVolume(v)).toBeNull());
  });
  test("convertVolumeText only rewrites ounces", () => {
    expect(convertVolumeText("8 oz")).toBe("240");
    expect(convertVolumeText("240")).toBe("240");
    expect(convertVolumeText("abc")).toBe("abc");
  });
  test("formatMl shows signs and blanks", () => {
    expect(formatMl(1240)).toBe("1,240");
    expect(formatMl(140, { signed: true })).toBe("+140");
    expect(formatMl(-60, { signed: true })).toBe("-60");
    expect(formatMl(0, { signed: true })).toBe("0");
    expect(formatMl(null)).toBe("--");
  });
});

describe("IntakeOutputSummary", () => {
  const summary = {
    periods: {
      shift: { label: "07:00 to 19:00", intake: 1200, output: 900, net: 300 },
      day: { intake: 2100, output: 1500, net: 600 },
      stay: { intake: 2100, output: 1500, net: 600 },
    },
    alerts: [{ code: "positive_balance", message: "24-hour net balance is +2,355 mL, over the +2,000 mL limit." }],
    urine_ml_kg_h: 0.62,
    weight_kg: 72.5,
  };
  test("shows the alert and the three periods", () => {
    render(<IntakeOutputSummary summary={summary} />);
    expect(screen.getByText(/over the \+2,000 mL limit/)).toBeInTheDocument();
    expect(screen.getByText(/This shift \(07:00 to 19:00\)/)).toBeInTheDocument();
    expect(screen.getByText("Last 24 hours")).toBeInTheDocument();
    expect(screen.getByLabelText("This shift net")).toHaveTextContent("+300");
    expect(screen.getByText(/0.62 mL\/kg\/h/)).toBeInTheDocument();
  });
  test("renders nothing before totals arrive", () => {
    const { container } = render(<IntakeOutputSummary summary={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("IntakeOutputEntryDrawer", () => {
  const rows = [
    { key: "oral_fluids", label: "Oral fluids", unit: "mL", field_type: "numeric", section_label: "Intake" },
    { key: "iv_fluid_name", label: "IV fluid and rate", unit: "", field_type: "text", section_label: "Intake" },
  ];
  test("typed ounces are saved as millilitres", () => {
    const onSave = jest.fn();
    render(<IntakeOutputEntryDrawer open onClose={() => {}} rows={rows} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: "oz" }));
    fireEvent.change(screen.getByLabelText("Oral fluids"), { target: { value: "8" } });
    fireEvent.click(screen.getByRole("button", { name: "Save entry" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].values).toEqual({ oral_fluids: "240" });
  });
  test("refuses an empty entry and a non-number", () => {
    const onSave = jest.fn();
    render(<IntakeOutputEntryDrawer open onClose={() => {}} rows={rows} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: "Save entry" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter at least one amount.");
    fireEvent.change(screen.getByLabelText("Oral fluids"), { target: { value: "lots" } });
    fireEvent.click(screen.getByRole("button", { name: "Save entry" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Oral fluids: enter a number.");
    expect(onSave).not.toHaveBeenCalled();
  });
  test("text rows are saved as typed", () => {
    const onSave = jest.fn();
    render(<IntakeOutputEntryDrawer open onClose={() => {}} rows={rows} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText("IV fluid and rate"), { target: { value: "NS at 100" } });
    fireEvent.click(screen.getByRole("button", { name: "Save entry" }));
    expect(onSave.mock.calls[0][0].values).toEqual({ iv_fluid_name: "NS at 100" });
  });
});
