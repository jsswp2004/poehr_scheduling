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
      orderTaskColumns: "/order-task-columns/",
      patientHeader: (id) => `/header/${id}/`,
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
    { value: "completed", label: "Done (last 24 h)" },
    { value: "all", label: "All" },
  ],
  can_perform: true,
  can_manage: false,
  grace_minutes: 60,
  ...over,
});

const NOW = new Date(2026, 9, 8, 14, 30);
const NOWISO = NOW.toISOString();
const minutesAgo = (n) => new Date(NOW.getTime() - n * 60000).toISOString();

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
  due_now: true,
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

afterEach(() => jest.useRealTimers());
const COUNTS = { needs_action: 2, overdue: 1, upcoming: 4, missed: 0, completed: 3, all: 9 };
let list;

beforeEach(() => {
  jest.useFakeTimers({ now: NOW, doNotFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "setImmediate", "clearImmediate", "nextTick", "queueMicrotask"] });
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

test("the Task Manager is one grid for the day with filters and a legend", async () => {
  render(<TaskWorklist />);
  expect(await screen.findByTestId("grid-cell-21")).toBeInTheDocument();
  expect(screen.getByText("Task Manager")).toBeInTheDocument();
  expect(screen.getByTestId("legend-overdue")).toHaveTextContent("Overdue 1");
  expect(screen.getByTestId("legend-due")).toHaveTextContent("Due now 1");
  expect(screen.getByTestId("task-filter-assigned")).toBeInTheDocument();
});

test("the filters ask the server for them", async () => {
  render(<TaskWorklist />);
  await screen.findByTestId("grid-cell-21");
  fireEvent.change(screen.getByTestId("task-search"), { target: { value: "amox" } });
  await waitFor(() => expect(api.get.mock.calls.some((c) => c[0] === "/order-tasks/" && c[1].params.q === "amox")).toBe(true));
  fireEvent.change(screen.getByTestId("task-filter-assigned"), { target: { value: "me" } });
  await waitFor(() => expect(api.get.mock.calls.some((c) => c[0] === "/order-tasks/" && c[1].params.assigned === "me")).toBe(true));
});

test("the arrows and the date box move between days; Today comes back", async () => {
  render(<TaskWorklist />);
  await screen.findByTestId("grid-cell-21");
  const lastParams = () => api.get.mock.calls.filter((c) => c[0] === "/order-tasks/").pop()[1].params;
  const today = new Date(lastParams().from).getTime();
  fireEvent.click(screen.getByTestId("day-prev"));
  await waitFor(() => expect(new Date(lastParams().from).getTime()).toBeLessThan(today));
  expect(lastParams().include_earlier).toBeUndefined(); // a past day does not drag in today's backlog
  expect(screen.queryByTestId("grid-earlier-head")).not.toBeInTheDocument();
  fireEvent.click(screen.getByTestId("day-today"));
  await waitFor(() => expect(new Date(lastParams().from).getTime()).toBe(today));
  fireEvent.click(screen.getByTestId("day-next"));
  await waitFor(() => expect(new Date(lastParams().from).getTime()).toBeGreaterThan(today));
  fireEvent.change(screen.getByTestId("day-input"), { target: { value: "2026-10-01" } });
  await waitFor(() => expect(new Date(lastParams().from).getTime()).toBe(new Date(2026, 9, 1).getTime()));
});

test("a server error is shown", async () => {
  api.get.mockImplementation((url) => {
    if (url === "/order-task-meta/") return Promise.resolve({ data: META() });
    return Promise.reject({ response: { status: 500, data: {} } });
  });
  render(<TaskWorklist />);
  expect(await screen.findByText(/Could not load the tasks/)).toBeInTheDocument();
});

test("a role the server turns away gets a plain message", async () => {
  api.get.mockReset();
  api.get.mockRejectedValue({ response: { status: 403, data: {} } });
  render(<TaskWorklist />);
  expect(await screen.findByTestId("tasks-denied")).toBeInTheDocument();
});

test("holding needs a reason; the server's own message is shown when it refuses", async () => {
  render(<TaskWorklist />);
  fireEvent.click(await screen.findByTestId("grid-cell-21"));
  fireEvent.click(await screen.findByTestId("task-completed-hold"));
  fireEvent.click(await screen.findByTestId("task-action-submit"));
  expect(await screen.findByTestId("task-action-error")).toHaveTextContent("Say why it was held.");
  expect(api.post).not.toHaveBeenCalled();
  fireEvent.change(screen.getByTestId("task-reason"), { target: { value: "NPO" } });
  api.post.mockRejectedValueOnce({ response: { status: 409, data: { detail: "A done task can't take that step." } } });
  fireEvent.click(screen.getByTestId("task-action-submit"));
  expect(await screen.findByTestId("task-action-error")).toHaveTextContent("A done task can't take that step.");
});

test("refusing starts with 'Patient refused' as the reason", async () => {
  render(<TaskWorklist />);
  fireEvent.click(await screen.findByTestId("grid-cell-21"));
  fireEvent.click(await screen.findByTestId("task-completed-refuse"));
  expect(await screen.findByTestId("task-reason")).toHaveValue("Patient refused");
  fireEvent.click(screen.getByTestId("task-action-submit"));
  await waitFor(() => expect(api.post).toHaveBeenCalled());
  expect(api.post.mock.calls[0][1]).toMatchObject({ action: "refuse", reason: "Patient refused" });
});

test("giving a dose from the full form sends the dose given", async () => {
  render(<TaskWorklist />);
  fireEvent.click(await screen.findByTestId("grid-cell-21"));
  fireEvent.click(await screen.findByTestId("task-completed-more"));
  expect(await screen.findByTestId("task-dose-given")).toHaveValue("500 mg");
  fireEvent.click(screen.getByTestId("task-action-submit"));
  await waitFor(() => expect(api.post).toHaveBeenCalled());
  expect(api.post.mock.calls[0][1]).toMatchObject({ action: "complete", dose_given: "500 mg", route_given: "PO" });
});

test("opening a finished task shows its history and lets a nurse add a note", async () => {
  list = [TASK({ status: "done", performed_by_initials: "JS", performed_at: NOWISO, actions: ["note"] })];
  render(<TaskWorklist />);
  fireEvent.click(await screen.findByTestId("grid-cell-21"));
  await waitFor(() => expect(screen.getByTestId("task-detail-dialog")).toHaveTextContent("created"));
  fireEvent.click(screen.getByTestId("task-add-note"));
  fireEvent.change(screen.getByTestId("task-note"), { target: { value: "Tolerated well" } });
  fireEvent.click(screen.getByTestId("task-action-submit"));
  await waitFor(() => expect(api.post).toHaveBeenCalled());
  expect(api.post.mock.calls[0][1]).toMatchObject({ action: "note", note: "Tolerated well" });
});

test("the patient's Task List tab is that patient's grid", async () => {
  render(<TasksPanel patient={{ id: 3, name: "Ann Lee" }} />);
  expect(await screen.findByText("Tasks — Ann Lee")).toBeInTheDocument();
  await screen.findByTestId("grid-cell-21");
  const call = api.get.mock.calls.find((c) => c[0] === "/order-tasks/");
  expect(call[1].params).toMatchObject({ patient: 3, queue: "grid" });
  expect(screen.queryByRole("columnheader", { name: "Patient / bed" })).not.toBeInTheDocument();
  expect(screen.queryByTestId("task-filter-assigned")).not.toBeInTheDocument();
});

test("an as-needed dose: the server's minimum-gap refusal asks for a reason, then gives it", async () => {
  render(<TaskWorklist patient={{ id: 3, name: "Ann Lee" }} />);
  fireEvent.click(await screen.findByTestId("task-prn"));
  await screen.findByTestId("prn-dialog");
  await waitFor(() => expect(screen.getByTestId("prn-dialog")).toHaveTextContent("Acetaminophen 650 mg"));
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
