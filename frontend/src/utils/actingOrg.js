import { useSyncExternalStore } from "react";
import { jwtDecode } from "jwt-decode";
import { getAccessToken } from "./tokenManager";
import { installStaffingOrgInterceptor, setSelectedOrgId, clearSelectedOrg } from "./staffingOrg";

/**
 * The organization a system administrator is working in, chosen in the header.
 *
 * Only the pages that can act on another organization follow it (Staffing, Organization Management and
 * Settings); the rest keep showing the administrator's own organization and say so. The choice lives only
 * in this tab (sessionStorage), so every sign-in starts on the administrator's own organization, and the
 * server still ignores the request to act elsewhere for anyone who is not a system administrator.
 */
const STORE_KEY = "power.actingOrg";

// Pages that follow the choice. Anything else shows the signed-in user's own organization.
export const FOLLOWING_PATHS = ["/staffing", "/organization-access", "/environment"];
// Pages that show no organization data of their own (the menus), so they need no "still your own" warning.
export const NEUTRAL_PATHS = ["/solutions", "/admin"];
export const isNeutralPath = (pathname) => NEUTRAL_PATHS.includes(pathname);
export const followsActingOrg = (pathname) => FOLLOWING_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

const listeners = new Set();
let state = null; // { id, name, ownId, ownName } while working in another organization, else null

const read = () => {
  try {
    const raw = window.sessionStorage.getItem(STORE_KEY);
    const v = raw ? JSON.parse(raw) : null;
    return v && v.id ? v : null;
  } catch (err) {
    return null;
  }
};
const write = (value) => {
  try {
    if (value) window.sessionStorage.setItem(STORE_KEY, JSON.stringify(value));
    else window.sessionStorage.removeItem(STORE_KEY);
  } catch (err) {
    /* the choice is then kept in memory only */
  }
};

state = read();
if (state) {
  installStaffingOrgInterceptor();
  setSelectedOrgId(state.id);
}

const publish = (next) => {
  state = next;
  listeners.forEach((l) => l());
};

export const getActingOrg = () => state;

/** The signed-in person's own organization id (from the token), as a string. */
export const ownOrgIdFromToken = () => {
  try {
    return String(jwtDecode(getAccessToken()).organization_id || "");
  } catch (err) {
    return "";
  }
};

/**
 * Work in `org` ({id, name}); `own` ({id, name}) is the administrator's own organization. Choosing the
 * own organization (or nothing) goes back to normal.
 */
export function setActingOrg(org, own) {
  if (!org || !org.id || (own && String(org.id) === String(own.id))) {
    clearActingOrg();
    return;
  }
  const next = { id: String(org.id), name: org.name || "", ownId: own ? String(own.id) : "", ownName: own?.name || "" };
  write(next);
  installStaffingOrgInterceptor();
  setSelectedOrgId(next.id);
  publish(next);
}

export function clearActingOrg() {
  write(null);
  clearSelectedOrg();
  publish(null);
}

export function useActingOrg() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state
  );
}
