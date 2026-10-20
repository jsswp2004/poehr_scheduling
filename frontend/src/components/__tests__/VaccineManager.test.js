import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";

jest.mock("../../api/client", () => ({ api: { get: jest.fn(), post: jest.fn() } }), { virtual: true });
jest.mock(
  "../../config/api",
  () => ({
    apiEndpoints: {
      vaccineCatalog: "/cat/",
      vaccinePatient: (id) => `/p/${id}/`,
      vaccinePatientDoses: (id) => `/p/${id}/doses/`,
      vaccinePatientNotDone: (id) => `/p/${id}/not-done/`,
      vaccinePatientRisk: (id) => `/p/${id}/risk/`,
      vaccineRiskDismiss: (id) => `/p/${id}/risk/dismiss/`,
      vaccineRiskDetail: (id, a) => `/p/${id}/risk/${a}/`,
      vaccineVoid: (id) => `/void/${id}/`,
    },
  }),
  { virtual: true }
);
jest.mock("../../utils/auth", () => ({ getValidToken: async () => ({ access_token: "t" }) }), { virtual: true });
jest.mock("../../utils/tokenManager", () => ({}), { virtual: true });
jest.mock("jwt-decode", () => ({ jwtDecode: () => ({ role: "doctor", user_id: 5 }) }));

jest.mock("../OrdersPanel", () => ({ __esModule: true, default: (props) => <div data-testid="orders-panel" data-search={props.initialSearch} data-patient={props.patientId} /> }));

import { api } from "../../api/client";
import VaccineManager, { DosePips, StatusPill } from "../vaccines/VaccineManager";

const PATIENT = { id: 3, name: "Test, Child" };
const rec = (item, name, status, label, extra = {}) => ({
  item, name, kind: "vaccine", status, status_label: label, why: `${name} reason`, last_done: null, next_due: null,
  dose_number: null, dose_count: 1, doses: [], rule_id: 1, ...extra,
});
const BODY = (over = {}) => ({
  patient: { id: 3, name: "Test, Child", date_of_birth: "2025-01-01", sex: "female", age_months: 21 },
  as_of: "2026-10-20", problem: "", problem_text: "", schedule: { id: 1, name: "AAP child", edition: "2026", source: "AAP" },
  clash: [], counts: {}, due_now: 2, risk_schedules: [], suggestions: [],
  recommendations: [
    rec("dtap", "DTaP", "due", "Due now", { dose_count: 5, dose_number: 4, doses: ["given", "given", "given", "due", "later"] }),
    rec("hepa", "Hepatitis A", "overdue", "Overdue"),
    rec("rota", "Rotavirus", "aged_out", "Aged out"),
  ],
  history: [], can_record: true, ...over,
});
const CATALOG = {
  items: [
    { code: "dtap", name: "DTaP", kind: "vaccine", products: [{ cvx: "20", name: "DTaP" }] },
    { code: "hepa", name: "Hepatitis A", kind: "vaccine", products: [{ cvx: "83", name: "HepA ped" }] },
  ],
  lookups: { manufacturer: [{ id: 9, name: "Sanofi", code: "PMC" }] },
  reasons: [{ value: "declined", label: "Parent declined" }, { value: "illness", label: "Current illness" }],
  risk_schedules: [],
};

beforeEach(() => {
  api.get.mockReset();
  api.post.mockReset();
  api.get.mockImplementation((url) => Promise.resolve({ data: url === "/cat/" ? CATALOG : BODY() }));
});

test("shows status as text, the due banner, and hides aged out items by default", async () => {
  render(<VaccineManager patient={PATIENT} />);
  expect(await screen.findByTestId("vm-row-dtap")).toBeInTheDocument();
  expect(screen.getByText("2 vaccines are due at this visit")).toBeInTheDocument();
  expect(within(screen.getByTestId("vm-row-hepa")).getByText("Overdue")).toBeInTheDocument();
  expect(screen.queryByTestId("vm-row-rota")).toBeNull();
  fireEvent.click(screen.getByLabelText(/Show aged out/));
  expect(screen.getByTestId("vm-row-rota")).toBeInTheDocument();
});

