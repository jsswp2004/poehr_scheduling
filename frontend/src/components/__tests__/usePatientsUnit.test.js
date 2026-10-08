import { renderHook, act, waitFor } from "@testing-library/react";

jest.mock("axios", () => ({ get: jest.fn(), post: jest.fn(), delete: jest.fn() }));
jest.mock("../../utils/auth", () => ({ getValidToken: async () => "t", clearAuthData: jest.fn() }), { virtual: true });
jest.mock("../../utils/tokenManager", () => ({ getAccessToken: () => "t" }), { virtual: true });
jest.mock("../../utils/phoneUtils", () => ({ formatPhoneToInternational: (p) => p }), { virtual: true });
jest.mock("../../config/api", () => ({ API_BASE_URL: "http://x" }), { virtual: true });
jest.mock("jwt-decode", () => ({ jwtDecode: () => ({}) }), { virtual: true });
jest.mock("react-toastify", () => ({ toast: { error: jest.fn(), success: jest.fn() } }), { virtual: true });
jest.mock("../patients/CareSettingSidebar", () => ({ storedCareSetting: () => "acute", rememberCareSetting: jest.fn() }), { virtual: true });

import axios from "axios";
import { usePatients } from "../../hooks/usePatients";

const lastParams = () => axios.get.mock.calls[axios.get.mock.calls.length - 1][1].params;

beforeEach(() => {
  axios.get.mockReset();
  axios.get.mockResolvedValue({ data: { results: [], count: 0 } });
});

test("the unit filter is sent on the Acute Care list and goes back to page 1", async () => {
  const { result } = renderHook(() => usePatients(jest.fn(), "nurse"));
  await waitFor(() => expect(axios.get).toHaveBeenCalled());
  expect(lastParams().unit).toBeUndefined();
  act(() => result.current.setPage(3));
  act(() => result.current.setUnit("7"));
  await waitFor(() => expect(lastParams().unit).toBe("7"));
  expect(result.current.page).toBe(1);
  expect(lastParams().care_setting).toBe("acute");
});

test("changing the list clears the unit filter", async () => {
  const { result } = renderHook(() => usePatients(jest.fn(), "nurse"));
  await waitFor(() => expect(axios.get).toHaveBeenCalled());
  act(() => result.current.setUnit("7"));
  await waitFor(() => expect(lastParams().unit).toBe("7"));
  act(() => result.current.setCareSetting("ambulatory"));
  await waitFor(() => expect(lastParams().care_setting).toBe("ambulatory"));
  expect(result.current.unit).toBe("");
  expect(lastParams().unit).toBeUndefined();
});
