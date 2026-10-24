import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { API_BASE_URL } from "../config/api";
import { getAccessToken } from "../utils/tokenManager";

const REFERRAL_ROLES = ["doctor", "nurse", "registrar", "admin", "system_admin"];
const TASK_ROLES = ["doctor", "nurse", "admin", "system_admin"];

// One worklist's "needs action" and "overdue" counts, refreshed every two minutes, when the window
// regains focus, and when the page that changes them fires `eventName`.
function useQueueCount(url, allowed, eventName) {
  const [state, setState] = useState({ count: 0, overdue: 0 });
  const refresh = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    try {
      const res = await axios.get(`${API_BASE_URL}${url}`, { headers: { Authorization: `Bearer ${token}` } });
      const counts = (res.data && res.data.counts) || {};
      setState({ count: Number(counts.needs_action) || 0, overdue: Number(counts.overdue) || 0 });
    } catch (err) {
      // No access, offline, or the add-on is off: show no badge rather than an error.
      setState({ count: 0, overdue: 0 });
    }
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

/** What is waiting on the Referral List and Task List chart tabs (these used to be badges on the header icons). */
export default function useWorklistCounts(role, enabled = true) {
  const referrals = useQueueCount("/api/referrals/queues/", enabled && REFERRAL_ROLES.includes(role), "referrals-changed");
  const tasks = useQueueCount("/api/order-tasks/queues/", enabled && TASK_ROLES.includes(role), "tasks-changed");
  return { referrals, tasks };
}
