import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import AppliesToPicker from "../AppliesToPicker";

const units = [
  { id: 1, name: "2 West" },
  { id: 2, name: "Oak Wing" },
  { id: 3, name: "Garden Level" },
];

test("All units is chosen by default and hides the unit picker", () => {
  render(<AppliesToPicker units={units} value={{ all: true, unitIds: [] }} onChange={jest.fn()} />);
  expect(screen.getByLabelText(/All units/)).toBeChecked();
  expect(screen.queryByLabelText("Units")).not.toBeInTheDocument();
});

test("choosing Selected units reports the change", async () => {
  const onChange = jest.fn();
  render(<AppliesToPicker units={units} value={{ all: true, unitIds: [] }} onChange={onChange} />);
  await userEvent.click(screen.getByLabelText(/Selected units/));
  expect(onChange).toHaveBeenCalledWith({ all: false, unitIds: [] });
});

test("units covered by another standard are disabled and say which", async () => {
  render(
    <AppliesToPicker
      units={units}
      value={{ all: false, unitIds: [1] }}
      onChange={jest.fn()}
      owners={{ 2: 9 }}
      ruleNames={{ 9: "Maryland nursing home" }}
      ruleId={5}
    />
  );
  await userEvent.click(screen.getByLabelText("Units"));
  expect(await screen.findByText("Covered by Maryland nursing home")).toBeInTheDocument();
  expect(screen.getByRole("option", { name: /Oak Wing/ })).toHaveAttribute("aria-disabled", "true");
  expect(screen.getByRole("option", { name: /Garden Level/ })).not.toHaveAttribute("aria-disabled", "true");
});

test("shows the error under the picker", () => {
  render(<AppliesToPicker units={units} value={{ all: false, unitIds: [] }} onChange={jest.fn()} error="Choose at least one unit." />);
  expect(screen.getByText("Choose at least one unit.")).toBeInTheDocument();
});
