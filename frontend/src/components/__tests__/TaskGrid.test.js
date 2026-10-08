import { render, screen, waitFor, fireEvent } from "@testing-library/react";

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

const minutesAgo = (n) => new Date(Date.now() - n * 60000).toISOString();
const META = (over = {}) => ({
  queues: [
    { value: "needs_action", label: "Due now and overdue" },
    { value: "completed", label: "Last 24 h" },
    { value: "all", label: "All" },
  ],
  can_perform: true,
  grace_minutes: 60,
  ...over,
});
const TASK = (over = {}) => ({
  id: 1, order: 5, patient: 3, patient_name: "Ann Lee", title: "Amoxicillin 500 mg capsule", task_type: "medication",
  dose: "500 mg", route: "PO", frequency: "bid", frequency_label: "Twice a day (BID)", due_at: minutesAgo(10), is_prn: false,
  status: "pending", status_label: "Pending", overdue: false, minutes_late: 0, performed_by_name: "", performed_by_initials: "",
  performed_at: null, unit_name: "4 West", room_name: "412", bed_name: "A", actions: ["complete", "hold", "refuse"], ...over,
});

let list;
let meta;
beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  Object.values(toast).forEach((fn) => fn.mockReset());
  meta = META();
  list = [
    TASK({ id: 1, status: "done", status_label: "Done", performed_by_name: "Jess Salvacion", performed_by_initials: "JS", performed_at: minutesAgo(5) }),
    TASK({ id: 2, title: "Metoprolol 25 mg tablet", due_at: minutesAgo(20) }),
  ];
  api.get.mockImplementation((url) => {
    if (url === "/order-task-meta/") return Promise.resolve({ data: meta });
    if (url === "/order-tasks/queues/") return Promise.resolve({ data: { counts: { completed: 2 } } });
    if (url === "/order-tasks/") return Promise.resolve({ data: { count: list.length, results: list } });
    const m = /^\/order-tasks\/(\d+)\/$/.exec(url);
    if (m) return Promise.resolve({ data: { ...list.find((t) => String(t.id) === m[1]), events: [] } });
    return Promise.reject(new Error(`unexpected ${url}`));
  });
  api.post.mockResolvedValue({ data: {} });
});

const openGrid = async () => {
  render(<TaskWorklist />);
  fireEvent.click(await screen.findByTestId("task-queue-completed"));
  await screen.findByTestId("task-grid");
};

test("the last-24-hours tab is a grid: patient/bed, task, frequency, time and status", async () => {
  await openGrid();
  ["Patient / bed", "Task", "Frequency", "Time", "Status"].forEach((h) => expect(screen.getByRole("columnheader", { name: h })).toBeInTheDocument());
  const row = screen.getByTestId("grid-row-1");
  expect(row).toHaveTextContent("Ann Lee");
  expect(row).toHaveTextContent("4 West · 412 · A");
  expect(row).toHaveTextContent("Amoxicillin 500 mg capsule");
  expect(row).toHaveTextContent("Twice a day (BID)");
  expect(row).toHaveTextContent(/[A-Z][a-z]{2} \d{1,2}, .*\d{1,2}:\d{2}/); // short date, then the time
  expect(api.get.mock.calls.filter((c) => c[0] === "/order-tasks/").pop()[1].params.queue).toBe("completed");
});

test("a finished task shows a check and the initials of who did it", async () => {
  await openGrid();
  expect(screen.getByTestId("grid-status-1")).toHaveTextContent("JS");
  expect(screen.getByTestId("grid-status-1").querySelector("svg")).not.toBeNull();
  expect(screen.getByTestId("grid-status-2")).toHaveTextContent("");
});

test("clicking a waiting cell asks Task Completed? and Yes records it", async () => {
  const heard = jest.fn();
  window.addEventListener("tasks-changed", heard);
  await openGrid();
  fireEvent.click(screen.getByTestId("grid-status-2"));
  expect(await screen.findByText("Task Completed?")).toBeInTheDocument();
  expect(screen.queryByTestId("task-completed-late")).not.toBeInTheDocument();
  fireEvent.click(screen.getByTestId("task-completed-yes"));
  await waitFor(() => expect(api.post).toHaveBeenCalled());
  expect(api.post.mock.calls[0][0]).toBe("/order-tasks/2/action/");
  expect(api.post.mock.calls[0][1]).toMatchObject({ action: "complete", dose_given: "500 mg", route_given: "PO" });
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Documented."));
  await waitFor(() => expect(screen.queryByTestId("task-completed-dialog")).not.toBeInTheDocument());
  expect(heard).toHaveBeenCalled();
  window.removeEventListener("tasks-changed", heard);
});

test("No closes the question without saving anything", async () => {
  await openGrid();
  fireEvent.click(screen.getByTestId("grid-status-2"));
  fireEvent.click(await screen.findByTestId("task-completed-no"));
  await waitFor(() => expect(screen.queryByTestId("task-completed-dialog")).not.toBeInTheDocument());
  expect(api.post).not.toHaveBeenCalled();
});

test("a task far from its due time needs a note before Yes goes through", async () => {
  list = [TASK({ id: 2, due_at: minutesAgo(180), overdue: true, minutes_late: 180 })];
  await openGrid();
  fireEvent.click(screen.getByTestId("grid-status-2"));
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
  await openGrid();
  fireEvent.click(screen.getByTestId("grid-status-2"));
  fireEvent.click(await screen.findByTestId("task-completed-yes"));
  expect(await screen.findByTestId("task-completed-error")).toHaveTextContent("discontinued");
  expect(screen.getByTestId("task-completed-dialog")).toBeInTheDocument();
});

test("people who cannot document see the square but cannot click it", async () => {
  meta = META({ can_perform: false });
  await openGrid();
  fireEvent.click(screen.getByTestId("grid-status-2"));
  expect(screen.queryByText("Task Completed?")).not.toBeInTheDocument();
});

test("clicking a finished task opens its details", async () => {
  await openGrid();
  fireEvent.click(screen.getByTestId("grid-status-1"));
  expect(await screen.findByTestId("task-detail-dialog")).toBeInTheDocument();
});

test("More options opens the full form", async () => {
  await openGrid();
  fireEvent.click(screen.getByTestId("grid-status-2"));
  fireEvent.click(await screen.findByTestId("task-completed-more"));
  expect(await screen.findByTestId("task-action-dialog")).toBeInTheDocument();
});

test("the other tabs keep the table", async () => {
  render(<TaskWorklist />);
  expect(await screen.findByTestId("task-row-1")).toBeInTheDocument();
  expect(screen.queryByTestId("task-grid")).not.toBeInTheDocument();
});

test("a patient's own chart list drops the patient column", async () => {
  render(<TaskWorklist patient={{ id: 3, name: "Ann Lee" }} />);
  fireEvent.click(await screen.findByTestId("task-queue-completed"));
  await screen.findByTestId("task-grid");
  expect(screen.queryByRole("columnheader", { name: "Patient / bed" })).toBeNull();
});
