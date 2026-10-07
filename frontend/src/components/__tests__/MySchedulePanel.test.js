import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

jest.mock("../../api/client", () => ({ api: { get: jest.fn() } }), { virtual: true });
jest.mock("../../config/api", () => ({ apiEndpoints: { mySchedule: "/my-schedule/" } }), { virtual: true });
jest.mock("../../utils/auth", () => ({ getValidToken: async () => ({ access_token: "t" }) }), { virtual: true });
jest.mock("../patients/SearchField", () => ({ onSearchChange, initialValue }) => (
  <input aria-label="Search the schedule..." defaultValue={initialValue} onChange={(e) => onSearchChange(e.target.value)} />
), { virtual: true });
jest.mock("@fortawesome/react-fontawesome", () => ({ FontAwesomeIcon: () => null }), { virtual: true });
jest.mock("@fortawesome/free-solid-svg-icons", () => ({ faEnvelope: {}, faSms: {} }), { virtual: true });

import { api } from "../../api/client";
import MySchedulePanel, { statusChip, dayWindow, localDateString } from "../patients/MySchedulePanel";

const row = (id, name, over = {}, patientOver = {}) => ({
  appointment: {
    id, start: "2026-10-07T13:30:00Z", end: "2026-10-07T14:00:00Z", duration_minutes: 30, title: "Annual physical",
    status: "scheduled", arrived: false, no_show: false, unit_name: "Main clinic", provider_id: 7, provider_name: "Amara Chen", ...over,
  },
  patient: { id: id + 100, user_id: id + 200, full_name: name, mrn: `M${id}`, ...patientOver },
});
const reply = (...rows) => ({ data: { count: rows.length, truncated: false, results: rows } });

const show = (props = {}) =>
  render(
    <MemoryRouter>
      <MySchedulePanel userRole="doctor" providers={[{ id: 7, first_name: "Amara", last_name: "Chen" }, { id: 8, first_name: "Jeffrey", last_name: "Lee" }]} {...props} />
    </MemoryRouter>
  );

beforeEach(() => {
  api.get.mockReset();
  api.get.mockResolvedValue(reply(row(1, "Sofia Marchetti"), row(2, "Ben Ortiz", { status: "completed" })));
});

const lastParams = () => api.get.mock.calls[api.get.mock.calls.length - 1][1].params;

test("lists the day's patients with time, reason, location and status", async () => {
  show();
  await screen.findByTestId("schedule-row-1");
  const first = screen.getByTestId("schedule-row-1");
  expect(first).toHaveTextContent("Sofia Marchetti");
  expect(first).toHaveTextContent("MRN M1");
  expect(first).toHaveTextContent("Annual physical");
  expect(first).toHaveTextContent("Main clinic");
  expect(screen.getByTestId("schedule-status-1")).toHaveTextContent("Scheduled");
  expect(screen.getByTestId("schedule-status-2")).toHaveTextContent("Completed");
  expect(screen.getByTestId("schedule-summary")).toHaveTextContent("2 appointments");
});

test("asks for today in the browser's own day", async () => {
  show();
  await screen.findByTestId("schedule-row-1");
  const params = lastParams();
  expect(params).toEqual(dayWindow(localDateString()));
  expect(new Date(params.end) - new Date(params.start)).toBeGreaterThanOrEqual(23 * 3600 * 1000);
  expect(screen.getByRole("button", { name: "Today" })).toBeDisabled();
});

test("a doctor has no provider picker and no provider column; the server limits it to them", async () => {
  show({ userRole: "doctor" });
  await screen.findByTestId("schedule-row-1");
  expect(screen.queryByTestId("schedule-provider")).toBeNull();
  expect(screen.queryByRole("columnheader", { name: "Provider" })).toBeNull();
  expect(lastParams().provider).toBeUndefined();
});

test("an administrator sees every provider and can narrow to one", async () => {
  show({ userRole: "admin" });
  await screen.findByTestId("schedule-row-1");
  expect(screen.getByRole("columnheader", { name: "Provider" })).toBeInTheDocument();
  expect(screen.getByTestId("schedule-row-1")).toHaveTextContent("Dr. Amara Chen");
  expect(lastParams().provider).toBeUndefined();
  fireEvent.mouseDown(screen.getAllByRole("combobox")[0]);
  fireEvent.click(await screen.findByRole("option", { name: "Dr. Jeffrey Lee" }));
  await waitFor(() => expect(lastParams().provider).toBe("8"));
});

test("previous and next day move the window, and Today comes back", async () => {
  show();
  await screen.findByTestId("schedule-row-1");
  fireEvent.click(screen.getByRole("button", { name: "Next day" }));
  await waitFor(() => expect(lastParams()).toEqual(dayWindow(shiftedToday(1))));
  expect(screen.getByRole("button", { name: "Today" })).not.toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Previous day" }));
  fireEvent.click(screen.getByRole("button", { name: "Previous day" }));
  await waitFor(() => expect(lastParams()).toEqual(dayWindow(shiftedToday(-1))));
  fireEvent.click(screen.getByRole("button", { name: "Today" }));
  await waitFor(() => expect(lastParams()).toEqual(dayWindow(localDateString())));
});

function shiftedToday(delta) {
  const d = new Date();
  d.setDate(d.getDate() + delta);
  return localDateString(d);
}

