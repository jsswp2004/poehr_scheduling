import { renderHook, waitFor, act } from "@testing-library/react";

jest.mock("../../api/client", () => ({ api: { get: jest.fn() } }), { virtual: true });
jest.mock("../../config/api", () => ({ apiEndpoints: { chartTabs: "/chart-tabs/" } }), { virtual: true });
jest.mock("../../utils/auth", () => ({ getValidToken: async () => ({ access_token: "t" }) }), { virtual: true });

import { api } from "../../api/client";
import useChartTabs from "../../hooks/useChartTabs";

const EVERY = ["patient_list", "orders", "prescriptions", "results", "patient_info", "documents", "flowsheets", "my_schedule", "referral_list", "task_list", "clinical_summary"];
const reply = {
  data: {
    settings: {
      ambulatory: { tabs: EVERY, default_tab: "patient_list" },
      emergency: { tabs: ["patient_list", "orders", "documents"], default_tab: "orders" },
    },
  },
};

beforeEach(() => api.get.mockReset());

test("gives each module its own tabs and opening tab from one request", async () => {
  api.get.mockResolvedValue(reply);
  const { result, rerender } = renderHook(({ care }) => useChartTabs(care), { initialProps: { care: "emergency" } });
  await waitFor(() => expect(result.current.loaded).toBe(true));
  expect(result.current.tabs).toEqual(["patient_list", "orders", "documents"]);
  expect(result.current.defaultTab).toBe("orders");
  rerender({ care: "ambulatory" });
  expect(result.current.tabs).toEqual(EVERY);
  expect(result.current.defaultTab).toBe("patient_list");
  expect(api.get).toHaveBeenCalledTimes(1);
});

test("shows every tab until the answer arrives, and if it fails", async () => {
  api.get.mockRejectedValue(new Error("down"));
  const { result } = renderHook(() => useChartTabs("emergency"));
  expect(result.current.loaded).toBe(false);
  expect(result.current.tabs).toEqual(EVERY);
  await waitFor(() => expect(result.current.loaded).toBe(true));
  expect(result.current.tabs).toEqual(EVERY);
  expect(result.current.defaultTab).toBe("patient_list");
});

test("does not ask the server until enabled, and reload asks again", async () => {
  api.get.mockResolvedValue(reply);
  const { result, rerender } = renderHook(({ on }) => useChartTabs("emergency", on), { initialProps: { on: false } });
  expect(api.get).not.toHaveBeenCalled();
  rerender({ on: true });
  await waitFor(() => expect(result.current.loaded).toBe(true));
  expect(api.get).toHaveBeenCalledTimes(1);
  act(() => result.current.reload());
  await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
});
