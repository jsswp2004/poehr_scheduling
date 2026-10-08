import { render, screen, waitFor, fireEvent } from "@testing-library/react";

jest.mock("../../api/client", () => ({ api: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), put: jest.fn(), delete: jest.fn() } }), { virtual: true });
jest.mock(
  "../../config/api",
  () => ({
    apiEndpoints: {
      orderTasks: "/order-tasks/",
      orderTaskQueues: "/order-tasks/queues/",
      orderTask: (id) => `/order-tasks/${id}/`,
      orderTaskAction: (id) => `/order-tasks/${id}/action/`,
      orderTaskPrn: "/order-tasks/prn/",
      orderTaskPrnOrders: "/order-tasks/prn-orders/",
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
import TasksPanel from "../tasks/TasksPanel";

const META = (over = {}) => ({
  queues: [
    { value: "needs_action", label: "Due now and overdue" },
    { value: "overdue", label: "Overdue" },
    { value: "upcoming", label: "Upcoming" },
    { value: "missed", label: "Missed" },
    { value: "completed", label: "Last 24 h" },
    { value: "all", label: "All" },
  ],
  can_perform: true,
  can_manage: false,
  grace_minutes: 60,
  ...over,
});

const minutesAgo = (n) => new Date(Date.now() - n * 60000).toISOString();

const TASK = (over = {}) => ({
  id: 21,
  order: 5,
  order_status: "active",
  patient: 3,
  patient_name: "Ann Lee",
  title: "Amoxicillin 500 mg capsule",
  task_type: "medication",
  dose: "500 mg",
  route: "PO",
  instructions: "with food",
  frequency: "bid",
  frequency_label: "Twice a day (BID)",
  due_at: minutesAgo(5),
  is_prn: false,
  status: "pending",
  status_label: "Pending",
  overdue: false,
  minutes_late: 5,
  performed_by_name: "",
  performed_at: null,
  reason: "",
  note: "",
  detail: {},
  unit_name: "4 West",
  room_name: "412",
  bed_name: "A",
  actions: ["complete", "hold", "refuse", "note"],
  ...over,
});

const COUNTS = { needs_action: 2, overdue: 1, upcoming: 4, missed: 0, completed: 3, all: 9 };
let list;

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  Object.values(toast).forEach((fn) => fn.mockReset());
  list = [TASK()];
  api.get.mockImplementation((url) => {
    if (url === "/order-task-meta/") return Promise.resolve({ data: META() });
    if (url === "/order-tasks/queues/") return Promise.resolve({ data: { counts: COUNTS } });
    if (url === "/order-tasks/") return Promise.resolve({ data: { count: list.length, results: list } });
    if (url === "/order-tasks/prn-orders/")
      return Promise.resolve({ data: [{ order: 8, title: "Acetaminophen 650 mg", dose: "650 mg", route: "PO", prn_reason: "pain", min_interval_hours: 4, last_given_at: null }] });
    const m = /^\/order-tasks\/(\d+)\/$/.exec(url);
    if (m) return Promise.resolve({ data: { ...list.find((t) => String(t.id) === m[1]), events: [{ id: 1, type: "created", user: "", at: minutesAgo(600), detail: {} }] } });
    return Promise.reject(new Error(`unexpected ${url}`));
  });
  api.post.mockResolvedValue({ data: TASK({ status: "done" }) });
});

test("the clinic worklist shows the queues with counts and each task with patient and bed", async () => {
  render(<TaskWorklist />);
  expect(await screen.findByTestId("task-row-21")).toHaveTextContent("Amoxicillin 500 mg capsule");
  expect(screen.getByTestId("task-row-21")).toHaveTextContent("Ann Lee");
  expect(screen.getByTestId("task-row-21")).toHaveTextContent("4 West · 412 · A");
  expect(screen.getByTestId("task-row-21")).toHaveTextContent("500 mg PO");
  expect(screen.getByTestId("task-queue-needs_action")).toHaveTextContent("Due now and overdue (2)");
  expect(screen.getByTestId("task-queue-overdue")).toHaveTextContent("(1)");
  expect(screen.getByTestId("task-queue-all")).not.toHaveTextContent("(9)");
  expect(screen.getByTestId("task-count")).toHaveTextContent("1 task");
  // the first list asked for is the one that needs action
  expect(api.get.mock.calls.find((c) => c[0] === "/order-tasks/")[1].params.queue).toBe("needs_action");
});

test("an overdue task is flagged with how late it is", async () => {
  list = [TASK({ overdue: true, minutes_late: 95 })];
  render(<TaskWorklist />);
  expect(await screen.findByTestId("task-late-21")).toHaveTextContent("95 min late");
});

test("switching the queue and the filters asks the server for them", async () => {
  render(<TaskWorklist />);
  await screen.findByTestId("task-row-21");
  fireEvent.click(screen.getByTestId("task-queue-missed"));
  await waitFor(() => expect(api.get.mock.calls.some((c) => c[0] === "/order-tasks/" && c[1].params.queue === "missed")).toBe(true));
  fireEvent.change(screen.getByTestId("task-search"), { target: { value: "amox" } });
  await waitFor(() => expect(api.get.mock.calls.some((c) => c[0] === "/order-tasks/" && c[1].params.q === "amox")).toBe(true));
  fireEvent.change(screen.getByTestId("task-filter-assigned"), { target: { value: "me" } });
  await waitFor(() => expect(api.get.mock.calls.some((c) => c[0] === "/order-tasks/" && c[1].params.assigned === "me")).toBe(true));
});

test("giving a dose on time sends the dose given and tells the menu badge", async () => {
  const heard = jest.fn();
  window.addEventListener("tasks-changed", heard);
  render(<TaskWorklist />);
  fireEvent.click(await screen.findByTestId("task-complete-21"));
  expect(screen.getByTestId("task-dose-given")).toHaveValue("500 mg");
  expect(screen.queryByTestId("task-late-hint")).not.toBeInTheDocument();
  fireEvent.click(screen.getByTestId("task-action-submit"));
  await waitFor(() => expect(api.post).toHaveBeenCalled());
  expect(api.post.mock.calls[0][0]).toBe("/order-tasks/21/action/");
  expect(api.post.mock.calls[0][1]).toMatchObject({ action: "complete", dose_given: "500 mg", route_given: "PO" });
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Documented."));
  expect(heard).toHaveBeenCalled();
  window.removeEventListener("tasks-changed", heard);
});

test("a dose far from its due time needs a note before anything is sent", async () => {
  list = [TASK({ due_at: minutesAgo(180) })];
  render(<TaskWorklist />);
  fireEvent.click(await screen.findByTestId("task-complete-21"));
  expect(screen.getByTestId("task-late-hint")).toHaveTextContent("60 minutes");
  fireEvent.click(screen.getByTestId("task-action-submit"));
  expect(await screen.findByTestId("task-action-error")).toHaveTextContent("outside its time window");
  expect(api.post).not.toHaveBeenCalled();
  fireEvent.change(screen.getByTestId("task-note"), { target: { value: "Patient was in radiology" } });
  fireEvent.click(screen.getByTestId("task-action-submit"));
  await waitFor(() => expect(api.post).toHaveBeenCalled());
  expect(api.post.mock.calls[0][1].note).toBe("Patient was in radiology");
});

test("holding needs a reason; the server's own message is shown when it refuses", async () => {
  render(<TaskWorklist />);
  fireEvent.click(await screen.findByTestId("task-hold-21"));
  fireEvent.click(screen.getByTestId("task-action-submit"));
  expect(await screen.findByTestId("task-action-error")).toHaveTextContent("Say why it was held.");
  expect(api.post).not.toHaveBeenCalled();
  fireEvent.change(screen.getByTestId("task-reason"), { target: { value: "NPO" } });
  api.post.mockRejectedValueOnce({ response: { status: 409, data: { detail: "A done task can't take that step." } } });
  fireEvent.click(screen.getByTestId("task-action-submit"));
  expect(await screen.findByTestId("task-action-error")).toHaveTextContent("A done task can't take that step.");
});

test("refusing starts with 'Patient refused' as the reason", async () => {
  render(<TaskWorklist />);
  fireEvent.click(await screen.findByTestId("task-refuse-21"));
  expect(screen.getByTestId("task-reason")).toHaveValue("Patient refused");
  fireEvent.click(screen.getByTestId("task-action-submit"));
  await waitFor(() => expect(api.post).toHaveBeenCalled());
  expect(api.post.mock.calls[0][1]).toMatchObject({ action: "refuse", reason: "Patient refused" });
});

test("a user who may only view sees the tasks without any action buttons", async () => {
  list = [TASK({ actions: [] })];
  api.get.mockImplementationOnce(() => Promise.resolve({ data: META({ can_perform: false }) }));
  render(<TaskWorklist />);
  await screen.findByTestId("task-row-21");
  expect(screen.queryByTestId("task-complete-21")).not.toBeInTheDocument();
  expect(screen.queryByTestId("task-hold-21")).not.toBeInTheDocument();
});

test("a role the server turns away gets a plain message", async () => {
  api.get.mockReset();
  api.get.mockRejectedValue({ response: { status: 403, data: {} } });
  render(<TaskWorklist />);
  expect(await screen.findByTestId("tasks-denied")).toBeInTheDocument();
});

test("opening a row shows its history and lets a nurse add a note", async () => {
  render(<TaskWorklist />);
  fireEvent.click(await screen.findByTestId("task-row-21"));
  await waitFor(() => expect(screen.getByTestId("task-detail-dialog")).toHaveTextContent("created"));
  fireEvent.click(screen.getByTestId("task-add-note"));
  fireEvent.change(screen.getByTestId("task-note"), { target: { value: "Tolerated well" } });
  fireEvent.click(screen.getByTestId("task-action-submit"));
  await waitFor(() => expect(api.post).toHaveBeenCalled());
  expect(api.post.mock.calls[0][1]).toMatchObject({ action: "note", note: "Tolerated well" });
});

test("the patient's Task List tab is scoped to that patient and has no patient column", async () => {
  render(<TasksPanel patient={{ id: 3, name: "Ann Lee" }} />);
  expect(await screen.findByText("Tasks — Ann Lee")).toBeInTheDocument();
  await screen.findByTestId("task-row-21");
  const call = api.get.mock.calls.find((c) => c[0] === "/order-tasks/");
  expect(call[1].params).toMatchObject({ patient: 3, queue: "all" });
  expect(screen.queryByText("Patient / bed")).not.toBeInTheDocument();
  expect(screen.queryByTestId("task-filter-assigned")).not.toBeInTheDocument();
});

test("an as-needed dose: the server's minimum-gap refusal asks for a reason, then gives it", async () => {
  render(<TaskWorklist patient={{ id: 3, name: "Ann Lee" }} />);
  fireEvent.click(await screen.findByTestId("task-prn"));
  expect(await screen.findByTestId("prn-dialog")).toHaveTextContent("Acetaminophen 650 mg");
  fireEvent.change(screen.getByTestId("prn-reason"), { target: { value: "Pain 7/10" } });
  api.post.mockRejectedValueOnce({ response: { status: 409, data: { detail: "The last dose was given 08:00. At least 4 hours are needed between doses. Give a reason to give it anyway." } } });
  fireEvent.click(screen.getByTestId("prn-submit"));
  expect(await screen.findByTestId("prn-error")).toHaveTextContent("At least 4 hours");
  fireEvent.change(await screen.findByTestId("prn-override"), { target: { value: "MD approved by phone" } });
  api.post.mockResolvedValueOnce({ data: TASK({ is_prn: true, status: "done" }) });
  fireEvent.click(screen.getByTestId("prn-submit"));
  await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
  expect(api.post.mock.calls[1][0]).toBe("/order-tasks/prn/");
  expect(api.post.mock.calls[1][1]).toMatchObject({ order: 8, reason: "Pain 7/10", override_reason: "MD approved by phone" });
});

test("the as-needed button is hidden for someone who cannot document", async () => {
  api.get.mockImplementation((url) => {
    if (url === "/order-task-meta/") return Promise.resolve({ data: META({ can_perform: false }) });
    if (url === "/order-tasks/queues/") return Promise.resolve({ data: { counts: COUNTS } });
    return Promise.resolve({ data: { count: 0, results: [] } });
  });
  render(<TaskWorklist patient={{ id: 3, name: "Ann Lee" }} />);
  await screen.findByTestId("task-empty");
  expect(screen.queryByTestId("task-prn")).not.toBeInTheDocument();
});
