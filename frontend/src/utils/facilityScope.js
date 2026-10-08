import { useSyncExternalStore } from "react";
import axios from "axios";
import { api } from "../api/client";

/**
 * Which facility the Settings pages are acting for (system administrators only).
 *
 *   choice ""     nothing picked yet; Settings shows only the picker
 *   choice "7"    facility 7: every request sends `X-Facility-Id: 7`
 *   choice "all"  every facility: reads come from the first facility, and a save is repeated
 *                 for each facility (see applyToFacilities)
 *
 * The server only honors the header for a system administrator, so other roles are unaffected.
 */
export const FACILITY_HEADER = "X-Facility-Id";
export const ALL = "all";
const STORE_KEY = "power.settings.facility";

const EMPTY = { enabled: false, facilities: [], choice: "", activeId: null };
let state = EMPTY;
const listeners = new Set();

const readStored = () => {
  try {
    return window.sessionStorage.getItem(STORE_KEY) || "";
  } catch (err) {
    return "";
  }
};
const writeStored = (value) => {
  try {
    if (value) window.sessionStorage.setItem(STORE_KEY, value);
    else window.sessionStorage.removeItem(STORE_KEY);
  } catch (err) {
    /* the choice just is not remembered */
  }
};

const derive = (facilities, choice) => {
  const valid = choice === ALL ? facilities.length > 0 : facilities.some((f) => String(f.id) === String(choice));
  const picked = valid ? String(choice) : "";
  let activeId = null;
  if (picked === ALL) activeId = facilities[0].id;
  else if (picked) activeId = Number(picked);
  return { choice: picked, activeId };
};

const publish = (next) => {
  state = next;
  listeners.forEach((l) => l());
};

/** Turn the picker on (system administrators) with the list of facilities; restores the earlier choice. */
export function configureFacilityScope(facilities) {
  const list = Array.isArray(facilities) ? facilities : [];
  publish({ enabled: true, facilities: list, ...derive(list, readStored()) });
}

export function chooseFacility(choice) {
  const next = derive(state.facilities, choice);
  writeStored(next.choice);
  publish({ ...state, ...next });
}

/** Leave Settings: stop sending the header, and forget the facilities. */
export function resetFacilityScope() {
  publish(EMPTY);
}

export const getFacilityScope = () => state;
export const isAllFacilities = () => state.enabled && state.choice === ALL;

export function useFacilityScope() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state
  );
}

export const attach = (config) => {
  if (state.enabled && state.activeId) {
    config.headers = config.headers || {};
    if (typeof config.headers.set === "function") config.headers.set(FACILITY_HEADER, String(state.activeId));
    else config.headers[FACILITY_HEADER] = String(state.activeId);
  }
  return config;
};
axios.interceptors?.request?.use?.(attach);
api?.interceptors?.request?.use?.(attach);

/**
 * Run a save. For one facility it just runs `fn`. For "All facilities" it runs `fn` once for each
 * facility in turn (each request then carries that facility's header), keeps going if one fails,
 * and reports which ones did not take. Resolves with the first facility's result.
 */
export async function applyToFacilities(fn) {
  if (!isAllFacilities()) return fn();
  const { facilities } = state;
  const failed = [];
  let firstResult;
  let haveResult = false;
  try {
    for (const facility of facilities) {
      state = { ...state, activeId: facility.id };
      try {
        const result = await fn(facility);
        if (!haveResult) {
          firstResult = result;
          haveResult = true;
        }
      } catch (err) {
        failed.push({ facility, err });
      }
    }
  } finally {
    state = { ...state, activeId: facilities[0].id };
  }
  if (failed.length) {
    const names = failed.map((f) => f.facility.name).join(", ");
    const why = failed[0].err?.response?.data?.detail || failed[0].err?.message || "";
    const error = new Error(
      `Saved for ${facilities.length - failed.length} of ${facilities.length} facilities. Not saved for: ${names}.${why ? ` (${why})` : ""}`
    );
    error.partial = true;
    error.response = { data: { detail: error.message } }; // so errorText() shows it
    throw error;
  }
  return firstResult;
}
