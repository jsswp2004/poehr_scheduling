import AssistantDock from "./AssistantDock";
import { apiEndpoints } from "../config/api";

/**
 * The Communicator's assistant: answers questions about the signed-in user's contacts and message history,
 * and can PREPARE a text/email or a new contact for them to confirm. Nothing is sent until they confirm.
 *
 * Props: onNavigate(route) with route "contacts" | "send" | "logs".
 */
const QUICK = [
  "Who has opted out of texts?",
  "How many contacts can I text?",
  "Any replies in the last week?",
  "What did we send this week?",
];

export const COMMUNICATOR_CHANGED_EVENT = "communicator-data-changed";

function CommunicatorAssistantDock({ onNavigate }) {
  return (
    <AssistantDock
      title="Communicator assistant"
      messageUrl={apiEndpoints.communicatorAssistant}
      actionUrl={apiEndpoints.communicatorAssistantAction}
      quick={QUICK}
      intro="Ask about your contacts and messages, or have me prepare a text or email."
      note="I show contact details partly hidden and never send anything until you confirm. Please don't enter patient information."
      knownRoutes={["contacts", "send", "logs"]}
      onNavigate={onNavigate}
      changedEvent={COMMUNICATOR_CHANGED_EVENT}
    />
  );
}

export default CommunicatorAssistantDock;
