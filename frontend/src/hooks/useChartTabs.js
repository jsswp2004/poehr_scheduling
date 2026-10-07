import { useState, useEffect, useCallback, useMemo } from "react";
import { api } from "../api/client";
import { apiEndpoints } from "../config/api";
import { getValidToken } from "../utils/auth";
import { CHART_TABS } from "../components/patients/PatientChartTabs";

const BUILT_IN = { tabs: CHART_TABS.map((t) => t.value), default_tab: "patient_list" };

/**
 * The chart tabs to show for one module (ambulatory, emergency, acute) and the tab that opens
 * first, as set by the clinic and then by the person. Until the server answers, or if it
 * cannot, every tab shows, so the page is never left without tabs.
 */
export default function useChartTabs(careSetting, enabled = true) {
  const [all, setAll] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const token = await getValidToken();
        const headers = token ? { Authorization: `Bearer ${token.access_token || token}` } : {};
        const res = await api.get(apiEndpoints.chartTabs, { headers });
        if (!cancelled) setAll(res.data && res.data.settings ? res.data.settings : null);
      } catch (err) {
        if (!cancelled) setAll(null);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const mine = all && all[careSetting || "ambulatory"];
  return useMemo(
    () => ({
      loaded,
      tabs: mine && Array.isArray(mine.tabs) && mine.tabs.length ? mine.tabs : BUILT_IN.tabs,
      defaultTab: (mine && mine.default_tab) || BUILT_IN.default_tab,
      reload,
    }),
    [loaded, mine, reload]
  );
}
