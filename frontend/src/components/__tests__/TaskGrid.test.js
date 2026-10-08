import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";

jest.mock("../../api/client", () => ({ api: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() } }), { virtual: true });
jest.mock(
  "../../config/api",
  () => ({
    apiEndpoints: {
      orderTasks: "/order-tasks/",
      orderTaskQueues: "/order-tasks/queues/",
      orderTask: (id) => `/order-tasks/${id}/`,
      orderTaskAction: (id) => `/order-tasks/${id}/action/`,
      orderTaskMeta: "/order-task-meta/",
      orderTaskColumns: "/order-task-columns/",
      patientHeader: (id) => `/header/${id}/`,
    },
  }),
  { virtual: true }
);
jest.mock("../../utils/auth", () => ({ getValidToken: async () => ({ access_token: "t" }) }), { virtual: true });
jest.mock("../../utils/tokenManager", () => ({ getAccessToken: () => "tok" }), { virtual: true });
jest.mock("jwt-decode", () => ({ jwtDecode: () => ({ user_id: 7 }) }));
jest.mock("../SimpleToast", () => ({ toast: { error: jest.fn(), success: jest.fn() } }), { virtual: true });

import { api } from "../../api/client";
import { toast } from "../SimpleToast";
import TaskWorklist from "../tasks/TaskWorklist";

// 2:30 PM on Oct 8 2026, local time; only Date is faked so the async helpers keep working
const NOW = new Date(2026, 9, 8, 14, 30);
const at = (h, m = 0, dayOffset = 0) => new Date(2026, 9, 8 + dayOffset, h, m).toISOString();

const META = (over = {}) => ({ can_perform: true, grace_minutes: 60, ...over });
const TASK = (over = {}) => ({
  id: 1, order: 5, patient: 3, patient_name: "Ann Lee", title: "Amoxicillin 500 mg capsule", task_type: "medication", dose: "500 mg", route: "PO",
  instructions: "", frequency: "bid", frequency_label: "Twice a day (BID)", due_at: at(9), is_prn: false, status: "pending", status_label: "Pending",
  overdue: false, due_now: false, minutes_late: 0, performed_by_name: "", performed_by_initials: "", performed_at: null,
  unit_name: "4 West", room_name: "412", bed_name: "A", actions: ["complete", "hold", "refuse", "note"], ...over,
});

let list;
let meta;
beforeEach(() => {
  jest.useFakeTimers({ now: NOW, doNotFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "setImmediate", "clearImmediate", "nextTick", "queueMicrotask"] });
  Object.values(api).forEach((fn) => fn.mockReset());
  Object.values(toast).forEach((fn) => fn.mockReset());
  meta = META();
  list = [
    TASK({ id: 1, due_at: at(9), status: "done", status_label: "Done", performed_by_name: "Jess Salvacion", performed_by_initials: "JS", performed_at: at(9, 5) }),
    TASK({ id: 2, due_at: at(21) }),
    TASK({ id: 3, order: 6, title: "Metoprolol 25 mg tablet", frequency_label: "Daily", due_at: at(14, 15), due_now: true }),
    TASK({ id: 4, order: 7, title: "Folic Acid 1 mg", frequency_label: "Daily", due_at: at(12), overdue: true, due_now: true, minutes_late: 150 }),
    TASK({ id: 5, order: 8, title: "Heparin 5000 units", frequency_label: "Q8H", due_at: at(6), status: "missed", status_label: "Missed" }),
  ];
  api.get.mockImplementation((url) => {
    if (url === "/order-task-meta/") return Promise.resolve({ data: meta });
    if (url === "/order-task-columns/") return Promise.resolve({ data: { columns: Array.from({ length: 24 }, (_, h) => h * 60), is_default: true } });
    if (url === "/header/3/") return Promise.resolve({ data: { items: [{ key: "name", label: "Name", value: "LEE, ANN", emphasis: "strong" }, { key: "allergies", label: "Allergies", value: "Penicillin", emphasis: "alert" }] } });
    if (url === "/order-tasks/queues/") return Promise.resolve({ data: { counts: { needs_action: 2, overdue: 1, missed: 1 } } });
    if (url === "/order-tasks/") return Promise.resolve({ data: { count: list.length, results: list } });
    const m = /^\/order-tasks\/(\d+)\/$/.exec(url);
    if (m) return Promise.resolve({ data: { ...list.find((t) => String(t.id) === m[1]), events: [] } });
    return Promise.reject(new Error(`unexpected ${url}`));
  });
  api.post.mockResolvedValue({ data: {} });
});
afterEach(() => {
  jest.useRealTimers();
  window.sessionStorage.clear();
});

