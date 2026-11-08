import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import DynamicNoteForm, { formatFieldValue } from "../DynamicNoteForm";

// The real picker searches the server; here it is a stub that records what it was given
// and "picks" one code when its button is pressed.
jest.mock("../IcdCodePicker", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: ({ label, value, onChange, disabled }) =>
      React.createElement(
        "div",
        null,
        React.createElement("span", { "data-testid": "picker-label" }, label),
        React.createElement("span", { "data-testid": "picker-value" }, JSON.stringify(value)),
        React.createElement(
          "button",
          {
            type: "button",
            disabled,
            onClick: () => onChange([{ code: "P07.39", description: "Preterm newborn, gestational age 36 completed weeks" }]),
          },
          "pick code"
        )
      ),
    dxLabel: (dx) => (dx.description ? `${dx.code} - ${dx.description}` : dx.code),
  };
});

const FIELD = { key: "diagnoses", label: "Diagnoses (ICD-10)", field_type: "icd10", section_label: "Diagnoses", options: [] };

function Harness({ field = FIELD, initial = {}, onValues = () => {} }) {
  const [values, setValues] = useState(initial);
  onValues(values);
  return (
    <DynamicNoteForm
      template={{ fields: [field] }}
      values={values}
      onChange={(key, value) => setValues((prev) => ({ ...prev, [key]: value }))}
    />
  );
}

test("an ICD-10 field starts as an empty list and stores the picked codes", () => {
  let latest = {};
  render(<Harness onValues={(v) => (latest = v)} />);
  expect(screen.getByTestId("picker-label")).toHaveTextContent("Diagnoses (ICD-10)");
  expect(screen.getByTestId("picker-value")).toHaveTextContent("[]");
  fireEvent.click(screen.getByRole("button", { name: "pick code" }));
  expect(latest.diagnoses).toEqual([
    { code: "P07.39", description: "Preterm newborn, gestational age 36 completed weeks" },
  ]);
  expect(screen.getByTestId("picker-value")).toHaveTextContent("P07.39");
});

test("a required ICD-10 field is marked with an asterisk", () => {
  render(<Harness field={{ ...FIELD, required: true }} />);
  expect(screen.getByTestId("picker-label")).toHaveTextContent("Diagnoses (ICD-10) *");
});

test("a read-only form disables the picker", () => {
  render(
    <DynamicNoteForm template={{ fields: [FIELD] }} values={{ diagnoses: [] }} onChange={() => {}} disabled />
  );
  expect(screen.getByRole("button", { name: "pick code" })).toBeDisabled();
});

test("saved codes read as one line per note: code - description, separated by semicolons", () => {
  const value = [
    { code: "P07.39", description: "Preterm newborn, gestational age 36 completed weeks" },
    { code: "Z38.00", description: "" },
  ];
  expect(formatFieldValue(FIELD, value, {})).toBe(
    "P07.39 - Preterm newborn, gestational age 36 completed weeks; Z38.00"
  );
});

test("text saved before the field became a picker still shows as typed", () => {
  expect(formatFieldValue(FIELD, "E11.9 Type 2 diabetes", {})).toBe("E11.9 Type 2 diabetes");
});

test("an empty or missing list shows nothing", () => {
  expect(formatFieldValue(FIELD, [], {})).toBeNull();
  expect(formatFieldValue(FIELD, undefined, {})).toBeNull();
  expect(formatFieldValue(FIELD, "", {})).toBeNull();
});

describe("field widths", () => {
  const { fieldSpan } = require("../DynamicNoteForm");

  it("maps each width to a share of the 12-column grid", () => {
    expect(fieldSpan({ width: "full" })).toBe(12);
    expect(fieldSpan({ width: "half" })).toBe(6);
    expect(fieldSpan({ width: "third" })).toBe(4);
    expect(fieldSpan({ width: "quarter" })).toBe(3);
  });

  it("gives templates without a width the whole row", () => {
    expect(fieldSpan({})).toBe(12);
    expect(fieldSpan({ width: "bogus" })).toBe(12);
    expect(fieldSpan(undefined)).toBe(12);
  });
});
