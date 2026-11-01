import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { getValidToken } from "../../utils/auth";

export const FOLDERS = [
  { key: "all", label: "All mail" },
  { key: "messages", label: "Messages" },
  { key: "alerts", label: "Alerts and results" },
  { key: "sign", label: "To sign" },
  { key: "cosign", label: "Co-sign requests" },
  { key: "sent", label: "Sent" },
  { key: "done", label: "Done" },
];

// The number shown beside a folder: unread for the mail-like folders, what is waiting for the work ones.
export function folderCount(counts, key) {
  if (!counts) return 0;
  if (key === "sign") return counts.sign_open || 0;
  if (key === "cosign") return counts.cosign_open || 0;
  if (key === "sent" || key === "done") return 0;
  return counts[key] || 0;
}

export const CARE_LABELS = { ambulatory: "Ambulatory", emergency: "Emergency", acute: "Acute" };

async function headers() {
  const token = await getValidToken();
  return token ? { Authorization: `Bearer ${token.access_token || token}` } : {};
}

export async function inboxGet(path = "", params = {}) {
  const res = await api.get(`${apiEndpoints.inbox}${path}`, { headers: await headers(), params });
  return res.data;
}

export async function inboxPost(path, body = {}) {
  const res = await api.post(`${apiEndpoints.inbox}${path}`, body, { headers: await headers() });
  return res.data;
}

export async function notePost(url, body = {}) {
  const res = await api.post(url, body, { headers: await headers() });
  return res.data;
}

export function announceChange() {
  try {
    window.dispatchEvent(new Event("inbox-changed"));
  } catch (err) {
    // the badge simply refreshes on its next turn
  }
}

// Today shows the time, anything else the date.
export function whenText(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString([], sameYear ? { month: "short", day: "numeric" } : { year: "numeric", month: "short", day: "numeric" });
}

export function fullWhen(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

// The small label on each row and in the reading pane.
export function badgeFor(item) {
  if (item.kind === "alert") {
    if (item.subtype === "critical") return { label: "Critical", color: "error" };
    if (item.subtype === "abnormal") return { label: "Abnormal", color: "warning" };
    if (item.subtype === "result") return { label: "Result", color: "info" };
    return { label: "Notice", color: "default" };
  }
  if (item.kind === "sign") return { label: "To sign", color: "secondary" };
  if (item.kind === "cosign") return { label: item.sent ? "Sent" : "Co-sign", color: "primary" };
  return { label: "Message", color: "default" };
}

// Where "Open chart" goes for an item: results for lab alerts, orders for orders, documents otherwise.
export function chartTabFor(item) {
  if (item.kind === "alert" && ["critical", "abnormal", "result"].includes(item.subtype)) return "results";
  if (item.subtype === "order") return "orders";
  if (item.kind === "sign" || item.kind === "cosign") return "documents";
  return "patient_info";
}
