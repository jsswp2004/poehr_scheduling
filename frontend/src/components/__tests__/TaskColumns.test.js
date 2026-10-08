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
jest.mock("../SimpleToast", () => ({ toast: { error: jest.fn(), success: jest.fn() } }), { virtual: true });

import { api } from "../../api/client";
import { toast } from "../SimpleToast";
import TaskWorklist from "../tasks/TaskWorklist";
import { columnFor, expandRange, mergeColumns, minutesLabel, parseClock } from "../tasks/taskShared";

const NOW = new Date(2026, 9, 8, 14, 30);
const at = (h, m = 0) => new Date(2026, 9, 8, h, m).toISOString();
const HOURLY = Array.from({ length: 24 }, (_, h) => h * 60);

const TASK = (over = {}) => ({
  id: 1, order: 5, patient: 3, patient_name: "Ann Lee", title: "Amoxicillin 500 mg capsule", task_type: "medication", dose: "500 mg", route: "PO",
  instructions: "", frequency: "bid", frequency_label: "Twice a day (BID)", due_at: at(9), is_prn: false, status: "pending", status_label: "Pending",
  overdue: false, due_now: false, minutes_late: 0, performed_by_name: "", performed_by_initials: "", performed_at: null,
  unit_name: "4 West", room_name: "412", bed_name: "A", actions: ["complete", "hold", "refuse"], ...over,
});

let list;
let saved; // what the server returns for the person's columns
beforeEach(() => {
  jest.useFakeTimers({ now: NOW, doNotFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "setImmediate", "clearImmediate", "nextTick", "queueMicrotask"] });
  Object.values(api).forEach((fn) => fn.mockReset());
  Object.values(toast).forEach((fn) => fn.mockReset());
  saved = HOURLY;
  list = [TASK({ id: 1, due_at: at(9) })];
  api.get.mockImplementation((url) => {
    if (url === "/order-task-meta/") return Promise.resolve({ data: { can_perform: true, grace_minutes: 60 } });
    if (url === "/order-task-columns/") return Promise.resolve({ data: { columns: saved, is_default: saved === HOURLY } });
    if (url === "/order-tasks/queues/") return Promise.resolve({ data: { counts: {} } });
    if (url === "/order-tasks/") return Promise.resolve({ data: { count: list.length, results: list } });
    return Promise.reject(new Error(`unexpected ${url}`));
  });
  api.put.mockImplementation((url, body) => Promise.resolve({ data: { columns: body.columns, is_default: false } }));
  api.delete.mockResolvedValue({ data: { columns: HOURLY, is_default: true } });
});
afterEach(() => jest.useRealTimers());

const openDialog = async () => {
  render(<TaskWorklist />);
  await screen.findByTestId("grid-cell-1");
  fireEvent.click(screen.getByTestId("columns-open"));
  return screen.findByTestId("columns-dialog");
};
const pickStep = (label) => {
  fireEvent.mouseDown(within(screen.getByTestId("col-step").closest(".MuiInputBase-root")).getByRole("combobox"));
  fireEvent.click(screen.getByRole("option", { name: label }));
};
const setTime = (testId, value) => fireEvent.change(screen.getByTestId(testId), { target: { value } });
const saveAndClose = async () => {
  fireEvent.click(screen.getByTestId("col-save"));
  await waitFor(() => expect(screen.queryByTestId("columns-dialog")).not.toBeInTheDocument());
};

describe("column helpers", () => {
  test("labels and clock parsing", () => {
    expect(minutesLabel(585)).toBe("9:45");
    expect(minutesLabel(0)).toBe("0:00");
    expect(parseClock("09:45")).toBe(585);
    expect(parseClock("24:00")).toBeNull();
    expect(parseClock("")).toBeNull();
  });
  test("a range steps from the start to the end, inclusive", () => {
    expect(expandRange(480, 510, 15)).toEqual([480, 495, 510]);
    expect(expandRange(600, 605, 1)).toHaveLength(6);
    expect(expandRange(510, 480, 15)).toEqual([]);
    expect(expandRange(480, 510, 0)).toEqual([]);
  });
  test("merging keeps time order with no duplicates", () => {
    expect(mergeColumns([540, 600], [600, 570])).toEqual([540, 570, 600]);
  });
  test("a task falls in the latest column at or before it, or the first if it is earlier than all", () => {
    expect(columnFor([480, 720], 540)).toBe(480);
    expect(columnFor([480, 720], 720)).toBe(720);
    expect(columnFor([480, 720], 360)).toBe(480);
    expect(columnFor([480, 720], 1300)).toBe(720);
  });
});

