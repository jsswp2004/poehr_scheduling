import { act, renderHook, waitFor } from "@testing-library/react";
import axios from "axios";
import { useCalendarPatients } from "./useCalendarPatients";

jest.mock("axios", () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock("../../config/api", () => ({ API_BASE_URL: "http://api.test" }));
jest.mock("../../utils/auth", () => ({ getValidToken: jest.fn() }));

const { getValidToken } = require("../../utils/auth");

beforeEach(() => {
  getValidToken.mockResolvedValue("tok");
  axios.get.mockResolvedValue({ data: { results: [{ first_name: "Taylor", last_name: "Whitfield", user_id: 9 }] } });
});

test("loads every patient: the request carries no care setting filter", async () => {
  const { result } = renderHook(() => useCalendarPatients("receptionist"));
  await waitFor(() => expect(result.current.patients).toHaveLength(1));
  const [url, config] = axios.get.mock.calls[0];
  expect(url).toBe("http://api.test/api/users/patients/");
  expect(config.params).toEqual({ search: "", page_size: 50 });
  expect(config.params).not.toHaveProperty("care_setting");
  expect(result.current.patients[0].full_name).toBe("Taylor Whitfield");
});

test("searches on the server as you type", async () => {
  const { result } = renderHook(() => useCalendarPatients("admin"));
  await waitFor(() => expect(axios.get).toHaveBeenCalledTimes(1));
  act(() => result.current.searchPatients("  taylor "));
  await waitFor(() => expect(axios.get).toHaveBeenCalledTimes(2));
  expect(axios.get.mock.calls[1][1].params.search).toBe("taylor");
});

test("patients never load the patient list", async () => {
  renderHook(() => useCalendarPatients("patient"));
  await new Promise((r) => setTimeout(r, 50));
  expect(axios.get).not.toHaveBeenCalled();
});
