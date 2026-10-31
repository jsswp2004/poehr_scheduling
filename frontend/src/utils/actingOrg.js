import { useSyncExternalStore } from "react";
import axios from "axios";
import { jwtDecode } from "jwt-decode";
import { API_BASE_URL, getAuthHeaders } from "../config/api";
import { getAccessToken } from "./tokenManager";
import { installStaffingOrgInterceptor, setSelectedOrgId, clearSelectedOrg } from "./staffingOrg";

/**
 * The organization a system administrator is working in.
 *
 * The SERVER keeps the choice (for that person only) and limits everything they see and change to that
 * organization, so every page follows it. This module only mirrors it for the screen: whether a choice has
 * been made yet ("none" means the sign-in window must ask), and which one it is. Every sign-in starts with
 * no choice. Nobody but a system administrator can set it.
 */
const listeners = new Set();
// status: "unknown" (not asked the server yet), "none" (nothing chosen: ask), "chosen"
let state = { status: "unknown", org: null }; // org: { id, name, ownId, ownName }

const publish = (next) => {
  state = next;
  listeners.forEach((l) => l());
};

const apply = (data) => {
  const o = data && data.organization;
  if (!o) {
    clearSelectedOrg();
    publish({ status: "none", org: null });
    return;
  }
  const org = { id: String(o.id), name: o.name || "", ownId: data.own ? String(data.own.id) : "", ownName: data.own?.name || "" };
  installStaffingOrgInterceptor();
  setSelectedOrgId(org.id);
  publish({ status: "chosen", org });
};

export const getActingOrg = () => state.org;
export const getActingStatus = () => state.status;

/** The signed-in person's own organization id (from the token), as a string. */
export const ownOrgIdFromToken = () => {
  try {
    return String(jwtDecode(getAccessToken()).organization_id || "");
  } catch (err) {
    return "";
  }
};

/** Ask the server which organization is chosen (system administrators). Leaves the state alone on a network error. */
export async function loadActingOrg() {
  try {
    const res = await axios.get(`${API_BASE_URL}/api/users/acting-organization/`, { headers: getAuthHeaders(getAccessToken()) });
    apply(res.data);
  } catch (err) {
    if (err?.response?.status === 403) publish({ status: "unknown", org: null });
  }
}

/** Work in `org` ({id, name}). Resolves once the server has saved it; throws if it could not. */
export async function chooseActingOrg(org, source = "header") {
  const res = await axios.put(
    `${API_BASE_URL}/api/users/acting-organization/`,
    { organization: org.id, source },
    { headers: getAuthHeaders(getAccessToken()) }
  );
  apply(res.data);
}

/** Forget the choice on this screen (sign-in and sign-out); the server clears its own copy at sign-in. */
export function clearActingOrg() {
  clearSelectedOrg();
  publish({ status: "unknown", org: null });
}

const subscribe = (cb) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

/** The organization being worked in, or null until one is chosen. */
export function useActingOrg() {
  return useSyncExternalStore(subscribe, () => state).org;
}

/** "unknown" | "none" | "chosen" */
export function useActingStatus() {
  return useSyncExternalStore(subscribe, () => state).status;
}