const open = async () => {
  render(<TaskWorklist />);
  await screen.findByTestId("grid-cell-1");
};

test("the hours of the day run across the top and the task details down the left", async () => {
  await open();
  ["Patient / bed", "Task", "Frequency"].forEach((h) => expect(screen.getByRole("columnheader", { name: h })).toBeInTheDocument());
  expect(screen.getByTestId("grid-col-0")).toHaveTextContent("0:00");
  expect(screen.getByTestId("grid-col-1380")).toHaveTextContent("23:00");
  const row = screen.getByTestId("grid-row-5");
  expect(row).toHaveTextContent("Ann Lee");
  expect(row).toHaveTextContent("4 West · 412 · A");
  expect(row).toHaveTextContent("Amoxicillin 500 mg capsule");
  expect(row).toHaveTextContent("Twice a day (BID)");
});

test("each task sits in its own hour and one order shows all its times on one line", async () => {
  await open();
  expect(within(screen.getByTestId("grid-slot-5-540")).getByTestId("grid-cell-1")).toBeInTheDocument();
  expect(within(screen.getByTestId("grid-slot-5-1260")).getByTestId("grid-cell-2")).toBeInTheDocument();
  expect(screen.getAllByTestId("grid-row-5")).toHaveLength(1);
  expect(within(screen.getByTestId("grid-slot-6-840")).getByTestId("grid-cell-3")).toHaveTextContent("2:15");
});

test("done shows a check and initials; due is green; overdue is pink; missed is red and bold", async () => {
  await open();
  const done = screen.getByTestId("grid-cell-1");
  expect(done).toHaveTextContent("JS");
  expect(done.querySelector("svg")).not.toBeNull();
  expect(screen.getByTestId("grid-cell-3")).toHaveStyle({ backgroundColor: "#c8e6c9" });
  expect(screen.getByTestId("grid-cell-3")).toHaveAttribute("data-state", "due");
  expect(screen.getByTestId("grid-cell-4")).toHaveStyle({ backgroundColor: "#f8c9d4" });
  expect(screen.getByTestId("grid-cell-4")).toHaveAttribute("data-state", "overdue");
  const missed = screen.getByTestId("grid-cell-5");
  expect(missed).toHaveAttribute("data-state", "missed");
  expect(missed).toHaveStyle({ color: "#d32f2f", fontWeight: 700 });
  expect(screen.getByTestId("grid-cell-2")).toHaveAttribute("data-state", "scheduled");
});

test("one grid replaces the queue tabs and asks the server for the day", async () => {
  await open();
  expect(screen.queryByTestId("task-queue-needs_action")).not.toBeInTheDocument();
  const call = api.get.mock.calls.filter((c) => c[0] === "/order-tasks/").pop();
  expect(call[1].params).toMatchObject({ queue: "grid", include_earlier: 1 });
  expect(new Date(call[1].params.from).getTime()).toBe(new Date(2026, 9, 8).getTime());
  expect(new Date(call[1].params.to).getTime()).toBe(new Date(2026, 9, 9).getTime());
  expect(screen.getByTestId("legend-due")).toHaveTextContent("Due now 1");
  expect(screen.getByTestId("legend-overdue")).toHaveTextContent("Overdue 1");
  expect(screen.getByTestId("legend-missed")).toHaveTextContent("Missed 1");
});

