import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import SurgeryPage from "../SurgeryPage";
import { surgeryApi } from "../../components/surgery/surgeryApi";

jest.mock("react-router-dom", () => ({ useNavigate: () => jest.fn() }), { virtual: true });
jest.mock("jwt-decode", () => ({ jwtDecode: () => ({ role: "nurse" }) }));
jest.mock("../../components/surgery/surgeryApi", () => ({
  surgeryApi: {
    planner: jest.fn(),
    cases: jest.fn(),
    getCase: jest.fn(),
    setStatus: jest.fn(),
    doctors: jest.fn(),
    openVisits: jest.fn(),
    searchPatients: jest.fn(),
    rooms: jest.fn(),
    history: jest.fn(),
    lookups: jest.fn(),
    participants: jest.fn(),
    bayOptions: jest.fn(),
  },
}));
jest.mock("../../components/SimpleToast", () => ({ toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));
jest.mock("../../components/patientHeader/headerApi", () => ({ errorText: (e, f) => e?.response?.data?.detail || f }));

const caseRow = {
  id: 1, case_number: 1001, date: "2026-11-03", time: "08:00", room: { id: 10, name: "OR-1" },
  patient: { id: 5, name: "Bascom, Mark B", mrn: "MRN-000001", age: "59y", sex: "M" }, visit: null,
  procedures_text: "CYSTOSCOPY", surgeon: null, service: "Urology", case_type_label: "Elective",
  status: "pending", status_label: "Pending", next_statuses: ["preop", "cancelled"], times: { pacu_start: null },
};
const plannerPayload = {
  date: "2026-11-03", facility: 7, facilities: [{ id: 7, name: "General Hospital" }], day_start: 7, day_end: 19,
  rooms: [{ id: 10, name: "OR-1", cases: [] }], unassigned: [],
  legend: ["pending", "preop", "or", "pacu", "discharged", "cancelled", "transferred"].map((s) => ({ status: s, label: s, count: s === "pending" ? 1 : 0 })),
};

const renderPage = () => render(<SurgeryPage />);

beforeEach(() => {
  jest.spyOn(Storage.prototype, "getItem").mockReturnValue("token");
  Object.values(surgeryApi).forEach((f) => f.mockReset());
  surgeryApi.planner.mockResolvedValue(plannerPayload);
  surgeryApi.cases.mockResolvedValue({ results: [caseRow] });
  surgeryApi.doctors.mockResolvedValue([]);
  surgeryApi.openVisits.mockResolvedValue([]);
  surgeryApi.lookups.mockResolvedValue({ delay_reasons: [], physical_statuses: [], anesthesia_types: [], participant_roles: [], me: { id: 1, name: "Me" } });
  surgeryApi.participants.mockResolvedValue([]);
  surgeryApi.setStatus.mockResolvedValue({ ...caseRow, status: "preop", status_label: "In PreOp", case_number: 1001, next_statuses: ["or", "cancelled"] });
});

test("loads the day's cases and the first facility", async () => {
  renderPage();
  expect(await screen.findByText("BASCOM, MARK B")).toBeInTheDocument();
  expect(surgeryApi.planner).toHaveBeenCalledWith(expect.objectContaining({ date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }));
  expect(surgeryApi.cases).toHaveBeenCalledWith(expect.objectContaining({ facility: 7 }));
  expect(screen.queryByRole("button", { name: "Manage Rooms" })).toBeNull(); // nurses do not manage rooms
});

test("moving to the next day reloads for that date", async () => {
  renderPage();
  await screen.findByText("BASCOM, MARK B");
  const first = surgeryApi.planner.mock.calls[0][0].date;
  fireEvent.click(screen.getByLabelText("Next day"));
  await waitFor(() => expect(surgeryApi.planner.mock.calls.some((c) => c[0].date > first)).toBe(true));
});

test("Start PreOp asks which bed, then calls the status endpoint with it and reloads", async () => {
  surgeryApi.bayOptions.mockResolvedValue([
    { id: 31, name: "1", room: "Pre-op", unit: "Operating Rooms", state: "available", note: "", current: false },
    { id: 32, name: "2", room: "Pre-op", unit: "Operating Rooms", state: "occupied", note: "Lee, Ann", current: false },
  ]);
  renderPage();
  fireEvent.click((await screen.findByText("BASCOM, MARK B")).closest("tr"));
  fireEvent.click(screen.getByRole("button", { name: "Start PreOp" }));
  expect(await screen.findByText("Move to PreOp: choose a bed")).toBeInTheDocument();
  expect(surgeryApi.setStatus).not.toHaveBeenCalled();
  expect(await screen.findByText("Lee, Ann")).toBeInTheDocument(); // beds load after the dialog opens
  fireEvent.click(screen.getByRole("button", { name: "Bed 1 in Pre-op" }));
  fireEvent.click(screen.getByRole("button", { name: "Move to PreOp" }));
  await waitFor(() => expect(surgeryApi.setStatus).toHaveBeenCalledWith(1, "preop", "", 31));
  await waitFor(() => expect(surgeryApi.cases.mock.calls.length).toBeGreaterThan(1));
});

test("Decide later moves the case to PreOp without a bed", async () => {
  surgeryApi.bayOptions.mockResolvedValue([]);
  renderPage();
  fireEvent.click((await screen.findByText("BASCOM, MARK B")).closest("tr"));
  fireEvent.click(screen.getByRole("button", { name: "Start PreOp" }));
  expect(await screen.findByText(/No PreOp or PACU beds are set up yet/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Decide later" }));
  await waitFor(() => expect(surgeryApi.setStatus).toHaveBeenCalledWith(1, "preop", "", null));
});

test("other moves, such as Patient In OR, go straight through without a bed picker", async () => {
  surgeryApi.cases.mockResolvedValue({ results: [{ ...caseRow, status: "preop", status_label: "In PreOp", next_statuses: ["or", "cancelled"] }] });
  renderPage();
  fireEvent.click((await screen.findByText("BASCOM, MARK B")).closest("tr"));
  fireEvent.click(screen.getByRole("button", { name: "Patient In OR" }));
  await waitFor(() => expect(surgeryApi.setStatus).toHaveBeenCalledWith(1, "or"));
  expect(surgeryApi.bayOptions).not.toHaveBeenCalled();
});

test("Cancel Case opens the dialog instead of cancelling without a reason", async () => {
  surgeryApi.getCase.mockResolvedValue({ ...caseRow, comments: "", cancel_reason: "", anesthesia_type: "", duration_minutes: 60, case_type: "elective", procedures: [], times: {} });
  renderPage();
  fireEvent.click((await screen.findByText("BASCOM, MARK B")).closest("tr"));
  fireEvent.click(screen.getByRole("button", { name: "Cancel Case" }));
  expect(await screen.findByText("Case 1001")).toBeInTheDocument();
  expect(surgeryApi.setStatus).not.toHaveBeenCalled();
});

test("shows the server's message when the schedule cannot load", async () => {
  surgeryApi.planner.mockRejectedValue({ response: { data: { detail: "No facility available." } } });
  renderPage();
  expect(await screen.findByText("No facility available.")).toBeInTheDocument();
});

test("the Status Board tab shows the same day's cases", async () => {
  renderPage();
  await screen.findByText("BASCOM, MARK B");
  fireEvent.click(screen.getByRole("tab", { name: "Status Board" }));
  expect(await screen.findByTestId("status-board")).toBeInTheDocument();
  expect(screen.getByText("BASCOM, M.")).toBeInTheDocument(); // the board cuts names down by default
});

test("Open Case Details adds a Case Details tab for the selected case", async () => {
  surgeryApi.getCase.mockResolvedValue({
    ...caseRow, scheduled_start: "2026-11-03T08:00:00-05:00", duration_minutes: 60, procedures: [], comments: "", anesthesia_type: "",
    case_type: "elective", time_reasons: {}, times: {},
    header: { scheduled_delay_minutes: 0, planned_delay_minutes: 0, actual_minutes: null, requires_review: false },
  });
  renderPage();
  fireEvent.click(await screen.findByText("BASCOM, MARK B"));
  fireEvent.click(screen.getByRole("button", { name: "Open Case Details" }));
  expect(await screen.findByRole("tab", { name: "Case Details" })).toBeInTheDocument();
  await waitFor(() => expect(surgeryApi.getCase).toHaveBeenCalledWith(1));
  expect(await screen.findByRole("tab", { name: "Case Header" })).toBeInTheDocument();
});

test("lists the operating-room units, not facilities, and a unit narrows the load", async () => {
  const units = [
    { id: 21, name: "Main OR", facility: 7, label: "Main OR" },
    { id: 22, name: "Ambulatory Surgery", facility: 7, label: "Ambulatory Surgery" },
  ];
  surgeryApi.planner.mockResolvedValue({ ...plannerPayload, facilities: [{ id: 7, name: "General Hospital" }, { id: 8, name: "Annex" }], units, unit: null, all_units: true });
  renderPage();
  await screen.findByText("BASCOM, MARK B");
  expect(screen.queryByLabelText("Facility")).toBeNull();
  fireEvent.mouseDown(screen.getByLabelText("Unit"));
  expect(screen.getByRole("option", { name: "All surgical units" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("option", { name: "Main OR" }));
  await waitFor(() => expect(surgeryApi.planner).toHaveBeenLastCalledWith(expect.objectContaining({ unit: "21" })));
  await waitFor(() => expect(surgeryApi.cases).toHaveBeenLastCalledWith(expect.objectContaining({ facility: 7 })));
});

test("with units in several facilities there is no All choice and the first unit is picked", async () => {
  const units = [
    { id: 21, name: "Main OR", facility: 7, label: "General Hospital \u203a Main OR" },
    { id: 31, name: "Annex OR", facility: 8, label: "Annex \u203a Annex OR" },
  ];
  surgeryApi.planner.mockResolvedValue({ ...plannerPayload, units, unit: 21, all_units: false });
  renderPage();
  await screen.findByText("BASCOM, MARK B");
  await waitFor(() => expect(surgeryApi.planner).toHaveBeenLastCalledWith(expect.objectContaining({ unit: "21" })));
  fireEvent.mouseDown(screen.getByLabelText("Unit"));
  expect(screen.queryByRole("option", { name: "All surgical units" })).toBeNull();
  expect(screen.getByRole("option", { name: "Annex \u203a Annex OR" })).toBeInTheDocument();
});
