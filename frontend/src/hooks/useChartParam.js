import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * The open chart tab on the Patients page, tied to ?chart= in the address.
 * ?chart=documents opens the Documents tab (the header's Documentation icon); no ?chart= is the Patient List
 * (the header's Patients icon). The address follows tab changes made on the page, so the right icon stays lit.
 */
export default function useChartParam(mainTab) {
  const [searchParams, setSearchParams] = useSearchParams();
  const chartParam = searchParams.get("chart");
  const [chartTab, setChartTab] = useState(chartParam === "documents" ? "documents" : "patient_list");

  // The address changed while the page is open (a header icon was clicked): follow it.
  const lastParam = useRef(chartParam);
  useEffect(() => {
    if (lastParam.current === chartParam) return;
    lastParam.current = chartParam;
    setChartTab((current) => (chartParam === "documents" ? "documents" : current === "documents" ? "patient_list" : current));
  }, [chartParam]);

  // A tab was picked on the page: put it in the address.
  useEffect(() => {
    if (mainTab !== "patients") return;
    if ((chartTab === "documents") === (chartParam === "documents")) return;
    const next = new URLSearchParams(searchParams);
    if (chartTab === "documents") next.set("chart", "documents");
    else next.delete("chart");
    lastParam.current = chartTab === "documents" ? "documents" : null;
    setSearchParams(next, { replace: true });
  }, [chartTab, chartParam, mainTab, searchParams, setSearchParams]);

  return [chartTab, setChartTab];
}
