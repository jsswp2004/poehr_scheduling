import { useEffect, useState } from "react";
import axios from "axios";
import { getValidToken } from "../../utils/auth";
import { apiEndpoints } from "../../config/api";

/** Where each step's values live while the form is open. */
export const WINDOW_SOURCE = {
  identity: "patient",
  emergency: "patient",
  financial: "patient",
  reason: "visit",
  logistics: "visit",
};

/** What the form uses until the clinic's own settings arrive, and if they cannot be loaded. */
export const NO_SETUP = { fields: {}, dictionaries: {} };

/** Server payloads to { fields: {window: {key: {label, mode, locked}}}, dictionaries: {code: entries[]} }. */
export const setupFromServer = (fieldsPayload, dictPayload) => {
  const fields = {};
  ((fieldsPayload && fieldsPayload.windows) || []).forEach((w) => {
    fields[w.key] = {};
    (w.fields || []).forEach((f) => {
      fields[w.key][f.key] = { label: f.label, mode: f.mode || "opt", locked: !!f.locked };
    });
  });
  const dictionaries = {};
  ((dictPayload && dictPayload.dictionaries) || []).forEach((d) => {
    dictionaries[d.code] = d.entries || [];
  });
  return { fields, dictionaries };
};

/** How one field should look: its label, and whether it is hidden, required or view-only. */
export const fieldFor = (setup, win, key, defaultLabel) => {
  const f = (setup && setup.fields && setup.fields[win] && setup.fields[win][key]) || {};
  const mode = f.mode || "opt";
  return {
    label: f.label || defaultLabel,
    mode,
    hidden: mode === "hid",
    required: mode === "req",
    readOnly: mode === "view",
  };
};

/** The values a dictionary offers for new entries (inactive ones are left out). */
export const optionsFor = (setup, code) =>
  ((setup && setup.dictionaries && setup.dictionaries[code]) || []).filter((e) => e.active).map((e) => e.value);

const isFilled = (v) => v === true || (v !== false && v !== null && v !== undefined && String(v).trim() !== "");

/**
 * Required fields still empty, for the steps in the sequence.
 * Returns [{ step, key, label }].
 */
export const missingRequired = (setup, stepKeys, patientFields = {}, visitFields = {}, defaultLabels = {}) => {
  const out = [];
  (stepKeys || []).forEach((step) => {
    const fields = (setup && setup.fields && setup.fields[step]) || {};
    Object.keys(fields).forEach((key) => {
      if (fields[key].mode !== "req") return;
      const source = WINDOW_SOURCE[step] === "visit" ? visitFields : patientFields;
      if (!isFilled(source[key])) out.push({ step, key, label: fields[key].label || defaultLabels[key] || key });
    });
  });
  return out;
};

/**
 * The clinic's field settings and dictionaries. Registering never waits on this: the built-in
 * labels and optional fields apply while loading, or if either request fails.
 */
export default function useRegistrationSetup() {
  const [setup, setSetup] = useState(NO_SETUP);
  useEffect(() => {
    if (!apiEndpoints.registrationFields || !apiEndpoints.registrationDictionaries) return undefined;
    let live = true;
    (async () => {
      try {
        const token = await getValidToken();
        const headers = { Authorization: `Bearer ${token}` };
        const [f, d] = await Promise.all([
          axios.get(apiEndpoints.registrationFields, { headers }),
          axios.get(apiEndpoints.registrationDictionaries, { headers }),
        ]);
        if (live) setSetup(setupFromServer(f && f.data, d && d.data));
      } catch (err) {
        if (live) setSetup(NO_SETUP);
      }
    })();
    return () => {
      live = false;
    };
  }, []);
  return setup;
}
