import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import CaseDialog from "./CaseDialog";
import { surgeryApi } from "./surgeryApi";

jest.mock("./surgeryApi", () => ({
  surgeryApi: {
    doctors: jest.fn(),
    openVisits: jest.fn(),
    searchPatients: jest.fn(),
    createCase: jest.fn(),
    updateCase: jest.fn(),
    getCase: jest.fn(),
    setStatus: jest.fn(),
    history: jest.fn(),
    bayOptions: jest.fn(),
  },
}));
jest.mock("../SimpleToast", () => ({ toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));
jest.mock("../patientHeader/headerApi", () => ({ errorText: (e, f) => e?.response?.data?.detail || f }));

const rooms = [{ id: 10, name: "OR-1" }];
const base = { open: true, facilityId: 7, rooms, canEdit: true, onClose: jest.fn(), onSaved: jest.fn() };

beforeEach(() => {
  surgeryApi.doctors.mockResolvedValue([{ id: 2, first_name: "Jeffrey", last_name: "Lee" }]);
  surgeryApi.openVisits.mockResolvedValue([{ id: 3, visit_number: "VN-000003", reason_for_visit: "Hernia" }]);
  surgeryApi.searchPatients.mockResolvedValue([{ id: 5, first_name: "Mark", last_name: "Bascom", mrn: "MRN-000001" }]);
});

test("books a new case for the picked patient with the form's values", async () => {
  const onSaved = jest.fn();
  const onClose = jest.fn();
  surgeryApi.createCase.mockResolvedValue({ id: 9, case_number: 1001, warnings: [] });
  render(<CaseDialog {...base} caseId={null} defaults={{ date: "2026-11-03", room: 10, time: "08:00" }} onSaved={onSaved} onClose={onClose} />);

  const patientInput = screen.getByLabelText(/Patient/);
  fireEvent.focus(patientInput); // a person focuses the box before typing
  fireEvent.change(patientInput, { target: { value: "basc" } });
  fireEvent.click(await screen.findByText("Bascom, Mark (MRN-000001)"));
  fireEvent.change(screen.getByLabelText("Procedure"), { target: { value: "CYSTOSCOPY" } });
  fireEvent.change(screen.getByLabelText("Service"), { target: { value: "Urology" } });
  fireEvent.click(screen.getByRole("button", { name: "Book Case" }));

  await waitFor(() => expect(surgeryApi.createCase).toHaveBeenCalledTimes(1));
  expect(surgeryApi.createCase.mock.calls[0][0]).toEqual(
    expect.objectContaining({
      patient: 5,
      facility: 7,
      room: 10,
      scheduled_start: "2026-11-03T08:00",
      duration_minutes: 60,
      service: "Urology",
      case_type: "elective",
      visit: null,
      procedures: [{ name: "CYSTOSCOPY", laterality: "", cpt_code: "" }],
    })
  );
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ case_number: 1001 })));
  expect(onClose).toHaveBeenCalled();
});

test("will not book without a patient", async () => {
  render(<CaseDialog {...base} caseId={null} defaults={{ date: "2026-11-03" }} />);
  fireEvent.click(screen.getByRole("button", { name: "Book Case" }));
  expect(await screen.findByText("Pick a patient.")).toBeInTheDocument();
  expect(surgeryApi.createCase).not.toHaveBeenCalled();
});

test("shows the server's reason when booking is refused", async () => {
  surgeryApi.createCase.mockRejectedValue({ response: { data: { detail: "That room belongs to a different facility." } } });
  render(<CaseDialog {...base} caseId={null} defaults={{ date: "2026-11-03" }} />);
  const patientInput = screen.getByLabelText(/Patient/);
  fireEvent.focus(patientInput); // a person focuses the box before typing
  fireEvent.change(patientInput, { target: { value: "basc" } });
  fireEvent.click(await screen.findByText("Bascom, Mark (MRN-000001)"));
  fireEvent.click(screen.getByRole("button", { name: "Book Case" }));
  expect(await screen.findByText("That room belongs to a different facility.")).toBeInTheDocument();
});

const existing = {
  id: 1, case_number: 1001, date: "2026-11-03", time: "08:00", duration_minutes: 90, room: { id: 10, name: "OR-1" },
  patient: { id: 5, name: "Bascom, Mark B", mrn: "MRN-000001" }, visit: null, surgeon: null, service: "Urology",
  case_type: "elective", anesthesia_type: "", comments: "", procedures: [{ id: 1, name: "CYSTOSCOPY", laterality: "right", cpt_code: "" }],
  status: "pending", status_label: "Pending", next_statuses: ["preop", "cancelled"], cancel_reason: "",
  times: { preop_start: null, patient_in: null, procedure_start: null, procedure_end: null, patient_out: null, pacu_start: null, discharged_at: null },
};

