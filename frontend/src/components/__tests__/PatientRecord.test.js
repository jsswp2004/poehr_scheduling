import { render, screen } from "@testing-library/react";

jest.mock("react-router-dom", () => ({ useNavigate: () => jest.fn(), useParams: () => ({ id: "7" }) }), { virtual: true });
jest.mock("axios", () => ({ get: jest.fn(), post: jest.fn(), patch: jest.fn() }), { virtual: true });
jest.mock("../CreateAppointmentForm", () => () => null, { virtual: true });
jest.mock("../patients/ChartPageShell", () => ({ children }) => <div data-testid="shell">{children}</div>, { virtual: true });
jest.mock("../BackButton", () => () => <button>Back to list</button>, { virtual: true });
jest.mock("../patientHeader/PatientChartHeader", () => () => <div data-testid="chart-header" />, { virtual: true });
jest.mock("../SimpleToast", () => ({ toast: { success: jest.fn(), error: jest.fn() } }), { virtual: true });
jest.mock("../../config/api", () => ({ API_BASE_URL: "http://api" }), { virtual: true });
jest.mock("../../utils/auth", () => ({ getValidToken: () => Promise.resolve("t"), clearAuthData: jest.fn() }), { virtual: true });
const patient = { id: 7, user_id: 7, first_name: "Ann", last_name: "Lee", email: "a@b.c", username: "ann" };
jest.mock("../../hooks/usePatientData", () => ({ usePatientData: () => ({ patient, setPatient: jest.fn(), fetchPatientWithToken: jest.fn() }) }), { virtual: true });
jest.mock("../../hooks/useDoctorsData", () => ({ useDoctorsData: () => ({ doctors: [], fetchDoctorsWithToken: jest.fn() }) }), { virtual: true });
jest.mock("../../hooks/useOrganizationsData", () => ({ useOrganizationsData: () => ({ organizations: [], fetchOrganizationsWithToken: jest.fn() }) }), { virtual: true });
jest.mock("../../hooks/useRoleValidation", () => ({ useRoleValidation: () => ({ userRole: "doctor", validateRoleWithToken: jest.fn() }) }), { virtual: true });

import PatientDetailPage, { PatientRecord } from "../../pages/PatientDetailPage";

test("embedded: just the record, no page chrome and no extra Back button or header", () => {
  render(<PatientRecord id="7" embedded />);
  expect(screen.getByTestId("patient-record")).toBeInTheDocument();
  expect(screen.queryByTestId("shell")).not.toBeInTheDocument();
  expect(screen.queryByText("Back to list")).not.toBeInTheDocument();
  expect(screen.queryByTestId("chart-header")).not.toBeInTheDocument();
});

test("standalone page has the side bar shell and header, and no Back button of its own", () => {
  render(<PatientDetailPage />);
  expect(screen.getByTestId("shell")).toBeInTheDocument();
  expect(screen.queryByText("Back to list")).not.toBeInTheDocument();
  expect(screen.getByTestId("chart-header")).toBeInTheDocument();
});

test("neither the embedded nor the standalone record has an outer card or padding (the form below is the card), so the header sits tight under the top bar", () => {
  const { unmount } = render(<PatientRecord id="7" embedded />);
  expect(getComputedStyle(screen.getByTestId("patient-record")).boxShadow).toBe("");
  expect(getComputedStyle(screen.getByTestId("patient-record")).padding).toBe("0px");
  unmount();
  render(<PatientRecord id="7" />);
  expect(getComputedStyle(screen.getByTestId("patient-record")).boxShadow).toBe("");
  expect(getComputedStyle(screen.getByTestId("patient-record")).padding).toBe("0px");
});