test("clicking a due square asks Task Completed? and Yes records it", async () => {
  const heard = jest.fn();
  window.addEventListener("tasks-changed", heard);
  await open();
  fireEvent.click(screen.getByTestId("grid-cell-3"));
  expect(await screen.findByText("Task Completed?")).toBeInTheDocument();
  expect(screen.queryByTestId("task-completed-late")).not.toBeInTheDocument();
  fireEvent.click(screen.getByTestId("task-completed-yes"));
  await waitFor(() => expect(api.post).toHaveBeenCalled());
  expect(api.post.mock.calls[0][0]).toBe("/order-tasks/3/action/");
  expect(api.post.mock.calls[0][1]).toMatchObject({ action: "complete", dose_given: "500 mg", route_given: "PO" });
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Documented."));
  await waitFor(() => expect(screen.queryByTestId("task-completed-dialog")).not.toBeInTheDocument());
  expect(heard).toHaveBeenCalled();
  window.removeEventListener("tasks-changed", heard);
});

test("No closes the question without saving anything", async () => {
  await open();
  fireEvent.click(screen.getByTestId("grid-cell-3"));
  fireEvent.click(await screen.findByTestId("task-completed-no"));
  await waitFor(() => expect(screen.queryByTestId("task-completed-dialog")).not.toBeInTheDocument());
  expect(api.post).not.toHaveBeenCalled();
});

test("an overdue task needs a note before Yes goes through", async () => {
  await open();
  fireEvent.click(screen.getByTestId("grid-cell-4"));
  expect(await screen.findByTestId("task-completed-late")).toBeInTheDocument();
  fireEvent.click(screen.getByTestId("task-completed-yes"));
  expect(screen.getByTestId("task-completed-error")).toHaveTextContent("Say why in the note");
  expect(api.post).not.toHaveBeenCalled();
  fireEvent.change(screen.getByTestId("task-completed-note"), { target: { value: "Patient was at dialysis" } });
  fireEvent.click(screen.getByTestId("task-completed-yes"));
  await waitFor(() => expect(api.post).toHaveBeenCalled());
  expect(api.post.mock.calls[0][1]).toMatchObject({ action: "complete", note: "Patient was at dialysis" });
});

test("the server's refusal is shown and the question stays open", async () => {
  api.post.mockRejectedValue({ response: { data: { detail: "This order was discontinued." } } });
  await open();
  fireEvent.click(screen.getByTestId("grid-cell-3"));
  fireEvent.click(await screen.findByTestId("task-completed-yes"));
  expect(await screen.findByTestId("task-completed-error")).toHaveTextContent("discontinued");
  expect(screen.getByTestId("task-completed-dialog")).toBeInTheDocument();
});

test("Hold and Refused are offered in the popup and open their forms", async () => {
  await open();
  fireEvent.click(screen.getByTestId("grid-cell-3"));
  fireEvent.click(await screen.findByTestId("task-completed-hold"));
  expect(await screen.findByTestId("task-action-dialog")).toHaveTextContent("Hold this dose");
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByTestId("task-action-dialog")).not.toBeInTheDocument());
  fireEvent.click(screen.getByTestId("grid-cell-3"));
  fireEvent.click(await screen.findByTestId("task-completed-refuse"));
  expect(await screen.findByTestId("task-action-dialog")).toHaveTextContent("Patient refused");
});

test("More options opens the full form", async () => {
  await open();
  fireEvent.click(screen.getByTestId("grid-cell-3"));
  fireEvent.click(await screen.findByTestId("task-completed-more"));
  expect(await screen.findByTestId("task-action-dialog")).toBeInTheDocument();
});

test("people who cannot document see the squares but cannot click them", async () => {
  meta = META({ can_perform: false });
  await open();
  await waitFor(() => expect(screen.getByTestId("grid-cell-3").tagName).toBe("SPAN"));
  fireEvent.click(screen.getByTestId("grid-cell-3"));
  expect(screen.queryByText("Task Completed?")).not.toBeInTheDocument();
});

test("clicking a finished task opens its details", async () => {
  await open();
  fireEvent.click(screen.getByTestId("grid-cell-1"));
  expect(await screen.findByTestId("task-detail-dialog")).toBeInTheDocument();
});

