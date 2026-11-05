// Calls behind the specialist's secure referral page. No login: the link's key opens the page, a code sent to the
// specialist's other contact proves it is them, and the short-lived session that follows goes in the
// Authorization header. Plain fetch, so a failed call can never bounce a specialist to the staff login page.
import { API_BASE_URL } from "../../config/api";

const BASE = `${API_BASE_URL}/api/referral-link`;

export class LinkApiError extends Error {
  constructor(status, detail) {
    super(detail);
    this.status = status;
    this.detail = detail;
  }
}

async function call(path, { method = "POST", json, form, session } = {}) {
  const headers = {};
  if (session) headers.Authorization = `Referral ${session}`;
  if (json !== undefined) headers["Content-Type"] = "application/json";
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      credentials: "omit",
      headers,
      body: form !== undefined ? form : json === undefined ? undefined : JSON.stringify(json),
    });
  } catch {
    throw new LinkApiError(0, "network_error");
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const detail = (data && typeof data.detail === "string" && data.detail) || (res.status === 429 ? "rate_limited" : "request_failed");
    throw new LinkApiError(res.status, detail);
  }
  return data;
}

export const linkApi = {
  open: (token) => call("/open/", { json: { token } }),
  resendCode: (token) => call("/code/", { json: { token } }),
  verify: (token, code) => call("/verify/", { json: { token, code } }),
  packet: (session) => call("/packet/", { method: "GET", session }),
  reply: (session, form) => call("/reply/", { form, session }),
};

/** What to tell the specialist when a call fails. The server's own words when it gave any worth showing. */
export function linkErrorText(err, fallback = "Something went wrong. Please try again.") {
  if (!(err instanceof LinkApiError)) return fallback;
  if (err.detail === "network_error") return "Could not reach the server. Check your connection and try again.";
  if (err.detail === "rate_limited") return "Too many tries in a short time. Please wait a minute and try again.";
  if (err.detail === "request_failed" || err.detail === "link_unavailable") return fallback;
  return err.detail;
}
