import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { authHeader, errorText } from "../patientHeader/headerApi";

export { authHeader, errorText };

/** The roles the server lets into the Task Manager, who may document a task, and who sets the rules. */
export const TASK_VIEW_ROLES = ["nurse", "doctor", "admin", "system_admin"];
export const TASK_PERFORM_ROLES = ["nurse", "doctor", "system_admin"];
export const TASK_ADMIN_ROLES = ["admin", "system_admin"];

/** Frequencies as the server knows them (the server checks the value; this is only the pick list). */
export const FREQUENCY_OPTIONS = [
  { value: "once", label: "Once", kind: "once" },
  { value: "stat", label: "STAT (now)", kind: "once" },
  { value: "daily", label: "Daily", kind: "clock" },
  { value: "qam", label: "Every morning", kind: "clock" },
  { value: "qhs", label: "At bedtime", kind: "clock" },
  { value: "bid", label: "Twice a day (BID)", kind: "clock" },
  { value: "tid", label: "Three times a day (TID)", kind: "clock" },
  { value: "qid", label: "Four times a day (QID)", kind: "clock" },
  { value: "q1h", label: "Every hour", kind: "interval" },
  { value: "q2h", label: "Every 2 hours", kind: "interval" },
  { value: "q4h", label: "Every 4 hours", kind: "interval" },
  { value: "q6h", label: "Every 6 hours", kind: "interval" },
  { value: "q8h", label: "Every 8 hours", kind: "interval" },
  { value: "q12h", label: "Every 12 hours", kind: "interval" },
  { value: "weekly", label: "Weekly", kind: "interval" },
  { value: "prn", label: "As needed (PRN)", kind: "prn" },
];
export const FREQUENCY_LABEL = Object.fromEntries(FREQUENCY_OPTIONS.map((f) => [f.value, f.label]));
export const CLOCK_FREQUENCIES = FREQUENCY_OPTIONS.filter((f) => f.kind === "clock");

export const ROUTE_OPTIONS = ["PO", "IV", "IVPB", "IM", "SC", "SL", "PR", "Topical", "Inhaled", "Ophthalmic", "Otic", "Nasal", "Transdermal", "Via tube", "Other"];

// Each status is shown with its word as well as a colour.
export const STATUS_COLOR = { pending: "default", done: "success", held: "warning", refused: "error", missed: "error", cancelled: "default" };

export const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
export const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "");

/** A value for a datetime-local input from an ISO string (local time, minutes). */
export function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** An ISO string from a datetime-local value ("" when empty or not a date). */
export function fromLocalInput(value) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

/** "500 mg · PO · Twice a day (BID) · for 5 days" -- the one-line view of an order's schedule. */
export function scheduleSummary(schedule) {
  const s = schedule || {};
  if (!s.frequency) return "";
  const parts = [s.dose, s.route, FREQUENCY_LABEL[s.frequency] || s.frequency];
  if (s.frequency === "prn" && s.prn_reason) parts.push(`for ${s.prn_reason}`);
  if (s.duration_days) parts.push(`for ${s.duration_days} day${s.duration_days === 1 ? "" : "s"}`);
  else if (s.stop_at) parts.push(`until ${fmtDateTime(s.stop_at)}`);
  return parts.filter(Boolean).join(" · ");
}

/** What is still needed before this draft can be signed -- mirrors the server's rule; the server has the last word. */
export function missingSchedule(order, schedule) {
  const mode = order.task_mode;
  const s = schedule || {};
  if (!mode || mode === "none") return [];
  if (mode === "optional" && !s.frequency) return [];
  const missing = [];
  if (!s.frequency) missing.push("frequency");
  if (order.orderable_category === "medication") {
    if (!s.dose) missing.push("dose");
    if (!s.route) missing.push("route");
  }
  if (s.frequency === "prn" && !s.prn_reason) missing.push("PRN reason");
  return missing;
}

/** The grid's default time columns: every hour, as minutes after midnight. */
export const DEFAULT_COLUMNS = Array.from({ length: 24 }, (_, h) => h * 60);
export const MAX_COLUMNS = 1440;

/** 585 -> "9:45". */
export const minutesLabel = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;

/** "09:45" (a time input's value) -> 585, or null when it is not a time. */
export function parseClock(value) {
  const m = /^(\d{1,2}):(\d{2})/.exec(value || "");
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

/** 585 -> "09:45", for a time input. */
export const clockValue = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Every `step` minutes from `start` to `end` inclusive: (480, 510, 15) -> [480, 495, 510]. */
export function expandRange(start, end, step) {
  const out = [];
  if (start == null || end == null || !(step >= 1) || end < start) return out;
  for (let t = start; t <= end; t += step) out.push(t);
  return out;
}

/** Add times to a column list: no duplicates, in time order. */
export const mergeColumns = (columns, extra) => [...new Set([...columns, ...extra])].sort((a, b) => a - b);

/** The column a task falls in: the latest column at or before its time, or the first one if it is earlier than all. */
export function columnFor(columns, minute) {
  let found = columns[0];
  for (const c of columns) {
    if (c <= minute) found = c;
    else break;
  }
  return found;
}

export async function loadTaskMeta() {
  const res = await api.get(apiEndpoints.orderTaskMeta, { headers: await authHeader() });
  return res.data;
}

export async function runTaskAction(id, action, body = {}) {
  const res = await api.post(apiEndpoints.orderTaskAction(id), { action, ...body }, { headers: await authHeader() });
  return res.data;
}

/** Tell the menu badge, if any, that something moved. */
export const announceTaskChange = () => window.dispatchEvent(new Event("tasks-changed"));
