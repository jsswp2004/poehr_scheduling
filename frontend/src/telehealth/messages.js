// Plain-language explanations for API error codes. Each says what happened and what to do.
const MESSAGES = {
  link_unavailable: "This link has already been used or has expired. Send the patient a new one.",
  video_service_unavailable: "The video service isn't responding. Wait a moment and try again.",
  session_ended: "This visit has already ended.",
  no_patient_waiting: "No patient is waiting yet.",
  patient_already_admitted: "The patient is already in the visit.",
  consent_required: "The patient hasn't agreed to the visit notice yet.",
  not_admitted: "The patient hasn't been let in yet.",
  rate_limited: "Too many attempts. Wait a minute and try again.",
  assistant_unavailable: "The assistant isn't set up yet. Ask your administrator.",
  assistant_failed: "The assistant couldn't answer. Try again in a moment.",
  request_failed: "That didn't save. Check the details and try again.",
  network_error: "Can't reach the server. Check your internet connection and try again.",
  microphone_unavailable:
    "We couldn't use the microphone. Allow microphone access in your browser settings, then try again.",
  connection_lost: "The connection dropped. Check your internet connection and rejoin.",
};

export function messageFor(errOrCode) {
  const code = typeof errOrCode === "string" ? errOrCode : errOrCode?.code;
  if (code && MESSAGES[code]) return MESSAGES[code];
  if (errOrCode?.status === 403) return "You don't have permission to do that.";
  return "Something went wrong. Try again, and tell support if it keeps happening.";
}
