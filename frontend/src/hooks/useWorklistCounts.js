import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { API_BASE_URL } from "../config/api";
import { getAccessToken } from "../utils/tokenManager";

const REFERRAL_ROLES = ["doctor", "nurse", "registrar", "admin", "system_admin"];
const TASK_ROLES = ["doctor", "nurse", "admin", "system_admin"];
// Anyone who may hold the review right; the server answers 403 to the rest and the badge stays empty.
const LAB_ROLES = ["doctor", "nurse", "admin", "system_admin"];

// One worklist's "needs action" and "overdue" counts, refreshed every two minutes, when the window
// regains focus, and when the page that changes them fires `eventName`.
// `read` turns the response into { count, overdue }; the default reads the worklist queues' counts.
const readQueueCounts = (data) => {
  const counts = (data && data.counts) || {};
  return { count: Number(counts.needs_action) || 0, overdue: Number(counts.overdue) || 0 };
};
// The lab inbox's summary: results waiting for review, and how many of them are critical.
const readLabSummary = (data) => ({ count: Number(data && data.count) || 0, overdue: Number(data && data.critical) || 0 });

function useQueueCount(url, allowed, eventName, read = readQueueCounts, params) {
  const [state, setState] = useState({ count: 0, overdue: 0 });
  const refresh = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    try {
      const res = await axios.get(`${API_BASE_URL}${url}`, { headers: { Authorization: `Bearer ${token}` }, params });
      setState(read(res.data));
    } catch (err) {
      // No access, offline, or the add-on is off: show no badge rather than an error.
      setState({ count: 0, overdue: 0 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);
  useEffect(() => {
    if (!allowed) return undefined;
    refresh();
    const timer = setInterval(refresh, 120000);
    window.addEventListener("focus", refresh);
    window.addEventListener(eventName, refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener(eventName, refresh);
    };
  }, [allowed, refresh, eventName]);
  return state;
}

/** What is waiting on the Referral List, Task List and Results chart tabs (these used to be badges on the header icons). */
export default function useWorklistCounts(role, enabled = true) {
  const referrals = useQueueCount("/api/referrals/queues/", enabled && REFERRAL_ROLES.includes(role), "referrals-changed");
  const tasks = useQueueCount("/api/order-tasks/queues/", enabled && TASK_ROLES.includes(role), "tasks-changed");
  // Results: unreviewed lab results (red when any is critical), the same count the Lab Inbox shows.
  const results = useQueueCount("/api/lab-reports/inbox/", enabled && LAB_ROLES.includes(role), "lab-inbox-changed", readLabSummary, { summary: 1 });
  return { referrals, tasks, results };
}
