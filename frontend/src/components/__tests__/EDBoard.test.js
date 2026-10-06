import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";

jest.mock("../../api/client", () => ({ api: { get: jest.fn(), post: jest.fn(), patch: jest.fn() } }), { virtual: true });
jest.mock(
  "../../config/api",
  () => ({
    apiEndpoints: {
      edBoard: "/ed/board/",
      admissionBoard: (id) => `/adm/${id}/board/`,
      admissionTransfer: (id) => `/adm/${id}/transfer/`,
    },
  }),
  { virtual: true }
);
jest.mock("../../utils/auth", () => ({ getValidToken: async () => ({ access_token: "t" }) }), { virtual: true });
jest.mock("../SimpleToast", () => ({ toast: { error: jest.fn(), success: jest.fn() } }), { virtual: true });

import { api } from "../../api/client";
import { toast } from "../SimpleToast";
import EDBoard from "../edBoard/EDBoard";
import { formatLos, losMinutes, filterRows, vitalsStatus, ruleColors } from "../edBoard/edBoardColumns";

const visit = (over = {}) => ({
  registration: 90, visit_number: "VN-000090", patient: 3, user_id: 30, name: "TEST, Jane", age: 28, sex: "F",
  arrival_time: new Date(Date.now() - 125 * 60000).toISOString(), reason: "Chest pain", complaint: "CP", esi: 3, ed_status: "tip",
  md: { id: 8, name: "Abulafia, Dr" }, rn: { id: 7, name: "Geronimo, Ann" }, resident: "", comments: "", registration_complete: false, location: "x", ...over,
});

const board = (rows) => ({
  departments: [{ id: 5, name: "ED Labor and Delivery", facility: 1, facility_name: "General Hospital" }, { id: 6, name: "Fast Track", facility: 1, facility_name: "General Hospital" }],
  unit: 5,
  statuses: [{ value: "wtbs", code: "WTBS", label: "Waiting to be seen" }, { value: "tip", code: "TIP", label: "Treatment in progress" }],
  staff: { nurses: [{ id: 7, name: "Geronimo, Ann" }, { id: 9, name: "Bell, Sam" }], doctors: [{ id: 8, name: "Abulafia, Dr" }] },
  rows,
});

const rowsDefault = () => [
  { type: "bed", bed: 1, loc: "3525A", bed_status: "occupied", hold_reason: "", visit: visit() },
  { type: "bed", bed: 2, loc: "3525B", bed_status: "available", hold_reason: "", visit: null },
  { type: "bed", bed: 3, loc: "3525C", bed_status: "cleaning", hold_reason: "", visit: null },
  { type: "bed", bed: 4, loc: "3525D", bed_status: "blocked", hold_reason: "Broken rail", visit: null },
  { type: "waiting", bed: null, loc: "", bed_status: "", hold_reason: "", visit: visit({ registration: 91, patient: 4, user_id: 40, name: "RAY, Bob", sex: "M", age: 50, esi: null, ed_status: "wtbs", md: null, rn: null, registration_complete: true }) },
];

const pick = (testId, name) => {
  fireEvent.mouseDown(within(screen.getByTestId(testId).closest(".MuiInputBase-root")).getByRole("combobox"));
  fireEvent.click(screen.getByRole("option", { name }));
};

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockResolvedValue({ data: board(rowsDefault()) });
  api.patch.mockImplementation(async (url, body) => ({ data: { ...visit(), ...bodyToVisit(body) } }));
  api.post.mockResolvedValue({ data: {} });
});

const bodyToVisit = (b) => {
  const out = {};
  if ("esi" in b) out.esi = b.esi === "" ? null : b.esi;
  if ("ed_status" in b) out.ed_status = b.ed_status;
  if ("registration_complete" in b) out.registration_complete = b.registration_complete;
  if ("assigned_nurse" in b) out.rn = b.assigned_nurse ? { id: b.assigned_nurse, name: "Bell, Sam" } : null;
  if ("comments" in b) out.comments = b.comments;
  return out;
};

