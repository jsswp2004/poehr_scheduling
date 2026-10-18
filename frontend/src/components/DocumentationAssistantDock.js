import { useEffect, useState } from "react";
import axios from "axios";
import AssistantDock from "./AssistantDock";
import { apiEndpoints, getAuthHeaders } from "../config/api";
import { getAccessToken } from "../utils/tokenManager";

/**
 * The Documentation assistant: ask about patients and their charts (notes, orders, visits, results, problems,
 * medications). READ-ONLY: it never changes the chart, so there are no confirmation cards.
 *
 * It only appears when the server says it is on for this user (GET /api/documentation-assistant/status/); it is
 * off by default because it sends chart text to the model. When mounted on a patient's chart, pass patientId so
 * "this patient" means that chart (the server re-checks the user may open it).
 *
 * Props: patientId (optional), patientName (optional, for the greeting only).
 */
const QUICK_CHART = [
  "Summarize this patient's chart",
  "What does the latest note say?",
  "Any abnormal results recently?",
  "What orders are active?",
];
const QUICK_GENERAL = [
  "Find a patient",
  "Notes that mention chest pain this week",
  "Which orders are waiting for cosign?",
];

// One answer per page load is plenty: the setting only changes when the server is reconfigured.
let cachedEnabled = null;

// For tests: forget the remembered answer.
export function resetDocumentationAssistantStatus() {
  cachedEnabled = null;
}

function DocumentationAssistantDock({ patientId = null, patientName = "" }) {
  const [enabled, setEnabled] = useState(cachedEnabled === true);

  useEffect(() => {
    if (cachedEnabled !== null) {
      setEnabled(cachedEnabled);
      return undefined;
    }
    let cancelled = false;
    const token = getAccessToken();
    if (!token) return undefined;
    Promise.resolve(axios.get(apiEndpoints.documentationAssistantStatus, { headers: getAuthHeaders(token), timeout: 10000 }))
      .then((res) => {
        cachedEnabled = res?.data?.enabled === true;
        if (!cancelled) setEnabled(cachedEnabled);
      })
      .catch(() => {
        // Not available (or not signed in): stay hidden, and ask again on the next page.
        if (!cancelled) setEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!enabled) return null;

  const hasChart = patientId !== null && patientId !== undefined && patientId !== "";
  return (
    <AssistantDock
      title="Documentation assistant"
      messageUrl={apiEndpoints.documentationAssistant}
      actionUrl={() => ""}
      quick={hasChart ? QUICK_CHART : QUICK_GENERAL}
      intro={
        hasChart
          ? `Ask about ${patientName || "this patient"}'s chart: notes, orders, visits, results, problems and medications.`
          : "Find a patient, then ask about their notes, orders, visits, results, problems and medications."
      }
      note="Read-only: I never change the chart. Answers come from what is documented and can be incomplete, so check the record before you act on them."
      extraBody={hasChart ? { patient_id: patientId } : null}
    />
  );
}

export default DocumentationAssistantDock;