test("picking a date asks for that day", async () => {
  show();
  await screen.findByTestId("schedule-row-1");
  fireEvent.change(screen.getByTestId("schedule-date"), { target: { value: "2026-12-25" } });
  await waitFor(() => expect(lastParams()).toEqual(dayWindow("2026-12-25")));
});

test("typing in search narrows the request", async () => {
  show();
  await screen.findByTestId("schedule-row-1");
  fireEvent.change(screen.getByLabelText("Search the schedule..."), { target: { value: " sofia " } });
  await waitFor(() => expect(lastParams().search).toBe("sofia"));
});

test("clicking a row selects the patient so the header follows", async () => {
  const onSelect = jest.fn();
  show({ onSelect });
  fireEvent.click(await screen.findByTestId("schedule-row-1"));
  expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ user_id: 201, full_name: "Sofia Marchetti" }));
});

test("the chart shortcuts open that tab for the patient without also selecting the row twice", async () => {
  const onSelect = jest.fn();
  const onOpenChart = jest.fn();
  show({ onSelect, onOpenChart });
  await screen.findByTestId("schedule-row-1");
  const rowEl = screen.getByTestId("schedule-row-1");
  fireEvent.click(within(rowEl).getByRole("button", { name: "Orders for Sofia Marchetti" }));
  fireEvent.click(within(rowEl).getByRole("button", { name: "Clinical notes for Sofia Marchetti" }));
  fireEvent.click(within(rowEl).getByRole("button", { name: "Flowsheet for Sofia Marchetti" }));
  fireEvent.click(within(rowEl).getByRole("button", { name: "Lab results for Sofia Marchetti" }));
  expect(onOpenChart.mock.calls.map((c) => c[1])).toEqual(["orders", "documents", "flowsheets", "results"]);
  expect(onOpenChart.mock.calls[0][0].user_id).toBe(201);
  expect(onSelect).not.toHaveBeenCalled();
});

test("roles that cannot chart clinically do not get the clinical shortcuts", async () => {
  show({ userRole: "registrar" });
  await screen.findByTestId("schedule-row-1");
  expect(screen.queryByRole("button", { name: /Orders for/ })).toBeNull();
  expect(screen.getByRole("button", { name: "View details for Sofia Marchetti" })).toBeInTheDocument();
});

test("email and text shortcuts call the page's handlers", async () => {
  const onSendText = jest.fn();
  const onOpenEmailModal = jest.fn();
  show({ onSendText, onOpenEmailModal });
  await screen.findByTestId("schedule-row-1");
  fireEvent.click(screen.getByRole("button", { name: "Email Sofia Marchetti" }));
  fireEvent.click(screen.getByRole("button", { name: "Text Sofia Marchetti" }));
  expect(onOpenEmailModal).toHaveBeenCalledWith(expect.objectContaining({ user_id: 201 }));
  expect(onSendText).toHaveBeenCalledWith(expect.objectContaining({ user_id: 201 }));
});

test("the selected patient's row is highlighted", async () => {
  show({ selectedId: 201 });
  await screen.findByTestId("schedule-row-1");
  expect(screen.getByTestId("schedule-row-1")).toHaveAttribute("aria-selected", "true");
  expect(screen.getByTestId("schedule-row-2")).toHaveAttribute("aria-selected", "false");
});

test("an empty day says so, in words that fit the role", async () => {
  api.get.mockResolvedValue(reply());
  show({ userRole: "doctor" });
  expect(await screen.findByTestId("schedule-empty")).toHaveTextContent("You have no appointments on this day.");
});

test("an empty day for an administrator", async () => {
  api.get.mockResolvedValue(reply());
  show({ userRole: "admin" });
  expect(await screen.findByTestId("schedule-empty")).toHaveTextContent("No appointments on this day.");
});

test("a failure shows the server's message instead of a blank table", async () => {
  api.get.mockRejectedValue({ response: { data: { detail: "Not allowed." } } });
  show();
  expect(await screen.findByText("Not allowed.")).toBeInTheDocument();
});

test("refresh asks again", async () => {
  show();
  await screen.findByTestId("schedule-row-1");
  const before = api.get.mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "Refresh schedule" }));
  await waitFor(() => expect(api.get.mock.calls.length).toBe(before + 1));
});

test("a long day shows a note that the list was cut", async () => {
  api.get.mockResolvedValue({ data: { count: 1, truncated: true, results: [row(1, "Sofia Marchetti")] } });
  show({ userRole: "admin" });
  expect(await screen.findByText(/Showing the first appointments only/)).toBeInTheDocument();
});

describe("statusChip", () => {
  test("outcome beats arrival, arrival beats the plain status", () => {
    expect(statusChip({ status: "scheduled", arrived: false })).toEqual({ label: "Scheduled", color: "default" });
    expect(statusChip({ status: "scheduled", arrived: true })).toEqual({ label: "Checked in", color: "success" });
    expect(statusChip({ status: "completed", arrived: true })).toEqual({ label: "Completed", color: "default" });
    expect(statusChip({ status: "scheduled", no_show: true })).toEqual({ label: "No show", color: "error" });
    expect(statusChip({ status: "in_progress", arrived: false })).toEqual({ label: "In progress", color: "info" });
    expect(statusChip({ status: "pending" })).toEqual({ label: "Pending", color: "default" });
  });
});
