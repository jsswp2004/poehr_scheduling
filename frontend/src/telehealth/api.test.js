import { api } from "../api/client";
import { getValidToken } from "../utils/auth";
import { ApiError, patientApi, staffApi } from "./api";

const AUTH = { Authorization: "Bearer tok123" };

jest.mock("../api/client", () => ({ __esModule: true, api: { request: jest.fn() } }));
jest.mock("../utils/auth", () => ({ __esModule: true, getValidToken: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks();
  getValidToken.mockResolvedValue("tok123");
  global.fetch = jest.fn();
});

describe("staff calls", () => {
  it("go through the shared axios client with the telehealth path", async () => {
    api.request.mockResolvedValue({ data: { id: "s1" } });
    await expect(staffApi.createSession(7)).resolves.toEqual({ id: "s1" });
    expect(api.request).toHaveBeenCalledWith({ method: "POST", url: "/api/telehealth/sessions/", data: { appointment_id: 7 }, headers: AUTH });
  });

  it("builds the schedule query with an encoded date", async () => {
    api.request.mockResolvedValue({ data: { items: [] } });
    await staffApi.schedule("2026-10-13");
    expect(api.request).toHaveBeenCalledWith({ method: "GET", url: "/api/telehealth/schedule/?date=2026-10-13", data: undefined, headers: AUTH });
  });

  it("turns a server error into an ApiError carrying the server's code", async () => {
    api.request.mockRejectedValue({ response: { status: 400, data: { detail: "no_patient_waiting" } } });
    await expect(staffApi.admit("s1")).rejects.toMatchObject({ status: 400, code: "no_patient_waiting" });
    api.request.mockRejectedValue({ response: { status: 429, data: null } });
    await expect(staffApi.admit("s1")).rejects.toMatchObject({ status: 429, code: "rate_limited" });
  });

  it("reports an unreachable server as a network error", async () => {
    api.request.mockRejectedValue(new Error("Network Error"));
    await expect(staffApi.schedule()).rejects.toMatchObject({ status: 0, code: "network_error" });
  });
});

describe("patient calls", () => {
  it("never send credentials, and carry the token in the body, not the URL", async () => {
    global.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ rejoin_token: "r" }) });
    await patientApi.redeem("secret-token");
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toMatch(/\/api\/telehealth\/join\/redeem\/$/);
    expect(url).not.toContain("secret-token");
    expect(init.credentials).toBe("omit");
    expect(init.headers.Authorization).toBeUndefined();
    expect(JSON.parse(init.body)).toEqual({ token: "secret-token" });
    expect(api.request).not.toHaveBeenCalled();
  });

  it("surface a 410 as an ApiError without touching the staff client", async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 410, json: async () => ({ detail: "link_expired" }) });
    const err = await patientApi.redeem("x").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 410, code: "link_expired" });
  });

  it("report a dropped connection as a network error", async () => {
    global.fetch.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(patientApi.ping()).rejects.toMatchObject({ status: 0, code: "network_error" });
  });
});
