import { render, screen, waitFor, fireEvent } from "@testing-library/react";

jest.mock("../../api/client", () => ({ api: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), put: jest.fn(), delete: jest.fn() } }), { virtual: true });
jest.mock("../../config/api", () => ({ apiEndpoints: { orderTaskSettings: "/order-task-settings/" } }), { virtual: true });
jest.mock("../../utils/auth", () => ({ getValidToken: async () => ({ access_token: "t" }) }), { virtual: true });
jest.mock("../SimpleToast", () => ({ toast: { error: jest.fn(), success: jest.fn() } }), { virtual: true });

import { api } from "../../api/client";
import { toast } from "../SimpleToast";
import TaskSettings from "../tasks/TaskSettings";

const CFG = (canEdit) => ({
  organization: 1,
  grace_minutes: 60,
  missed_after_hours: 12,
  look_ahead_hours: 24,
  pass_times: { daily: ["09:00"], qam: ["06:00"], qhs: ["21:00"], bid: ["09:00", "21:00"], tid: ["09:00", "14:00", "21:00"], qid: ["09:00", "13:00", "17:00", "21:00"] },
  can_edit: canEdit,
});

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  Object.values(toast).forEach((fn) => fn.mockReset());
  api.put.mockResolvedValue({ data: {} });
});

test("an administrator sees the current rules and pass times", async () => {
  api.get.mockResolvedValue({ data: CFG(true) });
  render(<TaskSettings />);
  await waitFor(() => expect(screen.getByTestId("task-grace")).toHaveValue(60));
  expect(screen.getByTestId("task-missed")).toHaveValue(12);
  expect(screen.getByTestId("pass-bid")).toHaveValue("09:00, 21:00");
  expect(screen.getByTestId("task-settings-save")).toBeInTheDocument();
});

test("saving sends the rules and the pass times as lists", async () => {
  api.get.mockResolvedValue({ data: CFG(true) });
  render(<TaskSettings />);
  await waitFor(() => expect(screen.getByTestId("task-grace")).toHaveValue(60));
  fireEvent.change(screen.getByTestId("task-grace"), { target: { value: "30" } });
  fireEvent.change(screen.getByTestId("pass-bid"), { target: { value: "08:00, 20:00" } });
  fireEvent.click(screen.getByTestId("task-settings-save"));
  await waitFor(() => expect(api.put).toHaveBeenCalled());
  const [url, body] = api.put.mock.calls[0];
  expect(url).toBe("/order-task-settings/");
  expect(body).toMatchObject({ grace_minutes: 30, missed_after_hours: 12, look_ahead_hours: 24 });
  expect(body.pass_times.bid).toEqual(["08:00", "20:00"]);
  expect(body.pass_times.tid).toEqual(["09:00", "14:00", "21:00"]);
  await waitFor(() => expect(toast.success).toHaveBeenCalled());
});

test("bad numbers and bad times are caught before anything is sent", async () => {
  api.get.mockResolvedValue({ data: CFG(true) });
  render(<TaskSettings />);
  await waitFor(() => expect(screen.getByTestId("task-grace")).toHaveValue(60));
  fireEvent.change(screen.getByTestId("task-ahead"), { target: { value: "5" } });
  fireEvent.click(screen.getByTestId("task-settings-save"));
  expect(await screen.findByTestId("task-settings-error")).toHaveTextContent("look-ahead hours must be a whole number from 12 to 72");
  fireEvent.change(screen.getByTestId("task-ahead"), { target: { value: "24" } });
  fireEvent.change(screen.getByTestId("pass-tid"), { target: { value: "9am" } });
  fireEvent.click(screen.getByTestId("task-settings-save"));
  expect(await screen.findByTestId("task-settings-error")).toHaveTextContent("Three times a day (TID)");
  expect(api.put).not.toHaveBeenCalled();
});

test("someone who cannot edit sees the values read-only", async () => {
  api.get.mockResolvedValue({ data: CFG(false) });
  render(<TaskSettings />);
  await waitFor(() => expect(screen.getByTestId("task-grace")).toBeDisabled());
  expect(screen.queryByTestId("task-settings-save")).not.toBeInTheDocument();
});
