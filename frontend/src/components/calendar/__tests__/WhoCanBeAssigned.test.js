import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import axios from "axios";
import WhoCanBeAssigned, { addDaysISO, statusText } from "../WhoCanBeAssigned";

jest.mock("axios");

const person = (o) => ({
  id: 1, name: "Ann Lee", role: "RN", role_key: "rn", nursing_role: "rn", week_hours: 24,
  weekly_cap: 36, overtime: false, state: "available", detail: null, fits_gap: false, ...o,
});

const payload = {
  date: "2026-10-26",
  counts: { available: 1, time_off: 1, no_schedule: 1, working: 0 },
  roles: [{ role: "RN", count: 2 }, { role: "MD", count: 1 }],
  gaps: [{ unit_id: 4, shift_type: "night", role: "rn", kind: "rn", count: 1 }],
  people: [
    person({ id: 1, fits_gap: true }),
    person({ id: 2, name: "Bo Chen", role: "RN", state: "time_off", detail: { kind: "off_request", pending: true } }),
    person({ id: 3, name: "Dr Kay", role: "MD", nursing_role: "other", state: "no_schedule" }),
  ],
};

beforeEach(() => axios.get.mockResolvedValue({ data: payload }));

test("shows role in parentheses and tab counts", async () => {
  render(<WhoCanBeAssigned token="t" units={[]} onAssign={jest.fn()} />);
  expect(await screen.findByText("(RN)")).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: /On time off \(1\)/ })).toBeInTheDocument();
  expect(screen.getByText("Fits a gap")).toBeInTheDocument();
});

test("Assign passes staff, date and the matching gap", async () => {
  const onAssign = jest.fn();
  render(<WhoCanBeAssigned token="t" units={[]} onAssign={onAssign} />);
  await userEvent.click(await screen.findByRole("button", { name: "Assign" }));
  expect(onAssign).toHaveBeenCalledWith(expect.objectContaining({ staff_id: 1, unit_id: 4, shift_type: "night" }));
});

test("time off tab offers Review request and role filter empties with Show all roles", async () => {
  render(<WhoCanBeAssigned token="t" units={[]} onAssign={jest.fn()} />);
  await userEvent.click(await screen.findByRole("tab", { name: /On time off/ }));
  expect(screen.getByRole("button", { name: "Review request" })).toBeInTheDocument();
  await userEvent.click(screen.getByText("MD 1"));
  expect(await screen.findByRole("button", { name: "Show all roles" })).toBeInTheDocument();
});

test("load failure shows retry", async () => {
  axios.get.mockRejectedValueOnce(new Error("x"));
  render(<WhoCanBeAssigned token="t" units={[]} onAssign={jest.fn()} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument());
});

test("helpers", () => {
  expect(addDaysISO("2026-10-31", 1)).toBe("2026-11-01");
  expect(statusText({ state: "available" })).toBe("Free");
});
