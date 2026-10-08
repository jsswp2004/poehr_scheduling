import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";

jest.mock("../../api/client", () => ({ api: { get: jest.fn(), post: jest.fn() } }), { virtual: true });
jest.mock(
  "../../config/api",
  () => ({
    apiEndpoints: {
      orderTasks: "/order-tasks/",
      orderTaskQueues: "/order-tasks/queues/",
      orderTask: (id) => `/order-tasks/${id}/`,
      orderTaskAction: (id) => `/order-tasks/${id}/action/`,
      orderTaskMeta: "/order-task-meta/",
    },
  }),
  { virtual: true }
);
jest.mock("../../utils/auth", () => ({ getValidToken: async () => ({ access_token: "t" }) }), { virtual: true });
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
    if (url === "/order-tasks/queues/") return Promise.resolve({ data: { counts: { needs_action: 2, overdue: 1, missed: 1 } } });
    if (url === "/order-tasks/") return Promise.resolve({ data: { count: list.length, results: list } });
    const m = /^\/order-tasks\/(\d+)\/$/.exec(url);
    if (m) return Promise.resolve({ data: { ...list.find((t) => String(t.id) === m[1]), events: [] } });
    return Promise.reject(new Error(`unexpected ${url}`));
  });
  api.post.mockResolvedValue({ data: {} });
});
afterEach(() => jest.useRealTimers());

const open = async () => {
  render(<TaskWorklist />);
  await screen.findByTestId("grid-cell-1");
};

test("the hours of the day run across the top and the task details down the left", async () => {
  await open();
  ["Patient / bed", "Task", "Frequency"].forEach((h) => expect(screen.getByRole("columnheader", { name: h })).toBeInTheDocument());
  expect(screen.getByTestId("grid-hour-0")).toHaveTextContent("0:00");
  expect(screen.getByTestId("grid-hour-23")).toHaveTextContent("23:00");
  const row = screen.getByTestId("grid-row-5");
  expect(row).toHaveTextContent("Ann Lee");
  expect(row).toHaveTextContent("4 West · 412 · A");
  expect(row).toHaveTextContent("Amoxicillin 500 mg capsule");
  expect(row).toHaveTextContent("Twice a day (BID)");
});

test("each task sits in its own hour and one order shows all its times on one line", async () => {
  await open();
  expect(within(screen.getByTestId("grid-slot-5-9")).getByTestId("grid-cell-1")).toBeInTheDocument();
  expect(within(screen.getByTestId("grid-slot-5-21")).getByTestId("grid-cell-2")).toBeInTheDocument();
  expect(screen.getAllByTestId("grid-row-5")).toHaveLength(1);
  expect(within(screen.getByTestId("grid-slot-6-14")).getByTestId("grid-cell-3")).toHaveTextContent("2:15");
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