test("helpers: LOS text, minutes, views", () => {
  expect(formatLos(125)).toBe("02:05");
  expect(formatLos(38 * 1440 + 22 * 60 + 23)).toBe("38d 22:23");
  expect(losMinutes(new Date(Date.now() - 90 * 60000).toISOString())).toBe(90);
  const rows = rowsDefault();
  expect(filterRows(rows, "waiting", 7).map((r) => r.type)).toEqual(["waiting"]);
  expect(filterRows(rows, "mine", 7)).toHaveLength(1);
  expect(filterRows(rows, "mine", 99)).toHaveLength(0);
  expect(filterRows(rows, "all", 7)).toHaveLength(5);
});

test("draws a row per bed, with Ready, Cleaning and Blocked beds and the waiting patient", async () => {
  render(<EDBoard userRole="nurse" currentUserId={7} />);
  expect(await screen.findByTestId("ed-bed-1")).toBeInTheDocument();
  expect(within(screen.getByTestId("ed-bed-2")).getAllByText("Ready")[0]).toBeInTheDocument();
  expect(within(screen.getByTestId("ed-bed-3")).getAllByText("Cleaning")[0]).toBeInTheDocument();
  expect(within(screen.getByTestId("ed-bed-4")).getAllByText("Blocked").length).toBeGreaterThan(0);
  expect(within(screen.getByTestId("ed-bed-4")).getByText("Broken rail")).toBeInTheDocument();
  const waiting = screen.getByTestId("ed-waiting-91");
  expect(within(waiting).getByText("WAITING")).toBeInTheDocument();
  expect(within(waiting).getByText("RAY, Bob")).toBeInTheDocument();
});

test("the patient row shows name, age and sex, LOS and chief complaint", async () => {
  render(<EDBoard userRole="nurse" />);
  const row = await screen.findByTestId("ed-bed-1");
  expect(within(row).getByText("TEST, Jane")).toBeInTheDocument();
  expect(within(row).getByText("28y /F")).toBeInTheDocument();
  expect(within(row).getByText("02:05")).toBeInTheDocument();
  expect(within(row).getByText("Chest pain")).toBeInTheDocument();
  expect(within(row).getByText("Female")).toBeInTheDocument();
});

test("incomplete registration shows the Inc Reg badge; complete does not", async () => {
  render(<EDBoard userRole="nurse" />);
  await screen.findByTestId("ed-bed-1");
  expect(screen.getByTestId("inc-reg-90")).toBeInTheDocument();
  expect(screen.queryByTestId("inc-reg-91")).toBeNull();
});

test("changing ESI saves just that field", async () => {
  render(<EDBoard userRole="nurse" />);
  await screen.findByTestId("ed-bed-1");
  pick("esi-90", "2");
  await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/adm/90/board/", { esi: 2 }, expect.anything()));
});

