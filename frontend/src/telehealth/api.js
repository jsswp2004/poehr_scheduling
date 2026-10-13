// Client for the Django telehealth endpoints.
// Staff calls go through the app's shared axios instance, so they carry the same JWT, refresh
// handling and facility header as every other page. Patient calls need no login and use plain
// fetch: tokens travel in POST bodies, never in URLs, and a 401 must never bounce a patient to
// the staff login page.
import { api } from "../api/client";
import { API_BASE_URL } from "../config/api";

const PATH = "/api/telehealth";

export class ApiError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function codeFrom(data, status) {
  if (Array.isArray(data) && typeof data[0] === "string") return data[0];
  if (data && typeof data.detail === "string") return data.detail;
  if (data && typeof data.error === "string") return data.error;
  return status === 429 ? "rate_limited" : "request_failed";
}

async function staffRequest(method, path, body) {
  try {
    const res = await api.request({ method, url: `${PATH}${path}`, data: body });
    return res.data;
  } catch (err) {
    if (err?.response) throw new ApiError(err.response.status, codeFrom(err.response.data, err.response.status));
    throw new ApiError(0, "network_error");
  }
}

async function patientRequest(method, path, body) {
  let res;
  try {
    res = await fetch(`${API_BASE_URL}${PATH}${path}`, {
      method,
      credentials: "omit",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "network_error");
  }
  let data = null;
  if (res.status !== 204) {
    try {
      data = await res.json();
    } catch {
      data = null;
    }
  }
  if (!res.ok) throw new ApiError(res.status, codeFrom(data, res.status));
  return data;
}

export const assistantApi = {
  chat: (messages) => staffRequest("POST", "/assistant/chat/", { messages }),
};

export const staffApi = {
  schedule: (date) => staffRequest("GET", `/schedule/${date ? `?date=${encodeURIComponent(date)}` : ""}`),
  createSession: (appointmentId) => staffRequest("POST", "/sessions/", { appointment_id: appointmentId }),
  sendJoinLink: (sessionId, deliver = true) => staffRequest("POST", `/sessions/${sessionId}/join-link/`, { deliver }),
  admit: (sessionId) => staffRequest("POST", `/sessions/${sessionId}/admit/`, {}),
  providerToken: (sessionId) => staffRequest("POST", `/sessions/${sessionId}/provider-token/`, {}),
  presence: (sessionId, event) => staffRequest("POST", `/sessions/${sessionId}/presence/`, { event }),
  end: (sessionId) => staffRequest("POST", `/sessions/${sessionId}/end/`, {}),
  visitRecord: (sessionId) => staffRequest("GET", `/sessions/${sessionId}/visit-record/`),
  saveVisitRecord: (sessionId, fields) => staffRequest("POST", `/sessions/${sessionId}/visit-record/`, fields),
};

export const patientApi = {
  ping: () => patientRequest("GET", "/ping/"),
  redeem: (token) => patientRequest("POST", "/join/redeem/", { token }),
  consent: (rejoin) => patientRequest("POST", "/join/consent/", { rejoin_token: rejoin }),
  status: (rejoin) => patientRequest("POST", "/join/status/", { rejoin_token: rejoin }),
  media: (rejoin) => patientRequest("POST", "/join/media/", { rejoin_token: rejoin }),
  presence: (rejoin, event) => patientRequest("POST", "/join/presence/", { rejoin_token: rejoin, event }),
};
