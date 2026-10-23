import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import { apiEndpoints } from "../config/api";
import { authHeader } from "../components/patientHeader/headerApi";

const REFRESH_MS = 60000;

/**
 * How many ED patients discharged in the last week have lab results nobody has reviewed: the red count on the
 * ED Follow-up tab. Asks once, then every minute, only while `enabled`. `refreshKey` asks again right away.
 * `setCount` lets the follow-up board correct the number when it has just loaded the real list.
 */
export default function useFollowUpCount(enabled, refreshKey = 0) {
  const [count, setCount] = useState(0);

  const load = useCallback(async () => {
    try {
      const headers = await authHeader();
      const res = await api.get(apiEndpoints.edBoardFollowUp, { headers, params: { summary: 1 } });
      setCount(Number(res.data?.needs_review) || 0);
    } catch (err) {
      // the count is only a hint on a tab
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setCount(0);
      return undefined;
    }
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [enabled, refreshKey, load]);

  return [count, setCount];
}