test("record due vaccines opens one form with every due vaccine and posts them together", async () => {
  api.post.mockResolvedValue({ data: { ...BODY(), saved: [{ id: 1 }, { id: 2 }] } });
  render(<VaccineManager patient={PATIENT} />);
  fireEvent.click(await screen.findByTestId("vm-record-due"));
  expect(await screen.findByTestId("vm-dose-0")).toBeInTheDocument();
  expect(screen.getByTestId("vm-dose-1")).toBeInTheDocument();
  fireEvent.click(screen.getByTestId("vm-save-dose"));
  await waitFor(() => expect(api.post).toHaveBeenCalled());
  const [url, body] = api.post.mock.calls[0];
  expect(url).toBe("/p/3/doses/");
  expect(body.doses.map((d) => d.item)).toEqual(["dtap", "hepa"]);
  expect(body.doses[0].given_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(await screen.findByText("Recorded 2 doses.")).toBeInTheDocument();
});

test("a server error stays in the dialog", async () => {
  api.post.mockRejectedValue({ response: { data: { detail: "Given date cannot be in the future." } } });
  render(<VaccineManager patient={PATIENT} />);
  fireEvent.click(await screen.findByTestId("vm-record-due"));
  fireEvent.click(await screen.findByTestId("vm-save-dose"));
  expect(await screen.findByTestId("vm-record-error")).toBeInTheDocument();
});

test("not done posts the reason", async () => {
  api.post.mockResolvedValue({ data: BODY() });
  render(<VaccineManager patient={PATIENT} />);
  const row = await screen.findByTestId("vm-row-hepa");
  fireEvent.click(within(row).getByText("Not done"));
  fireEvent.click(await screen.findByLabelText("Current illness"));
  fireEvent.click(screen.getByTestId("vm-save-notdone"));
  await waitFor(() => expect(api.post).toHaveBeenCalled());
  expect(api.post.mock.calls[0][0]).toBe("/p/3/not-done/");
  expect(api.post.mock.calls[0][1]).toMatchObject({ item: "hepa", reason: "illness" });
});

test("a suggested risk schedule can be added by a clinician", async () => {
  const body = BODY({ suggestions: [{ schedule: 7, name: "Diabetes", problem: "Type 2 diabetes", problem_code: "E11.9", problem_id: 4 }] });
  api.get.mockImplementation((url) => Promise.resolve({ data: url === "/cat/" ? CATALOG : body }));
  api.post.mockResolvedValue({ data: BODY() });
  render(<VaccineManager patient={PATIENT} />);
  fireEvent.click(await screen.findByText("Add schedule"));
  await waitFor(() => expect(api.post).toHaveBeenCalled());
  expect(api.post.mock.calls[0][0]).toBe("/p/3/risk/");
  expect(api.post.mock.calls[0][1]).toEqual({ schedule: 7, problem: 4 });
});

test("a schedule clash shows the problem and no recording is hidden away", async () => {
  const body = BODY({ problem: "schedule_clash", problem_text: "Two approved schedules apply.", clash: [{ name: "A" }, { name: "B" }], recommendations: [] });
  api.get.mockImplementation((url) => Promise.resolve({ data: url === "/cat/" ? CATALOG : body }));
  render(<VaccineManager patient={PATIENT} />);
  expect(await screen.findByTestId("vm-problem")).toHaveTextContent("Two approved schedules apply.");
});

test("users without the record right see no action buttons", async () => {
  const body = BODY({ can_record: false });
  api.get.mockImplementation((url) => Promise.resolve({ data: url === "/cat/" ? CATALOG : body }));
  render(<VaccineManager patient={PATIENT} />);
  await screen.findByTestId("vm-row-dtap");
  expect(screen.queryByText("Mark done")).toBeNull();
  expect(screen.queryByTestId("vm-record-due")).toBeNull();
});

test("the order icon shows only on due-now vaccines and opens Orders with the vaccine searched", async () => {
  render(<VaccineManager patient={PATIENT} chartVisit={{ appointmentId: 5 }} />);
  await screen.findByTestId("vm-row-dtap");
  expect(screen.getByTestId("vm-order-dtap")).toBeInTheDocument();
  expect(screen.queryByTestId("vm-order-hepa")).toBeNull();
  fireEvent.click(screen.getByTestId("vm-order-dtap"));
  const panel = await screen.findByTestId("orders-panel");
  expect(panel).toHaveAttribute("data-search", "DTaP");
  expect(panel).toHaveAttribute("data-patient", "3");
});

test("no order icon without the record right", async () => {
  const body = BODY({ can_record: false });
  api.get.mockImplementation((url) => Promise.resolve({ data: url === "/cat/" ? CATALOG : body }));
  render(<VaccineManager patient={PATIENT} />);
  await screen.findByTestId("vm-row-dtap");
  expect(screen.queryByTestId("vm-order-dtap")).toBeNull();
});

test("pips and pills render text", () => {
  render(<><DosePips doses={["given", "due", "later"]} /><StatusPill status="due" label="Due now" /></>);
  expect(screen.getByTestId("dose-pips").children).toHaveLength(3);
  expect(screen.getByText("Due now")).toBeInTheDocument();
});
