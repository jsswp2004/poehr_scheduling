import axios from "axios";
import { apiEndpoints, getAuthHeaders } from "../../config/api";
import { getAccessToken } from "../../utils/tokenManager";

// Shared helpers for the Reports module (home, builder, viewer).

export const headers = () => getAuthHeaders(getAccessToken());

export const listReports = async () => {
  const res = await axios.get(apiEndpoints.staffingCustomReports, { headers: headers() });
  return Array.isArray(res.data) ? res.data : res.data?.results || [];
};

export const errorText = (err, fallback = "Something went wrong. Try again.") => {
  const d = err?.response?.data;
  if (!d) return fallback;
  if (typeof d === "string") return d;
  if (d.error) return d.error;
  if (d.detail) return d.detail;
  const first = Object.values(d)[0];
  return Array.isArray(first) ? first[0] : typeof first === "string" ? first : fallback;
};

// The standard reports that live in Staffing > Reports. They open there, unchanged.
export const STANDARD_REPORTS = [
  { key: "coverage_compliance", label: "Coverage compliance", note: "Each unit and shift against its staffing standard." },
  { key: "schedule", label: "Schedule", note: "Every scheduled shift in the date range." },
  { key: "master_schedule", label: "Master schedule", note: "A printable month view of the whole schedule." },
  { key: "daily_forms", label: "Daily staffing forms", note: "Printable daily forms from the calendar." },
  { key: "unscheduled", label: "Staff with no schedule", note: "Active staff with no shifts in the range." },
  { key: "labor_hours", label: "Labor hours", note: "Scheduled hours for each person." },
  { key: "shift_distribution", label: "Shift-type distribution", note: "Day, evening, night and custom shifts per person." },
  { key: "message_log", label: "Message delivery log", note: "Texts and emails sent to staff." },
];

// ----- dates ---------------------------------------------------------------
const pad = (n) => String(n).padStart(2, "0");
export const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseDay = (s) => {
  const [y, m, d] = String(s).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export const presetRange = (preset, today = new Date()) => {
  if (preset === "today") return { start: isoDate(today), end: isoDate(today) };
  if (preset === "month") {
    const s = new Date(today.getFullYear(), today.getMonth(), 1);
    const e = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { start: isoDate(s), end: isoDate(e) };
  }
  const monday = addDays(today, -((today.getDay() + 6) % 7)); // weeks run Monday to Sunday
  return { start: isoDate(monday), end: isoDate(addDays(monday, 6)) };
};

export const stepRange = (preset, start, end, dir) => {
  const s = parseDay(start);
  const e = parseDay(end);
  if (preset === "today") return { start: isoDate(addDays(s, dir)), end: isoDate(addDays(s, dir)) };
  if (preset === "week") return { start: isoDate(addDays(s, 7 * dir)), end: isoDate(addDays(s, 7 * dir + 6)) };
  if (preset === "month") {
    const ns = new Date(s.getFullYear(), s.getMonth() + dir, 1);
    return { start: isoDate(ns), end: isoDate(new Date(ns.getFullYear(), ns.getMonth() + 1, 0)) };
  }
  const span = Math.round((e - s) / 86400000) + 1;
  return { start: isoDate(addDays(s, span * dir)), end: isoDate(addDays(e, span * dir)) };
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const shortDate = (iso) => {
  if (!iso) return "";
  const d = parseDay(iso);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
};
export const rangeText = (start, end) => {
  if (!start || !end) return "";
  if (start === end) return shortDate(start);
  const s = parseDay(start);
  const e = parseDay(end);
  const left = s.getFullYear() === e.getFullYear() ? `${MONTHS[s.getMonth()]} ${s.getDate()}` : shortDate(start);
  return `${left} – ${shortDate(end)}`;
};
export const dayTime = (iso) => {
  if (!iso) return "Never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Never";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

// ----- cells ---------------------------------------------------------------
export const formatCell = (value, type) => {
  if (value === null || value === undefined || value === "") return "—";
  if (type === "date") return /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? shortDate(value) : String(value);
  if (typeof value !== "number") return String(value);
  if (type === "percent") return `${value.toFixed(1)}%`;
  if (type === "hours") return value.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  if (type === "ratio") return value.toFixed(2);
  return value.toLocaleString();
};

export const isNumeric = (type) => ["number", "hours", "percent", "ratio"].includes(type);

// ----- CSV (built in the browser from the rows on screen) -------------------
const csvCell = (v) => {
  const s = v === null || v === undefined ? "" : String(v);
  const safe = /^[=+\-@\t\r]/.test(s) && Number.isNaN(Number(s)) ? `'${s}` : s; // keep spreadsheets from running text as a formula
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export const resultToCsv = (result) => {
  const cols = result.columns;
  const lines = [cols.map((c) => csvCell(c.label)).join(",")];
  const row = (r) => cols.map((c) => csvCell(r[c.key])).join(",");
  result.rows.forEach((r) => lines.push(row(r)));
  if (result.totals) lines.push(row(result.totals));
  return lines.join("\r\n");
};

export const downloadText = (text, filename, type = "text/csv;charset=utf-8") => {
  const url = URL.createObjectURL(new Blob(["﻿", text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
};

export const slug = (s) =>
  String(s || "report")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "report";

// ----- filter wording ------------------------------------------------------
// Colour of a module in the canvas and the relationship map.
export const MODULE_COLORS = {
  Communicator: "#7a4fb5",
  Patients: "#44546f",
  Staffing: "#b86a00",
  Scheduling: "#1769c2",
  Notes: "#1b7a43",
  Documentation: "#6b4fa3",
  Visits: "#c2410c",
  Orders: "#0e7490",
  Labs: "#a21caf",
  Flowsheets: "#4d7c0f",
  Vaccines: "#be123c",
  Referrals: "#6d28d9",
  Allergies: "#b45309",
  Census: "#0f766e",
  Telehealth: "#0369a1",
};

export const OP_LABELS = {
  is: "is",
  is_not: "is not",
  any_of: "is any of",
  contains: "contains",
  gt: "is above",
  gte: "is at least",
  lt: "is below",
  lte: "is at most",
};
export const TEXT_OPS = ["is", "is_not", "contains"];
export const NUMBER_OPS = ["gt", "gte", "lt", "lte", "is"];
