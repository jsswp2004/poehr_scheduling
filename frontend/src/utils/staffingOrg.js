import axios from "axios";

/**
 * Organization switcher support for the Staffing Center.
 *
 * Only a system admin can act on another organization. The Staffing page
 * stores the chosen organization here, and one axios request interceptor adds
 * ?organization=<id> to every /api/staffing/ call. The server ignores the
 * parameter for anyone who is not a system admin, so this can never widen an
 * ordinary admin's access.
 */

const STORAGE_KEY = "staffing.selectedOrgId";

let selectedOrgId = null;
let installed = false;

const readStored = () => {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch (err) {
    return null;
  }
};

const writeStored = (value) => {
  try {
    if (value) {
      window.localStorage.setItem(STORAGE_KEY, value);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch (err) {
    // Storage can be unavailable; the in-memory value still works.
  }
};

export const getStoredOrgId = () => readStored();

export const getSelectedOrgId = () => selectedOrgId;

export const setSelectedOrgId = (id) => {
  selectedOrgId = id ? String(id) : null;
  writeStored(selectedOrgId);
};

export const clearSelectedOrg = () => {
  selectedOrgId = null;
  writeStored(null);
};

export const installStaffingOrgInterceptor = () => {
  if (installed) return;
  installed = true;
  axios.interceptors.request.use((config) => {
    if (!selectedOrgId || typeof config.url !== "string" || !config.url.includes("/api/staffing/")) {
      return config;
    }
    if (/[?&]organization=/.test(config.url)) return config;

    if (config.params instanceof URLSearchParams) {
      if (!config.params.has("organization")) config.params.append("organization", selectedOrgId);
    } else if (!config.params || config.params.organization === undefined) {
      config.params = { ...(config.params || {}), organization: selectedOrgId };
    }
    return config;
  });
};
