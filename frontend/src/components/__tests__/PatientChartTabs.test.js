import { render, screen, fireEvent } from "@testing-library/react";
import { PatientChartTabs, ComingSoonPanel, visibleChartTabs, COMING_SOON } from "../patients/PatientChartTabs";
import PatientChartHeader from "../patientHeader/PatientChartHeader";

jest.mock("../../api/client", () => ({ api: { get: jest.fn(() => Promise.reject(new Error("x"))) } }), { virtual: true });
jest.mock("../../config/api", () => ({ apiEndpoints: { patientHeader: (id) => `/h/${id}` } }), { virtual: true });
jest.mock("../../utils/auth", () => ({ getValidToken: () => Promise.resolve("t") }), { virtual: true });
jest.mock("../SimpleToast", () => ({ toast: { success: jest.fn(), error: jest.fn() } }), { virtual: true });

test("clinical roles see all nine chart tabs in order", () => {
  expect(visibleChartTabs("doctor").map((t) => t.label)).toEqual([
    "Patient List", "Orders", "Results", "Patient Info", "Documents", "Flowsheets",
    "My Schedule", "Referral List", "Clinical Summary",
  ]);
});

test("registrars only see the tabs that are not clinical", () => {
  expect(visibleChartTabs("registrar").map((t) => t.label)).toEqual([
    "Patient List", "Patient Info", "My Schedule", "Referral List",
  ]);
});

test("choosing a tab reports its value", () => {
  const onChange = jest.fn();
  render(<PatientChartTabs value="patient_list" onChange={onChange} role="nurse" />);
  fireEvent.click(screen.getByTestId("chart-tab-flowsheets"));
  expect(onChange).toHaveBeenCalledWith("flowsheets");
});

test("a stored tab the role cannot see falls back to Patient List", () => {
  render(<PatientChartTabs value="orders" onChange={() => {}} role="registrar" />);
  expect(screen.getByTestId("chart-tab-patient_list")).toHaveAttribute("aria-selected", "true");
});

test("placeholder tabs say coming soon; Patient Info is a real tab now", () => {
  expect(Object.values(COMING_SOON)).toEqual(["Referral List", "Clinical Summary"]);
  render(<ComingSoonPanel title="Referral List" patient={{ id: 1, name: "Ann Lee" }} />);
  expect(screen.getByText(/Coming soon/)).toBeInTheDocument();
  expect(screen.queryByText("Open full patient record")).not.toBeInTheDocument();
});

test("persistent header with no patient shows the empty message", () => {
  render(<PatientChartHeader persistent patientId={null} />);
  expect(screen.getByText(/No patient selected/)).toBeInTheDocument();
});

test("non-persistent header with no patient renders nothing", () => {
  const { container } = render(<PatientChartHeader patientId={null} />);
  expect(container).toBeEmptyDOMElement();
});

test("the strip shows whatever is passed for its right-hand end (the Back button)", () => {
  render(<PatientChartTabs value="patient_list" onChange={() => {}} role="doctor" right={<button>Back</button>} />);
  expect(screen.getByText("Back")).toBeInTheDocument();
});

test("listLabel renames only the first tab", () => {
  render(<PatientChartTabs value="patient_list" onChange={() => {}} role="nurse" listLabel="ED Board" />);
  expect(screen.getByTestId("chart-tab-patient_list")).toHaveTextContent("ED Board");
  expect(screen.getByTestId("chart-tab-flowsheets")).toHaveTextContent("Flowsheets");
});

test("keys limit and order the tabs for the module, still filtered by role", () => {
  const keys = ["documents", "orders", "patient_list", "clinical_summary"];
  expect(visibleChartTabs("doctor", keys).map((t) => t.value)).toEqual(["documents", "orders", "patient_list", "clinical_summary"]);
  // a registrar never gets clinical tabs, even if the layout lists them
  expect(visibleChartTabs("registrar", keys).map((t) => t.value)).toEqual(["patient_list"]);
});

test("the Patient List is always kept, first, when a layout leaves it out", () => {
  expect(visibleChartTabs("doctor", ["orders", "results"]).map((t) => t.value)).toEqual(["patient_list", "orders", "results"]);
});

test("unknown keys are ignored and an empty layout means every tab", () => {
  expect(visibleChartTabs("doctor", ["orders", "bogus"]).map((t) => t.value)).toEqual(["patient_list", "orders"]);
  expect(visibleChartTabs("doctor", []).length).toBe(9);
  expect(visibleChartTabs("doctor", null).length).toBe(9);
});

test("the strip draws only the layout's tabs, in its order", () => {
  render(<PatientChartTabs value="orders" onChange={() => {}} role="doctor" keys={["patient_list", "flowsheets", "orders"]} />);
  const tabs = screen.getAllByRole("tab").map((t) => t.textContent);
  expect(tabs).toEqual(["Patient List", "Flowsheets", "Orders"]);
});