test("changing the status and the nurse saves, using ED staff only", async () => {
  render(<EDBoard userRole="doctor" />);
  await screen.findByTestId("ed-bed-1");
  pick("status-90", "WTBS");
  await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/adm/90/board/", { ed_status: "wtbs" }, expect.anything()));
  fireEvent.mouseDown(within(screen.getByTestId("rn-90").closest(".MuiInputBase-root")).getByRole("combobox"));
  expect(screen.getByRole("option", { name: "Bell, Sam" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("option", { name: "Bell, Sam" }));
  await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/adm/90/board/", { assigned_nurse: 9 }, expect.anything()));
});

test("ticking Registration Complete saves it", async () => {
  render(<EDBoard userRole="registrar" />);
  await screen.findByTestId("ed-bed-1");
  fireEvent.click(screen.getByLabelText("Registration complete for TEST, Jane"));
  await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/adm/90/board/", { registration_complete: true }, expect.anything()));
});

test("comments save when you leave the box with a change, not otherwise", async () => {
  render(<EDBoard userRole="nurse" />);
  await screen.findByTestId("ed-bed-1");
  const box = screen.getByTestId("comments-90");
  fireEvent.blur(box);
  expect(api.patch).not.toHaveBeenCalled();
  fireEvent.change(box, { target: { value: "Awaiting CT" } });
  fireEvent.blur(box);
  await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/adm/90/board/", { comments: "Awaiting CT" }, expect.anything()));
});

test("a rejected edit shows the reason and reloads the board", async () => {
  api.patch.mockRejectedValue({ response: { data: { detail: "ESI must be a number from 1 to 5." } } });
  render(<EDBoard userRole="nurse" />);
  await screen.findByTestId("ed-bed-1");
  const before = api.get.mock.calls.length;
  pick("esi-90", "1");
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith("ESI must be a number from 1 to 5."));
  await waitFor(() => expect(api.get.mock.calls.length).toBeGreaterThan(before));
});

test("roles that cannot edit see the board read-only", async () => {
  render(<EDBoard userRole="receptionist" />);
  await screen.findByTestId("ed-bed-1");
  expect(screen.getByLabelText("Registration complete for TEST, Jane")).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Transfer TEST, Jane" })).toBeNull();
});

test("the View dropdown narrows to waiting patients", async () => {
  render(<EDBoard userRole="nurse" currentUserId={7} />);
  await screen.findByTestId("ed-bed-1");
  pick("ed-view", "Waiting");
  expect(screen.queryByTestId("ed-bed-1")).toBeNull();
  expect(screen.getByTestId("ed-waiting-91")).toBeInTheDocument();
  pick("ed-view", "My patients");
  expect(screen.getByTestId("ed-bed-1")).toBeInTheDocument();
  expect(screen.queryByTestId("ed-waiting-91")).toBeNull();
});

test("switching department loads that department's board", async () => {
  render(<EDBoard userRole="nurse" />);
  await screen.findByTestId("ed-bed-1");
  pick("ed-department", "Fast Track");
  await waitFor(() => expect(api.get).toHaveBeenLastCalledWith("/ed/board/", expect.objectContaining({ params: { unit: 6 } })));
});

test("a Ready bed can take a waiting patient", async () => {
  render(<EDBoard userRole="nurse" />);
  await screen.findByTestId("ed-bed-2");
  fireEvent.click(screen.getByRole("button", { name: "Place a patient in 3525B" }));
  pick("pick-select", "RAY, Bob");
  fireEvent.click(screen.getByRole("button", { name: "Place" }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith("/adm/91/transfer/", { unit: 5, bed: 2 }, expect.anything()));
});

test("a waiting patient can be assigned a Ready bed", async () => {
  render(<EDBoard userRole="nurse" />);
  await screen.findByTestId("ed-waiting-91");
  fireEvent.click(screen.getByRole("button", { name: "Assign bed to RAY, Bob" }));
  pick("pick-select", "3525B");
  fireEvent.click(screen.getByRole("button", { name: "Place" }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith("/adm/91/transfer/", { unit: 5, bed: 2 }, expect.anything()));
});

test("transfer, discharge and admit hand the patient to the page, and the name opens the chart", async () => {
  const onTransfer = jest.fn();
  const onDischarge = jest.fn();
  const onAdmit = jest.fn();
  const onOpenPatient = jest.fn();
  render(<EDBoard userRole="nurse" onTransfer={onTransfer} onDischarge={onDischarge} onAdmit={onAdmit} onOpenPatient={onOpenPatient} />);
  await screen.findByTestId("ed-bed-1");
  fireEvent.click(screen.getByRole("button", { name: "Transfer TEST, Jane" }));
  fireEvent.click(screen.getByRole("button", { name: "Discharge TEST, Jane" }));
  fireEvent.click(screen.getByRole("button", { name: "Admit TEST, Jane" }));
  const patient = onTransfer.mock.calls[0][0];
  expect(patient).toMatchObject({ id: 3, user_id: 30, full_name: "TEST, Jane" });
  expect(patient.current_visit).toMatchObject({ id: 90, care_setting: "emergency", location: "General Hospital › ED Labor and Delivery › 3525A" });
  expect(onDischarge).toHaveBeenCalledWith(patient);
  expect(onAdmit).toHaveBeenCalledWith(patient);
  fireEvent.click(screen.getByText("TEST, Jane"));
  expect(onOpenPatient.mock.calls[0][0].user_id).toBe(30);
});

test("the Patient List button hands control back to the page", async () => {
  const onShowList = jest.fn();
  render(<EDBoard userRole="nurse" onShowList={onShowList} />);
  fireEvent.click(await screen.findByRole("button", { name: "Patient List" }));
  expect(onShowList).toHaveBeenCalled();
});

test("says so when there are no emergency departments, and shows load errors", async () => {
  api.get.mockResolvedValue({ data: { ...board([]), departments: [], unit: null } });
  const { unmount } = render(<EDBoard userRole="nurse" />);
  expect(await screen.findByTestId("no-ed-departments")).toBeInTheDocument();
  unmount();
  api.get.mockRejectedValue({ response: { data: { detail: "You do not have permission to see the ED board." } } });
  render(<EDBoard userRole="nurse" />);
  expect(await screen.findByText("You do not have permission to see the ED board.")).toBeInTheDocument();
});

test("vitalsStatus: overdue at 60 minutes, counted from arrival when nothing is charted", () => {
  const now = Date.now();
  const ago = (m) => new Date(now - m * 60000).toISOString();
  expect(vitalsStatus({ arrival_time: ago(30), vitals_last_at: null }, now)).toMatchObject({ charted: false, overdue: false, minutes: 30 });
  expect(vitalsStatus({ arrival_time: ago(200), vitals_last_at: null }, now).overdue).toBe(true);
  expect(vitalsStatus({ arrival_time: ago(200), vitals_last_at: ago(59) }, now)).toMatchObject({ charted: true, overdue: false });
  expect(vitalsStatus({ arrival_time: ago(200), vitals_last_at: ago(60) }, now).overdue).toBe(true);
});

test("Vitals column flags overdue patients and shows recent ones plainly", async () => {
  const rows = rowsDefault();
  rows[0].visit = visit({ registration: 90, vitals_last_at: null });
  rows[4].visit = visit({ registration: 91, name: "RAY, Bob", vitals_last_at: new Date(Date.now() - 20 * 60000).toISOString() });
  api.get.mockResolvedValue({ data: board(rows) });
  render(<EDBoard userRole="nurse" currentUserId={7} />);
  await screen.findByTestId("ed-bed-1");
  expect(screen.getByTestId("vitals-90")).toHaveTextContent("Due · None yet");
  expect(screen.getByTestId("vitals-91")).toHaveTextContent("00:20 ago");
  expect(screen.getByTestId("vitals-91")).not.toHaveTextContent("Due");
});

test("order icons light up pending and resulted orders only", async () => {
  const rows = rowsDefault();
  rows[0].visit = visit({ registration: 90, orders: { lab: "pending", rad: "done" } });
  api.get.mockResolvedValue({ data: board(rows) });
  render(<EDBoard userRole="nurse" currentUserId={7} />);
  await screen.findByTestId("ed-bed-1");
  expect(screen.getByTestId("order-lab-90")).toHaveAttribute("aria-label", "Lab ordered for TEST, Jane");
  expect(screen.getByTestId("order-rad-90")).toHaveAttribute("aria-label", "Radiology resulted for TEST, Jane");
  expect(screen.queryByTestId("order-meds-90")).toBeNull();
  expect(screen.queryByTestId("order-ekg-90")).toBeNull();
});

const withConfig = (config, rows = rowsDefault()) => ({ ...board(rows), config: { version: 2, rules: [], vitals_overdue_minutes: 60, ...config } });
const col = (key, label, extra = {}) => ({ key, label, width: 100, visible: true, type: "builtin", ...extra });

test("the published layout decides which columns show, in what order and under what name", async () => {
  api.get.mockResolvedValue({
    data: withConfig({ columns: [col("loc", "Bed"), col("patient", "Name"), col("esi", "Triage", { visible: false }), col("age", "Yrs"), col("actions", "")] }),
  });
  render(<EDBoard userRole="nurse" currentUserId={7} />);
  await screen.findByTestId("ed-bed-1");
  const heads = screen.getAllByRole("columnheader").map((h) => h.textContent);
  expect(heads).toEqual(["Bed", "Name", "Yrs", ""]);
  expect(screen.queryByText("Triage")).toBeNull();
});

test("custom columns can be typed into, picked from or ticked, and save as custom values", async () => {
  const rows = rowsDefault();
  rows[0].visit = visit({ registration: 90, custom: { c_note: "old" } });
  api.get.mockResolvedValue({
    data: withConfig(
      {
        columns: [
          col("loc", "LOC"), col("patient", "Patient"),
          col("c_iso", "Isolation", { type: "custom", kind: "dropdown", options: ["Contact", "Airborne"] }),
          col("c_note", "Tech note", { type: "custom", kind: "text" }),
          col("c_bag", "Belongings", { type: "custom", kind: "checkbox" }),
        ],
      },
      rows
    ),
  });
  render(<EDBoard userRole="nurse" currentUserId={7} />);
  await screen.findByTestId("ed-bed-1");
  const note = screen.getByTestId("custom-c_note-90");
  expect(note).toHaveValue("old");
  pick("custom-c_iso-90", "Airborne");
  await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/adm/90/board/", { custom: { c_iso: "Airborne" } }, expect.anything()));
  const typed = screen.getByTestId("custom-c_note-90");
  fireEvent.change(typed, { target: { value: "IV in L arm" } });
  fireEvent.blur(typed);
  await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/adm/90/board/", { custom: { c_note: "IV in L arm" } }, expect.anything()));
  fireEvent.click(screen.getByRole("checkbox", { name: "Belongings for TEST, Jane" }));
  await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/adm/90/board/", { custom: { c_bag: true } }, expect.anything()));
});

test("color rules paint a whole row or a single cell", () => {
  const v = visit({ esi: 1, ed_status: "wtbs", custom: { c_iso: "Airborne" }, vitals_last_at: null });
  const now = Date.now();
  const rules = [
    { field: "esi", op: "eq", value: "1", target: "row", color: "#ff0000" },
    { field: "ed_status", op: "neq", value: "tip", target: "cell", color: "#00ff00" },
    { field: "c_iso", op: "eq", value: "Airborne", target: "cell", color: "#0000ff" },
    { field: "vitals_overdue", op: "eq", value: true, target: "cell", color: "#ffaa00" },
  ];
  expect(ruleColors(rules, v, now)).toEqual({ row: "#ff0000", cells: { status: "#00ff00", c_iso: "#0000ff", vitals: "#ffaa00" } });
  expect(ruleColors(rules, visit({ esi: 3, ed_status: "tip", custom: {}, vitals_last_at: new Date(now).toISOString() }), now)).toEqual({ row: undefined, cells: {} });
  expect(ruleColors(rules, null, now)).toEqual({ row: undefined, cells: {} });
});

test("a rule colors the row on the board", async () => {
  api.get.mockResolvedValue({ data: withConfig({ columns: [col("loc", "LOC"), col("patient", "Patient"), col("status", "STS")], rules: [{ field: "esi", op: "eq", value: "3", target: "row", color: "#ff0000" }] }) });
  render(<EDBoard userRole="nurse" currentUserId={7} />);
  const row = await screen.findByTestId("ed-bed-1");
  expect(getComputedStyle(row).backgroundColor).toBe("rgb(255, 0, 0)");
});

test("the vitals limit comes from the layout", async () => {
  const rows = rowsDefault();
  rows[0].visit = visit({ registration: 90, vitals_last_at: new Date(Date.now() - 20 * 60000).toISOString() });
  api.get.mockResolvedValue({ data: withConfig({ columns: [col("loc", "LOC"), col("patient", "Patient"), col("vitals", "Vitals")], vitals_overdue_minutes: 15 }, rows) });
  render(<EDBoard userRole="nurse" currentUserId={7} />);
  await screen.findByTestId("ed-bed-1");
  expect(screen.getByTestId("vitals-90")).toHaveTextContent("Due");
});

test("preview mode draws the given data without loading, polling or editing", async () => {
  const data = withConfig({ columns: [col("loc", "LOC"), col("patient", "Patient"), col("esi", "ESI")] });
  render(<EDBoard userRole="admin" previewData={data} />);
  expect(await screen.findByTestId("ed-bed-1")).toBeInTheDocument();
  expect(api.get).not.toHaveBeenCalled();
  screen.getAllByRole("combobox", { name: /ESI/i }).forEach((el) => expect(el).toHaveAttribute("aria-disabled", "true"));
  expect(api.patch).not.toHaveBeenCalled();
});