test("earlier unfinished work is kept in an Earlier column on today", async () => {
  list = [...list, TASK({ id: 9, order: 9, title: "Furosemide 40 mg", due_at: at(22, 0, -1), status: "missed", status_label: "Missed" })];
  await open();
  expect(screen.getByTestId("grid-earlier-head")).toBeInTheDocument();
  expect(within(screen.getByTestId("grid-slot-9-earlier")).getByTestId("grid-cell-9")).toHaveAttribute("data-state", "missed");
});

test("a patient's own chart grid drops the patient column", async () => {
  render(<TaskWorklist patient={{ id: 3, name: "Ann Lee" }} />);
  await screen.findByTestId("grid-cell-1");
  expect(screen.queryByRole("columnheader", { name: "Patient / bed" })).toBeNull();
  expect(screen.getByRole("columnheader", { name: "Task" })).toBeInTheDocument();
});

const choose = async (label, option) => {
  fireEvent.mouseDown(screen.getByLabelText(label));
  fireEvent.click(await screen.findByRole("option", { name: option }));
};
const rememberPatient = (patient) => window.sessionStorage.setItem("powerSelectedPatient:7", JSON.stringify(patient));
const taskCalls = () => api.get.mock.calls.filter((c) => c[0] === "/order-tasks/");

test("with a patient last selected on the Patients page, the banner and that patient's tasks show first", async () => {
  rememberPatient({ id: 3, name: "Ann Lee" });
  list = [...list, TASK({ id: 7, order: 10, patient: 4, patient_name: "Bob Ray", title: "Insulin" })];
  render(<TaskWorklist />);
  const banner = await screen.findByTestId("task-patient-banner");
  await waitFor(() => expect(banner).toHaveTextContent("LEE, ANN"));
  expect(banner).toHaveTextContent("Penicillin");
  await waitFor(() => expect(taskCalls().pop()[1].params.patient).toBe(3));
  expect(screen.getByTestId("task-filter-assigned")).toHaveValue("patient");
});

