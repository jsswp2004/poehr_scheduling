import { useEffect, useState } from "react";
import axios from "axios";
import { getValidToken } from "../../utils/auth";
import { apiEndpoints } from "../../config/api";

/** The steps that exist; used until the clinic's own sequence arrives, and if it cannot be loaded. */
export const DEFAULT_STEPS = [
  { value: "identity", label: "Patient Identity", requireReview: false },
  { value: "emergency", label: "Emergency Contact", requireReview: false },
  { value: "financial", label: "Financial Information", requireReview: false },
  { value: "reason", label: "Reason for Visit", requireReview: false },
  { value: "legal", label: "Legal Documents", requireReview: false },
  { value: "logistics", label: "Logistics", requireReview: false },
];

/** Server rows [{key, label, require_review}] to the shape the step bar uses. */
export const stepsFromServer = (tabs) => {
  if (!Array.isArray(tabs) || tabs.length === 0) return null;
  const known = new Set(DEFAULT_STEPS.map((s) => s.value));
  const out = tabs
    .filter((t) => t && known.has(t.key))
    .map((t) => ({ value: t.key, label: t.label || t.key, requireReview: !!t.require_review }));
  return out.length ? out : null;
};

/**
 * The clinic's registration steps for a care setting ("" for any). Falls back to the built-in
 * sequence while loading or if the request fails, so registering never waits on this.
 */
export default function useRegistrationTabs(careSetting = "") {
  const [steps, setSteps] = useState(DEFAULT_STEPS);
  useEffect(() => {
    if (!apiEndpoints.registrationTabs) return undefined;
    let live = true;
    (async () => {
      try {
        const token = await getValidToken();
        const res = await axios.get(apiEndpoints.registrationTabs, {
          headers: { Authorization: `Bearer ${token}` },
          params: careSetting ? { care_setting: careSetting } : {},
        });
        const next = stepsFromServer(res && res.data && res.data.tabs);
        if (live) setSteps(next || DEFAULT_STEPS);
      } catch (err) {
        if (live) setSteps(DEFAULT_STEPS);
      }
    })();
    return () => {
      live = false;
    };
  }, [careSetting]);
  return steps;
}