test("cancelling asks for a reason before it sends anything", async () => {
  surgeryApi.getCase.mockResolvedValue(existing);
  surgeryApi.setStatus.mockResolvedValue({ ...existing, status: "cancelled", status_label: "Procedure Cancelled", next_statuses: [] });
  render(<CaseDialog {...base} caseId={1} defaults={{ date: "2026-11-03" }} />);
  fireEvent.click(await screen.findByRole("button", { name: "Cancel Case" }));
  expect(surgeryApi.setStatus).not.toHaveBeenCalled();
  const confirm = screen.getByRole("button", { name: "Confirm Cancel" });
  expect(confirm).toBeDisabled();
  fireEvent.change(screen.getByLabelText(/Reason for cancelling/), { target: { value: "Patient ate breakfast" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirm Cancel" }));
  await waitFor(() => expect(surgeryApi.setStatus).toHaveBeenCalledWith(1, "cancelled", "Patient ate breakfast"));
});

test("a closed case locks everything except the comments", async () => {
  surgeryApi.getCase.mockResolvedValue({ ...existing, status: "discharged", status_label: "Discharged", next_statuses: [] });
  surgeryApi.updateCase.mockResolvedValue({ ...existing, warnings: [] });
  render(<CaseDialog {...base} caseId={1} defaults={{ date: "2026-11-03" }} />);
  expect(await screen.findByText(/only the comments can change/)).toBeInTheDocument();
  expect(screen.getByLabelText("Service")).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Booking comments"), { target: { value: "note" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(surgeryApi.updateCase).toHaveBeenCalledWith(1, { comments: "note" }));
});

test("saving an open case sends the edited times as null when cleared", async () => {
  surgeryApi.getCase.mockResolvedValue({ ...existing, times: { ...existing.times, preop_start: "2026-11-03T07:10-05:00" } });
  surgeryApi.updateCase.mockResolvedValue({ ...existing, warnings: [] });
  render(<CaseDialog {...base} caseId={1} defaults={{ date: "2026-11-03" }} />);
  await screen.findByDisplayValue("2026-11-03T07:10");
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(surgeryApi.updateCase).toHaveBeenCalled());
  const body = surgeryApi.updateCase.mock.calls[0][1];
  expect(body.preop_start).toBe("2026-11-03T07:10");
  expect(body.patient_in).toBeNull();
  expect(body).not.toHaveProperty("times");
});

const bays = [
  { id: 31, name: "1", room: "Pre-op", unit: "Operating Rooms", state: "available", note: "", current: false },
  { id: 32, name: "2", room: "Pre-op", unit: "Operating Rooms", state: "occupied", note: "Lee, Ann", current: false },
];

test("moving to PreOp asks which bed, shows who is in the others, and sends the choice", async () => {
  surgeryApi.getCase.mockResolvedValue(existing);
  surgeryApi.bayOptions.mockResolvedValue(bays);
  surgeryApi.setStatus.mockResolvedValue({ ...existing, status: "preop", status_label: "In PreOp", next_statuses: ["or", "cancelled"] });
  render(<CaseDialog {...base} caseId={1} defaults={{ date: "2026-11-03" }} />);
  fireEvent.click(await screen.findByRole("button", { name: "Start PreOp" }));
  expect(surgeryApi.setStatus).not.toHaveBeenCalled();
  expect(await screen.findByText("Move to PreOp: choose a bed")).toBeInTheDocument();
  expect(screen.getByText("Lee, Ann")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Bed 2 in Pre-op, Lee, Ann" })).toBeDisabled();
  const confirm = screen.getByRole("button", { name: "Move to PreOp" });
  expect(confirm).toBeDisabled(); // choose a bed first
  fireEvent.click(screen.getByRole("button", { name: "Bed 1 in Pre-op" }));
  fireEvent.click(confirm);
  await waitFor(() => expect(surgeryApi.setStatus).toHaveBeenCalledWith(1, "preop", "", 31));
});

test("Decide later moves the case without a bed", async () => {
  surgeryApi.getCase.mockResolvedValue(existing);
  surgeryApi.bayOptions.mockResolvedValue([]);
  surgeryApi.setStatus.mockResolvedValue({ ...existing, status: "preop", status_label: "In PreOp", next_statuses: ["or", "cancelled"] });
  render(<CaseDialog {...base} caseId={1} defaults={{ date: "2026-11-03" }} />);
  fireEvent.click(await screen.findByRole("button", { name: "Start PreOp" }));
  expect(await screen.findByText(/No PreOp or PACU beds are set up yet/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Decide later" }));
  await waitFor(() => expect(surgeryApi.setStatus).toHaveBeenCalledWith(1, "preop", "", null));
});

test("can ask booking to open the visit in Registration", async () => {
  surgeryApi.createCase.mockResolvedValue({ id: 9, case_number: 1001, warnings: [] });
  render(<CaseDialog {...base} caseId={null} defaults={{ date: "2026-11-03", room: 10, time: "08:00" }} />);
  const box = screen.getByLabelText("Open a visit in Registration for this case");
  expect(box).toBeDisabled(); // needs a patient first
  const patientInput = screen.getByLabelText(/Patient/);
  fireEvent.focus(patientInput);
  fireEvent.change(patientInput, { target: { value: "basc" } });
  fireEvent.click(await screen.findByText("Bascom, Mark (MRN-000001)"));
  fireEvent.click(screen.getByLabelText("Open a visit in Registration for this case"));
  fireEvent.change(screen.getByLabelText("Procedure"), { target: { value: "CYSTOSCOPY" } });
  fireEvent.click(screen.getByRole("button", { name: "Book Case" }));
  await waitFor(() => expect(surgeryApi.createCase).toHaveBeenCalledTimes(1));
  expect(surgeryApi.createCase.mock.calls[0][0]).toEqual(expect.objectContaining({ visit: null, create_visit: true }));
});
