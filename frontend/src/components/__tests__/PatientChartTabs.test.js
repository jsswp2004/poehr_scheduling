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

test("placeholder tabs say coming soon and Patient Info offers the full record", () => {
  expect(Object.values(COMING_SOON)).toEqual(["Patient Info", "My Schedule", "Referral List", "Clinical Summary"]);
  const open = jest.fn();
  render(<ComingSoonPanel title="Patient Info" patient={{ id: 1, name: "Ann Lee" }} onOpenRecord={open} />);
  expect(screen.getByText(/Coming soon/)).toBeInTheDocument();
  fireEvent.click(screen.getByText("Open full patient record"));
  expect(open).toHaveBeenCalled();
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
