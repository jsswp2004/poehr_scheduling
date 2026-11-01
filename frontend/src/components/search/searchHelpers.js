import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { getValidToken } from "../../utils/auth";

const RECENT_MAX = 6;
const CARE_LABELS = { ambulatory: "Ambulatory", emergency: "Emergency", acute: "Acute" };
export { CARE_LABELS };

async function headers() {
  const token = await getValidToken();
  return token ? { Authorization: `Bearer ${token.access_token || token}` } : {};
}

export async function searchRequest(q, care, signal) {
  const params = {};
  if (q) params.q = q;
  if (care) params.care = care;
  const res = await api.get(apiEndpoints.globalSearch, { headers: await headers(), params, signal });
  return res.data;
}

// Best effort: the audit note must never stop a chart from opening.
export async function logOpened(target, q, action) {
  try {
    await api.post(
      apiEndpoints.globalSearchOpened,
      { patient: target.user_id, visit: target.visitId || undefined, q: q || "", action },
      { headers: await headers() }
    );
  } catch (err) {
    // ignore
  }
}

// What each result can do. Open chart lands on Patient Info, as the Inbox does.
export const ACTION_TABS = { chart: "patient_info", orders: "orders", results: "results" };

// Recently opened patients are remembered in this browser, for this person only.
function recentKey(userId) {
  return `powerSearchRecent:${userId || "anon"}`;
}

export function loadRecent(userId) {
  try {
    const list = JSON.parse(window.localStorage.getItem(recentKey(userId)) || "[]");
    return Array.isArray(list) ? list.filter((r) => r && r.user_id).slice(0, RECENT_MAX) : [];
  } catch (err) {
    return [];
  }
}

export function rememberRecent(userId, row) {
  try {
    const next = [
      { type: "patient", user_id: row.user_id, full_name: row.full_name, mrn: row.mrn, age: row.age, sex: row.sex, dob: row.dob },
      ...loadRecent(userId).filter((r) => String(r.user_id) !== String(row.user_id)),
    ].slice(0, RECENT_MAX);
    window.localStorage.setItem(recentKey(userId), JSON.stringify(next));
  } catch (err) {
    // remembering is only a convenience
  }
}

export function initials(name) {
  return (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

const AVATAR_COLORS = ["#7c3aed", "#0f766e", "#b45309", "#be123c", "#1d4ed8", "#4d7c0f"];
export function avatarColor(id) {
  return AVATAR_COLORS[Math.abs(Number(id) || 0) % AVATAR_COLORS.length];
}

export function shortDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

export function dobText(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${m}/${d}/${y}` : "";
}

// The rows in the order they are shown, with the keyboard position of each.
export function flattenRows(data, chip) {
  const rows = [];
  if (!data) return rows;
  let patients = data.patients || [];
  const visits = data.visits || [];
  if (chip === "mrn") patients = patients.filter((p) => p.matched_by === "mrn");
  if (chip !== "visits") patients.forEach((p) => rows.push({ ...p, rowKey: `p${p.user_id}` }));
  if (chip === "all" || chip === "visits") visits.forEach((v) => rows.push({ ...v, rowKey: `v${v.id}` }));
  if (!patients.length && !visits.length && chip !== "visits") (data.suggestions || []).forEach((p) => rows.push({ ...p, rowKey: `s${p.user_id}` }));
  return rows;
}

// The target handed to the Patients page.
export function targetFor(row, action) {
  const target = {
    user_id: row.user_id,
    full_name: row.full_name,
    tab: ACTION_TABS[action] || ACTION_TABS.chart,
    nonce: Date.now(),
  };
  if (row.type === "visit") {
    target.visit = row.is_current ? null : row;
    target.visitId = row.id;
    target.care = row.care_setting;
  } else if (row.visit) {
    target.visitId = row.visit.id;
    target.care = row.visit.care_setting;
  }
  return target;
}