test("the patient banner sits above the Task Manager heading", async () => {
  rememberPatient({ id: 3, name: "Ann Lee" });
  render(<TaskWorklist />);
  const banner = await screen.findByTestId("task-patient-banner");
  const heading = screen.getByText("Task Manager");
  expect(banner.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

test("choosing All patients removes the banner and shows every task", async () => {
  rememberPatient({ id: 3, name: "Ann Lee" });
  render(<TaskWorklist />);
  await screen.findByTestId("task-patient-banner");
  await choose("Patients", "All patients");
  await waitFor(() => expect(screen.queryByTestId("task-patient-banner")).not.toBeInTheDocument());
  await waitFor(() => expect(taskCalls().pop()[1].params.patient).toBeUndefined());
  // and the patient is still in the list to come back to
  await choose("Patients", "Ann Lee");
  await screen.findByTestId("task-patient-banner");
  await waitFor(() => expect(taskCalls().pop()[1].params.patient).toBe(3));
});

test("with nobody selected there is no banner, all patients show, and names are plain text", async () => {
  await open();
  expect(screen.queryByTestId("task-patient-banner")).not.toBeInTheDocument();
  expect(taskCalls().pop()[1].params.patient).toBeUndefined();
  expect(screen.queryByTestId("grid-patient-3")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /show .* only/i })).toBeNull();
  expect(screen.getByTestId("task-filter-assigned")).toHaveValue("");
});

test("a patient's own chart grid has no banner of its own", async () => {
  rememberPatient({ id: 3, name: "Ann Lee" });
  render(<TaskWorklist patient={{ id: 3, name: "Ann Lee" }} />);
  await screen.findByTestId("grid-cell-1");
  expect(screen.queryByTestId("task-patient-banner")).not.toBeInTheDocument();
});

test("clicking anywhere in a task's cell, not only the small mark, opens Task Completed?", async () => {
  await open();
  fireEvent.click(screen.getByTestId("grid-slot-6-840"));
  expect(await screen.findByText("Task Completed?")).toBeInTheDocument();
  expect(screen.queryByTestId("task-completed-at")).not.toBeInTheDocument();
  fireEvent.click(screen.getByTestId("task-completed-yes"));
  await waitFor(() => expect(api.post).toHaveBeenCalled());
  expect(api.post.mock.calls[0][0]).toBe("/order-tasks/3/action/");
  expect(api.post.mock.calls[0][1].performed_at).toBeUndefined();
});

test("an empty cell in a row with something waiting records it as given at that column's time", async () => {
  await open();
  fireEvent.click(screen.getByTestId("grid-slot-7-780")); // the 1:00 PM column of the order due at noon, 60 min away
  expect(await screen.findByText("Task Completed?")).toBeInTheDocument();
  expect(screen.getByTestId("task-completed-at")).toHaveTextContent("1:00");
  expect(screen.queryByTestId("task-completed-late")).not.toBeInTheDocument();
  fireEvent.click(screen.getByTestId("task-completed-yes"));
  await waitFor(() => expect(api.post).toHaveBeenCalled());
  expect(api.post.mock.calls[0][0]).toBe("/order-tasks/4/action/");
  expect(api.post.mock.calls[0][1]).toMatchObject({ action: "complete" });
  expect(new Date(api.post.mock.calls[0][1].performed_at).getTime()).toBe(new Date(2026, 9, 8, 13, 0).getTime());
});

test("an empty cell far from the task's due time needs a note", async () => {
  await open();
  fireEvent.click(screen.getByTestId("grid-slot-5-300")); // 5:00 AM for the order whose open dose is due at 9 PM
  expect(await screen.findByTestId("task-completed-late")).toBeInTheDocument();
  fireEvent.click(screen.getByTestId("task-completed-yes"));
  expect(screen.getByTestId("task-completed-error")).toHaveTextContent("Say why in the note");
  expect(api.post).not.toHaveBeenCalled();
});

test("empty cells in the future do nothing", async () => {
  await open();
  fireEvent.click(screen.getByTestId("grid-slot-7-1080")); // 6:00 PM, later than now (2:30 PM)
  expect(screen.queryByText("Task Completed?")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Document Folic Acid 1 mg at 18:00/ })).not.toBeInTheDocument();
});

test("a row with nothing left waiting has no clickable empty cells", async () => {
  list = [TASK({ id: 1, due_at: at(9), status: "done", performed_by_initials: "JS", performed_at: at(9, 5) })];
  await open();
  fireEvent.click(screen.getByTestId("grid-slot-5-780"));
  expect(screen.queryByText("Task Completed?")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Document Amoxicillin/ })).not.toBeInTheDocument();
});

test("people who cannot document cannot click empty cells either", async () => {
  meta = META({ can_perform: false });
  await open();
  fireEvent.click(screen.getByTestId("grid-slot-7-780"));
  expect(screen.queryByText("Task Completed?")).not.toBeInTheDocument();
});

test("empty cells that can take a dose say so for screen readers", async () => {
  await open();
  expect(screen.getByRole("button", { name: "Document Folic Acid 1 mg at 13:00" })).toBeInTheDocument();
});

test("a custom minute column works the same way", async () => {
  api.get.mockImplementation((url) => {
    if (url === "/order-task-columns/") return Promise.resolve({ data: { columns: [720, 765, 780], is_default: false } });
    if (url === "/order-task-meta/") return Promise.resolve({ data: meta });
    if (url === "/order-tasks/queues/") return Promise.resolve({ data: { counts: {} } });
    if (url === "/order-tasks/") return Promise.resolve({ data: { count: list.length, results: list } });
    return Promise.reject(new Error(`unexpected ${url}`));
  });
  render(<TaskWorklist />);
  await screen.findByTestId("grid-cell-4");
  fireEvent.click(await screen.findByTestId("grid-slot-8-765")); // 12:45, the heparin order that was missed at 6:00
  expect(await screen.findByTestId("task-completed-at")).toHaveTextContent("12:45");
});
