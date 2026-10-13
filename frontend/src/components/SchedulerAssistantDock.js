import AssistantDock from "./AssistantDock";
import { apiEndpoints } from "../config/api";

/**
 * The Scheduler's assistant: answers questions about the signed-in user's schedule and pending requests, and can
 * PREPARE approving or denying a request, or marking a patient arrived or no-show, for them to confirm.
 * Nothing changes until they confirm.
 *
 * Props: onNavigate(route) with route "appointments".
 */
const QUICK = [
  "What's on the schedule today?",
  "Any pending appointment requests?",
  "Who hasn't arrived yet today?",
  "Next open slots for a provider",
];

export const SCHEDULER_CHANGED_EVENT = "scheduler-data-changed";

function SchedulerAssistantDock({ onNavigate }) {
  return (
    <AssistantDock
      title="Scheduler assistant"
      messageUrl={apiEndpoints.schedulerAssistant}
      actionUrl={apiEndpoints.schedulerAssistantAction}
      quick={QUICK}
      intro="Ask about today's schedule, patient requests and open slots, or have me prepare an approval or check-in."
      note="I only show names, times and visit types, and never change anything until you confirm. Please don't enter clinical details."
      knownRoutes={["appointments"]}
      onNavigate={onNavigate}
      changedEvent={SCHEDULER_CHANGED_EVENT}
    />
  );
}

export default SchedulerAssistantDock;
