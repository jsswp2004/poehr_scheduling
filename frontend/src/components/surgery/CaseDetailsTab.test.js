import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import CaseDetailsTab from "./CaseDetailsTab";
import { surgeryApi } from "./surgeryApi";
import { toast } from "../SimpleToast";

jest.mock("./surgeryApi", () => ({
  surgeryApi: {
    getCase: jest.fn(),
    lookups: jest.fn(),
    updateCase: jest.fn(),
    participants: jest.fn(),
    addParticipant: jest.fn(),
    updateParticipant: jest.fn(),
    removeParticipant: jest.fn(),
    staff: jest.fn(),
  },
}));
jest.mock("../SimpleToast", () => ({ toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));
jest.mock("../patientHeader/headerApi", () => ({ errorText: (e, f) => e?.response?.data?.detail || f }));

const header = (extra = {}) => ({
  planned_start: null, scheduled_delay_reason: "", planned_delay_reason: "", scheduled_delay_minutes: 32,
  planned_delay_minutes: 0, actual_start: "2026-11-03T08:02:00-05:00", actual_end: "2026-11-03T10:38:00-05:00",
  actual_minutes: 156, requires_review: false, review_reason: "", physical_status: "ASA 3", block_id: "VasAc",
  booking_comments_2: "1ST CASE", procedure_notes: "", provider_notes: "", last_status_change: { user: "Joseph, Marie", at: "2026-11-03T10:50:00-05:00" },
  ...extra,
});
const caseRow = (extra = {}) => ({
  id: 1, case_number: 48773, scheduled_start: "2026-11-03T07:30:00-05:00", duration_minutes: 150, room: { id: 10, name: "OR-1" },
  patient: { id: 5, name: "Edwards, Carol L", mrn: "445330", age: "66y", sex: "F" }, visit: { id: 3, visit_number: "9968366" },
  procedures: [{ id: 1, name: "ARTERIOVENOUS FISTULA CREATION", laterality: "left", cpt_code: "36821", is_primary: true }],
  procedures_text: "ARTERIOVENOUS FISTULA CREATION [Left]", surgeon: { id: 2, name: "Tomasula, John" }, case_type: "elective",
  status: "pacu", status_label: "In PACU", next_statuses: ["discharged", "transferred"], anesthesia_type: "General", comments: "*NO PAT",
  times: { preop_start: "2026-11-03T06:49:00-05:00", ready_for_or: null, preop_end: null, patient_in: "2026-11-03T08:02:00-05:00", procedure_start: null, procedure_end: null, patient_out: null, pacu_start: null, discharged_at: null },
  time_reasons: {}, header: header(), ...extra,
});
const lookups = {
  delay_reasons: ["Surgeon Late", "Previous Case Ran Over"], physical_statuses: ["ASA 2", "ASA 3"], anesthesia_types: ["General", "MAC"],
  participant_roles: [{ value: "surgeon_primary", label: "Surgeon, Primary" }, { value: "vendor", label: "Vendor" }],
  me: { id: 9, name: "Joseph, Marie", title: "RN" },
};
const props = { caseId: 1, canEdit: true, rooms: [{ id: 10, name: "OR-1" }, { id: 11, name: "OR-2" }], onEditBooking: jest.fn(), onChanged: jest.fn() };

beforeEach(() => {
  surgeryApi.getCase.mockResolvedValue(caseRow());
  surgeryApi.lookups.mockResolvedValue(lookups);
  surgeryApi.participants.mockResolvedValue([]);
  surgeryApi.staff.mockResolvedValue([{ id: 2, name: "Tomasula, John", title: "MD", role: "doctor" }]);
});

test("shows the patient strip and the case header values", async () => {
  render(<CaseDetailsTab {...props} />);
  expect(await screen.findByText("EDWARDS, CAROL L")).toBeInTheDocument();
  expect(screen.getAllByText(/Case ID: 48773/)).toHaveLength(2); // the patient strip and the section title
  expect(screen.getByLabelText("Actual duration")).toHaveValue("2:36");
  expect(screen.getByLabelText("Block ID")).toHaveValue("VasAc");
  expect(screen.getByText(/Joseph, Marie 11-03-2026 10:50/)).toBeInTheDocument();
  expect(screen.getByLabelText("Booking comments 1")).toHaveValue("*NO PAT");
});

test("saves the header fields that were edited", async () => {
  const onChanged = jest.fn();
  surgeryApi.updateCase.mockResolvedValue({ ...caseRow(), warnings: [] });
  render(<CaseDetailsTab {...props} onChanged={onChanged} />);
  await screen.findByText("EDWARDS, CAROL L");
  fireEvent.change(screen.getByLabelText("Block ID"), { target: { value: "VasX" } });
  fireEvent.change(screen.getByLabelText("Procedure notes"), { target: { value: "PATIENT LATE" } });
  fireEvent.click(screen.getByLabelText("Requires review"));
  fireEvent.change(screen.getByLabelText("Review reason"), { target: { value: "Consent unclear" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(surgeryApi.updateCase).toHaveBeenCalledTimes(1));
  const [id, body] = surgeryApi.updateCase.mock.calls[0];
  expect(id).toBe(1);
  expect(body).toEqual(expect.objectContaining({ block_id: "VasX", procedure_notes: "PATIENT LATE", requires_review: true, review_reason: "Consent unclear", room: 10, case_type: "elective", physical_status: "ASA 3" }));
  await waitFor(() => expect(onChanged).toHaveBeenCalled());
});

test("a closed case only lets the notes be saved", async () => {
  surgeryApi.getCase.mockResolvedValue(caseRow({ status: "discharged", status_label: "Discharged", next_statuses: [] }));
  surgeryApi.updateCase.mockResolvedValue(caseRow());
  render(<CaseDetailsTab {...props} />);
  await screen.findByText("EDWARDS, CAROL L");
  expect(screen.getByLabelText("Block ID")).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Edit Booking" })).toBeNull();
  fireEvent.change(screen.getByLabelText("Provider notes"), { target: { value: "gloves 7" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(surgeryApi.updateCase).toHaveBeenCalled());
  const body = surgeryApi.updateCase.mock.calls[0][1];
  expect(Object.keys(body).sort()).toEqual(["booking_comments_2", "comments", "procedure_notes", "provider_notes"]);
});

test("a case reader without edit rights cannot save", async () => {
  render(<CaseDetailsTab {...props} canEdit={false} />);
  await screen.findByText("EDWARDS, CAROL L");
  expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  expect(screen.getByLabelText("Procedure notes")).toBeDisabled();
});

test("Edit Booking hands the case to the booking dialog", async () => {
  const onEditBooking = jest.fn();
  render(<CaseDetailsTab {...props} onEditBooking={onEditBooking} />);
  await screen.findByText("EDWARDS, CAROL L");
  fireEvent.click(screen.getByRole("button", { name: "Edit Booking" }));
  expect(onEditBooking).toHaveBeenCalledWith(1);
});

const openIntraOp = async () => {
  render(<CaseDetailsTab {...props} />);
  await screen.findByText("EDWARDS, CAROL L");
  fireEvent.click(screen.getByRole("tab", { name: "Intra-op" }));
};

test("Intra-op lists the planned procedures and existing participants", async () => {
  surgeryApi.participants.mockResolvedValue([
    { id: 7, role: "surgeon_primary", role_label: "Surgeon, Primary", display: "Tomasula, John (MD)", user: { id: 2 }, name: "", time_in: "2026-11-03T08:02:00-05:00", time_out: null, comments: "" },
  ]);
  await openIntraOp();
  expect(await screen.findByText("Tomasula, John (MD)")).toBeInTheDocument();
  expect(screen.getByText("ARTERIOVENOUS FISTULA CREATION")).toBeInTheDocument();
  expect(screen.getByText("Primary")).toBeInTheDocument();
  expect(screen.getByLabelText("Surgeon, Primary time in")).toHaveValue("2026-11-03T08:02");
});

test("adds a participant by searching staff", async () => {
  surgeryApi.addParticipant.mockResolvedValue({ id: 8, role: "surgeon_primary", role_label: "Surgeon, Primary", display: "Tomasula, John (MD)", user: { id: 2 }, name: "", time_in: null, time_out: null, comments: "" });
  await openIntraOp();
  fireEvent.click(await screen.findByRole("button", { name: "Add Participant" }));
  const dialog = await screen.findByRole("dialog");
  const name = within(dialog).getByLabelText("Name");
  fireEvent.focus(name);
  fireEvent.change(name, { target: { value: "toma" } });
  fireEvent.click(await screen.findByText("Tomasula, John (MD)"));
  fireEvent.click(within(dialog).getByRole("button", { name: "Add" }));
  await waitFor(() => expect(surgeryApi.addParticipant).toHaveBeenCalledWith(1, { role: "surgeon_primary", user: 2 }));
  expect(await screen.findAllByText("Tomasula, John (MD)")).not.toHaveLength(0);
});

test("Add Me puts the signed-in person in the name box", async () => {
  surgeryApi.addParticipant.mockResolvedValue({ id: 8, role: "surgeon_primary", role_label: "Surgeon, Primary", display: "Joseph, Marie (RN)", user: { id: 9 }, name: "", time_in: null, time_out: null, comments: "" });
  await openIntraOp();
  fireEvent.click(await screen.findByRole("button", { name: "Add Participant" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Add Me" }));
  fireEvent.click(within(dialog).getByRole("button", { name: "Add" }));
  await waitFor(() => expect(surgeryApi.addParticipant).toHaveBeenCalledWith(1, { role: "surgeon_primary", user: 9 }));
});

test("a vendor can be added by typed name", async () => {
  surgeryApi.addParticipant.mockResolvedValue({ id: 8, role: "vendor", role_label: "Vendor", display: "Stryker rep", user: null, name: "Stryker rep", time_in: null, time_out: null, comments: "" });
  await openIntraOp();
  fireEvent.click(await screen.findByRole("button", { name: "Add Participant" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByRole("button", { name: "Add" })).toBeDisabled();
  fireEvent.mouseDown(within(dialog).getByLabelText("Role"));
  fireEvent.click(await screen.findByRole("option", { name: "Vendor" }));
  fireEvent.change(within(dialog).getByLabelText("Or type a vendor name"), { target: { value: "Stryker rep" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Add" }));
  await waitFor(() => expect(surgeryApi.addParticipant).toHaveBeenCalledWith(1, { role: "vendor", name: "Stryker rep" }));
});

test("time out saves when the box loses focus, and a rejected change is reported", async () => {
  surgeryApi.participants.mockResolvedValue([
    { id: 7, role: "surgeon_primary", role_label: "Surgeon, Primary", display: "Tomasula, John (MD)", user: { id: 2 }, name: "", time_in: "2026-11-03T08:02:00-05:00", time_out: null, comments: "" },
  ]);
  surgeryApi.updateParticipant.mockRejectedValueOnce({ response: { data: { detail: "Time out cannot be before time in." } } });
  await openIntraOp();
  const out = await screen.findByLabelText("Surgeon, Primary time out");
  fireEvent.change(out, { target: { value: "2026-11-03T07:00" } });
  fireEvent.blur(out);
  await waitFor(() => expect(surgeryApi.updateParticipant).toHaveBeenCalledWith(1, 7, { time_out: "2026-11-03T07:00" }));
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Time out cannot be before time in."));
  expect(screen.getByLabelText("Surgeon, Primary time out")).toHaveValue("");
});

test("removes a participant", async () => {
  surgeryApi.participants.mockResolvedValue([
    { id: 7, role: "surgeon_primary", role_label: "Surgeon, Primary", display: "Tomasula, John (MD)", user: { id: 2 }, name: "", time_in: null, time_out: null, comments: "" },
  ]);
  surgeryApi.removeParticipant.mockResolvedValue();
  await openIntraOp();
  fireEvent.click(await screen.findByRole("button", { name: "Remove Surgeon, Primary" }));
  await waitFor(() => expect(surgeryApi.removeParticipant).toHaveBeenCalledWith(1, 7));
  await waitFor(() => expect(screen.queryByText("Tomasula, John (MD)")).toBeNull());
});

test("saves the milestone times with their reasons", async () => {
  surgeryApi.updateCase.mockResolvedValue(caseRow());
  await openIntraOp();
  fireEvent.change(await screen.findByLabelText("Ready for OR"), { target: { value: "2026-11-03T07:58" } });
  fireEvent.mouseDown(screen.getByLabelText("Patient In Room reason"));
  fireEvent.click(await screen.findByRole("option", { name: "Surgeon Late" }));
  fireEvent.click(screen.getByRole("button", { name: "Save Times" }));
  await waitFor(() => expect(surgeryApi.updateCase).toHaveBeenCalledTimes(1));
  const body = surgeryApi.updateCase.mock.calls[0][1];
  expect(body.ready_for_or).toBe("2026-11-03T07:58");
  expect(body.patient_in).toBe("2026-11-03T08:02");
  expect(body.procedure_start).toBeNull();
  expect(body.time_reasons).toEqual({ patient_in: "Surgeon Late" });
});

test("a closed case locks the participants and times", async () => {
  surgeryApi.getCase.mockResolvedValue(caseRow({ status: "discharged", status_label: "Discharged", next_statuses: [] }));
  await openIntraOp();
  await screen.findByText("No participants added yet.");
  expect(screen.queryByRole("button", { name: "Add Participant" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Save Times" })).toBeNull();
});
