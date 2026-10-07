import { render, screen, waitFor } from "@testing-library/react";

jest.mock("react-router-dom", () => ({ useNavigate: () => jest.fn(), useSearchParams: () => [new URLSearchParams()] }), { virtual: true });
jest.mock("../../api/client", () => ({ api: { get: jest.fn(), post: jest.fn(), patch: jest.fn() } }), { virtual: true });
jest.mock("../../config/api", () => ({ apiEndpoints: { clinicalNote: (i) => `/n/${i}`, vitalSignsFlowsheets: "/fs", flowsheetTemplates: "/ft" } }), { virtual: true });
jest.mock("../../utils/auth", () => ({ getValidToken: async () => ({ access_token: "t" }) }), { virtual: true });
jest.mock("../../utils/calculations", () => ({ applyCalculations: (x) => x }), { virtual: true });
jest.mock("jwt-decode", () => ({ jwtDecode: () => ({ role: "doctor", user_id: 1 }) }), { virtual: true });
jest.mock("../SimpleToast", () => ({ toast: { error: jest.fn(), success: jest.fn() } }), { virtual: true });
jest.mock("../DynamicNoteForm", () => ({ __esModule: true, default: () => null, isFieldVisible: () => true }), { virtual: true });
jest.mock("../NotePreviewPane", () => () => null, { virtual: true });
jest.mock("../IcdCodePicker", () => ({ __esModule: true, default: () => null, dxLabel: () => "" }), { virtual: true });

import { api } from "../../api/client";
import ClinicalNotesPanel from "../ClinicalNotesPanel";
import VitalSignsFlowsheetPanel from "../VitalSignsFlowsheetPanel";

beforeEach(() => {
  api.get.mockReset();
  api.get.mockImplementation((url) =>
    Promise.resolve({ data: String(url).includes("appointments") ? [{ id: 55, title: "Visit VN-1", appointment_datetime: "2026-10-06T10:00:00Z" }] : { results: [] } })
  );
});

test("Documents: header has no patient name and, with the header's visit, no visit picker", async () => {
  render(<ClinicalNotesPanel patientId={3} patientName="Devon Baptiste" chartVisit={{ loading: false, appointmentId: 55 }} />);
  expect(await screen.findByRole("heading", { name: "Clinical Documentation" })).toBeInTheDocument();
  expect(screen.queryByText(/Devon Baptiste/)).toBeNull();
  await waitFor(() => expect(api.get).toHaveBeenCalled());
  expect(screen.queryByText("Appointment / Registration")).toBeNull();
});

test("Documents: the standalone page still has the visit picker", async () => {
  render(<ClinicalNotesPanel patientId={3} patientName="Devon Baptiste" />);
  expect((await screen.findAllByText("Appointment / Registration")).length).toBeGreaterThan(0);
});

test("Flowsheets: plain header and no visit picker with the header's visit", async () => {
  render(<VitalSignsFlowsheetPanel patientId={3} patientName="Devon Baptiste" chartVisit={{ loading: false, appointmentId: 55 }} />);
  expect(await screen.findByRole("heading", { name: "Flowsheets" })).toBeInTheDocument();
  expect(screen.queryByText(/Devon Baptiste/)).toBeNull();
  expect(screen.queryByText("Appointment / Registration")).toBeNull();
});

test("Flowsheets: the standalone page keeps the picker", async () => {
  render(<VitalSignsFlowsheetPanel patientId={3} patientName="Devon Baptiste" />);
  expect((await screen.findAllByText("Appointment / Registration")).length).toBeGreaterThan(0);
});
