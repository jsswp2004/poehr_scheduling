import { render, screen } from "@testing-library/react";

jest.mock("../../api/client", () => ({ api: { get: jest.fn() } }), { virtual: true });
jest.mock("../../config/api", () => ({ apiEndpoints: { pharmacyPatients: "/pharmacy/patients/", pharmacyQueue: "/pharmacy/queue/", formulary: "/f/" } }), { virtual: true });
jest.mock("../../utils/auth", () => ({ getValidToken: async () => "t" }), { virtual: true });
jest.mock("react-toastify", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

import { api } from "../../api/client";
import PharmacyPatientList from "../pharmacy/PharmacyPatientList";
import FormularyPanel from "../pharmacy/FormularyPanel";

beforeEach(() => api.get.mockReset());

test("the Pharmacy patient list's care-setting filter: label above the value, not on top of it", async () => {
  api.get.mockResolvedValue({ data: { results: [] } });
  render(<PharmacyPatientList onSelect={() => {}} />);
  await screen.findByTestId("pharmacy-list-empty");
  const label = screen.getByText("Filter by Care Setting", { selector: "label" });
  expect(label).toHaveClass("MuiInputLabel-shrink"); // sits in the outline's notch
  expect(screen.getByText("All care settings")).toBeInTheDocument(); // the empty value is shown
  // the outline leaves room for the label (a notched outline keeps the legend text)
  const control = screen.getByTestId("pharmacy-care-filter").closest(".MuiFormControl-root");
  expect(control.querySelector("fieldset legend span").textContent).toBe("Filter by Care Setting");
});

test("Formulary filters show 'All' / 'Any' with the label above", async () => {
  api.get.mockResolvedValue({ data: { results: [], can_edit: false } });
  render(<FormularyPanel />);
  await screen.findByText("No items.");
  expect(screen.getByText("Items", { selector: "label" })).toHaveClass("MuiInputLabel-shrink");
  expect(screen.getByText("All")).toBeInTheDocument();
});