test("the grid starts hourly when nothing is saved", async () => {
  render(<TaskWorklist />);
  await screen.findByTestId("grid-cell-1");
  expect(screen.getByTestId("grid-col-0")).toBeInTheDocument();
  expect(screen.getByTestId("grid-col-1380")).toBeInTheDocument();
  expect(screen.queryByTestId("grid-col-15")).not.toBeInTheDocument();
});

test("saved columns come back when the page opens", async () => {
  saved = [480, 540, 1020];
  render(<TaskWorklist />);
  await screen.findByTestId("grid-cell-1");
  await waitFor(() => expect(screen.queryByTestId("grid-col-0")).not.toBeInTheDocument());
  expect(screen.getByTestId("grid-col-480")).toHaveTextContent("8:00");
  expect(screen.getByTestId("grid-col-1020")).toHaveTextContent("17:00");
});

test("add one time: it appears in order and is saved sorted", async () => {
  await openDialog();
  setTime("col-one", "14:45");
  fireEvent.click(screen.getByTestId("col-add-one"));
  expect(screen.getByTestId("col-chip-885")).toHaveTextContent("14:45");
  expect(screen.getByTestId("col-count")).toHaveTextContent("25 columns");
  await saveAndClose();
  const columns = api.put.mock.calls[0][1].columns;
  expect(api.put.mock.calls[0][0]).toBe("/order-task-columns/");
  expect(columns).toHaveLength(25);
  expect(columns).toEqual([...columns].sort((a, b) => a - b));
  expect(columns).toContain(885);
  expect(await screen.findByTestId("grid-col-885")).toHaveTextContent("14:45");
  expect(toast.success).toHaveBeenCalledWith("Time columns saved.");
});

test("adding a time that already exists does not duplicate it", async () => {
  await openDialog();
  setTime("col-one", "09:00");
  fireEvent.click(screen.getByTestId("col-add-one"));
  expect(screen.getByTestId("col-count")).toHaveTextContent("24 columns");
});

test("add a range every 15 minutes", async () => {
  await openDialog();
  setTime("col-from", "08:00");
  setTime("col-to", "09:00");
  pickStep("15 minutes");
  expect(screen.getByTestId("col-range-preview")).toHaveTextContent("5 columns: 8:00 to 9:00");
  fireEvent.click(screen.getByTestId("col-add-range"));
  expect(screen.getByTestId("col-count")).toHaveTextContent("27 columns"); // 8:00 and 9:00 were already there
  [495, 510, 525].forEach((m) => expect(screen.getByTestId(`col-chip-${m}`)).toBeInTheDocument());
  await saveAndClose();
  expect(api.put.mock.calls[0][1].columns).toHaveLength(27);
});

test("every minute and every 5 and 10 minutes work too", async () => {
  await openDialog();
  setTime("col-from", "10:00");
  setTime("col-to", "10:10");
  pickStep("minute");
  expect(screen.getByTestId("col-range-preview")).toHaveTextContent("11 columns");
  fireEvent.click(screen.getByTestId("col-add-range"));
  expect(screen.getByTestId("col-count")).toHaveTextContent("34 columns"); // 24 + 10 new minutes
  setTime("col-from", "13:00");
  setTime("col-to", "13:30");
  pickStep("10 minutes");
  expect(screen.getByTestId("col-range-preview")).toHaveTextContent("4 columns");
  fireEvent.click(screen.getByTestId("col-add-range"));
  expect(screen.getByTestId("col-count")).toHaveTextContent("37 columns"); // 13:00 existed
  pickStep("5 minutes");
  expect(screen.getByTestId("col-range-preview")).toHaveTextContent("7 columns");
});

