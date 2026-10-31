import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { authHeader, errorText } from "../patientHeader/headerApi";

export { authHeader, errorText };

/** The roles the server lets into the Referral Manager, and who may sign a referral. */
export const REFERRAL_ROLES = ["doctor", "nurse", "registrar", "admin", "system_admin"];
export const REFERRAL_ADMIN_ROLES = ["admin", "system_admin"];

// Each status and urgency is shown with its word as well as a colour.
export const STATUS_COLOR = {
  draft: "default",
  sent: "info",
  scheduled: "primary",
  seen: "secondary",
  report_received: "warning",
  closed: "success",
  declined: "error",
  needs_info: "warning",
  cancelled: "default",
  expired: "error",
};
export const URGENCY_COLOR = { routine: "default", urgent: "warning", emergent: "error" };

export const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString() : "");
export const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString() : "");

/** A value for a datetime-local input from an ISO string (local time, minutes). */
export function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** What the "Why overdue" chip says. */
export const overdueText = (ref) => {
  if (!ref?.overdue) return "";
  if (ref.overdue_reason === "schedule") return `Not scheduled by ${fmtDate(ref.schedule_due)}`;
  if (ref.overdue_reason === "report") return `Report due ${fmtDate(ref.report_due)}`;
  return "Overdue";
};

/**
 * What each step asks for. `text` is the label of the note box, `required` whether it must be filled,
 * `when` a date/time field. Mirrors the rules the server enforces; the server has the last word.
 */
export const ACTION_FORMS = {
  sign_send: { title: "Sign and send", confirm: "Sign and send", intro: "Signing sends this referral and attaches the patient's allergy list as it stands today." },
  resend: { title: "Send again", confirm: "Send again", text: "What was added (optional)", multiline: true },
  schedule: { title: "Appointment", confirm: "Save appointment", when: "scheduled_for", whenLabel: "Appointment date and time", location: true },
  seen: { title: "Patient was seen", confirm: "Mark seen", when: "seen_at", whenLabel: "Seen on (leave blank for now)", optionalWhen: true },
  report: { title: "Specialist's report", confirm: "Save report", text: "Report", required: true, multiline: true, field: "report_text", rows: 8 },
  needs_info: { title: "Needs more information", confirm: "Send back", text: "What information is needed", required: true, multiline: true },
  decline: { title: "Declined by the specialist", confirm: "Record decline", text: "Why it was declined", required: true, multiline: true },
  close: { title: "Close referral", confirm: "Close", text: "Closing note (optional)", multiline: true },
  cancel: { title: "Cancel referral", confirm: "Cancel referral", text: "Why it is being cancelled", required: true, multiline: true },
  expire: { title: "Mark expired", confirm: "Mark expired", text: "Note (optional)", multiline: true },
  note: { title: "Add a note", confirm: "Add note", text: "Note", required: true, multiline: true },
  assign: { title: "Assign", confirm: "Assign", assign: true },
};

/** Fetch the pick lists once per screen: specialties, doctors, staff, queues. */
export async function loadMeta() {
  const res = await api.get(apiEndpoints.referralMeta, { headers: await authHeader() });
  return res.data;
}

export async function runAction(id, action, body = {}) {
  const res = await api.post(apiEndpoints.referralAction(id), { action, ...body }, { headers: await authHeader() });
  return res.data;
}

/** Steps that can send the secure link along with them. */
export const LINK_ACTIONS = ["sign_send", "resend"];

/** Why a text or email did not go out, in words. */
export const DELIVERY_REASON = {
  opted_out: "that number has opted out of texts",
  no_consent: "texting that number has not been agreed to",
  no_contact: "there is no number or address to send to",
  failed: "the message could not be sent",
};

export const CHANNEL_WORD = { sms: "text", email: "email" };

/** One sentence per delivery result, e.g. "Text to •••-•••-0142: sent". */
export function deliverySummary(deliveries = []) {
  return deliveries.map((d) => {
    const word = d.channel === "sms" ? "Text" : "Email";
    const to = d.to ? ` to ${d.to}` : "";
    return d.sent ? `${word}${to}: sent` : `${word}${to}: not sent, ${DELIVERY_REASON[d.reason] || DELIVERY_REASON.failed}`;
  });
}

export async function sendLink(id, body) {
  const res = await api.post(apiEndpoints.referralSendLink(id), body, { headers: await authHeader() });
  return res.data;
}

export async function revokeLink(id) {
  const res = await api.post(apiEndpoints.referralRevokeLink(id), {}, { headers: await authHeader() });
  return res.data;
}

/** Open a file the specialist attached in a new tab (the server records who opened it). */
export async function openAttachment(referralId, attachment) {
  const res = await api.get(apiEndpoints.referralAttachmentFile(referralId, attachment.id), {
    headers: await authHeader(),
    responseType: "blob",
  });
  const url = URL.createObjectURL(res.data);
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/** Tell the menu badge, if any, that something moved. */
export const announceChange = () => window.dispatchEvent(new Event("referrals-changed"));