test("a range that ends before it starts, or an empty time, is refused with a message", async () => {
  await openDialog();
  setTime("col-from", "12:00");
  setTime("col-to", "08:00");
  fireEvent.click(screen.getByTestId("col-add-range"));
  expect(screen.getByTestId("columns-error")).toHaveTextContent("same as or after");
  fireEvent.click(screen.getByTestId("col-add-one"));
  expect(screen.getByTestId("columns-error")).toHaveTextContent("Pick a time");
  expect(screen.getByTestId("col-count")).toHaveTextContent("24 columns");
});

test("delete a column; its tasks move into the column just before it", async () => {
  await openDialog();
  fireEvent.click(screen.getByTestId("col-del-540"));
  expect(screen.queryByTestId("col-chip-540")).not.toBeInTheDocument();
  await saveAndClose();
  expect(api.put.mock.calls[0][1].columns).not.toContain(540);
  expect(screen.queryByTestId("grid-col-540")).not.toBeInTheDocument();
  expect(within(screen.getByTestId("grid-slot-5-480")).getByTestId("grid-cell-1")).toBeInTheDocument(); // the 9:00 task is now under 8:00
});

test("the last column cannot be deleted", async () => {
  saved = [540];
  await openDialog();
  fireEvent.click(screen.getByTestId("col-del-540"));
  expect(screen.getByTestId("columns-error")).toHaveTextContent("at least one");
  expect(screen.getByTestId("col-chip-540")).toBeInTheDocument();
});

test("Reset to hourly then Save clears the saved layout", async () => {
  saved = [480, 540];
  await openDialog();
  fireEvent.click(screen.getByTestId("col-reset"));
  expect(screen.getByTestId("col-count")).toHaveTextContent("24 columns");
  await saveAndClose();
  expect(api.delete).toHaveBeenCalledWith("/order-task-columns/", expect.anything());
  expect(api.put).not.toHaveBeenCalled();
  expect(await screen.findByTestId("grid-col-0")).toBeInTheDocument();
});

test("Cancel changes nothing", async () => {
  await openDialog();
  fireEvent.click(screen.getByTestId("col-del-540"));
  fireEvent.click(screen.getByTestId("col-cancel"));
  await waitFor(() => expect(screen.queryByTestId("columns-dialog")).not.toBeInTheDocument());
  expect(api.put).not.toHaveBeenCalled();
  expect(screen.getByTestId("grid-col-540")).toBeInTheDocument();
});

test("a failed save shows the server's message and keeps the dialog open", async () => {
  api.put.mockRejectedValue({ response: { data: { detail: "Keep at least one time column." } } });
  await openDialog();
  setTime("col-one", "14:45");
  fireEvent.click(screen.getByTestId("col-add-one"));
  fireEvent.click(screen.getByTestId("col-save"));
  expect(await screen.findByTestId("columns-error")).toHaveTextContent("at least one");
  expect(screen.getByTestId("columns-dialog")).toBeInTheDocument();
});

test("a very long list warns that the grid will scroll", async () => {
  await openDialog();
  setTime("col-from", "00:00");
  setTime("col-to", "03:00");
  pickStep("minute");
  fireEvent.click(screen.getByTestId("col-add-range"));
  expect(screen.getByTestId("col-many")).toBeInTheDocument();
});

test("a task between columns sits in the column before it, and one earlier than all in the first", async () => {
  saved = [480, 720];
  list = [TASK({ id: 1, due_at: at(9) }), TASK({ id: 2, order: 6, title: "Early", due_at: at(6) }), TASK({ id: 3, order: 7, title: "Late", due_at: at(18) })];
  render(<TaskWorklist />);
  await screen.findByTestId("grid-cell-1");
  await waitFor(() => expect(screen.queryByTestId("grid-col-0")).not.toBeInTheDocument());
  expect(within(screen.getByTestId("grid-slot-5-480")).getByTestId("grid-cell-1")).toBeInTheDocument();
  expect(within(screen.getByTestId("grid-slot-6-480")).getByTestId("grid-cell-2")).toBeInTheDocument();
  expect(within(screen.getByTestId("grid-slot-7-720")).getByTestId("grid-cell-3")).toBeInTheDocument();
});
