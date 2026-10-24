/**
 * Pure helpers behind the month view's daily counts, the provider colours and the day summary
 * panel. Kept free of React so they are easy to test.
 */

export const PROVIDER_COLORS = ["#2563eb", "#0d9488", "#7c3aed", "#db2777", "#475569", "#ea580c", "#0891b2", "#65a30d"];

// "2026-10-22" in the viewer's local time (never UTC, so late appointments stay on their day)
export const dayKey = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};

export const isAppointment = (event) => event?.resource?.type === "appointment";

// An appointment's provider id: the API sends either an id or a nested provider object.
export const apptProviderId = (appt) => {
  const p = appt?.provider;
  if (p && typeof p === "object") return p.id ?? null;
  return p ?? null;
};

export const apptProviderName = (appt) => {
  if (!appt) return "Unassigned";
  if (appt.provider_name) return appt.provider_name;
  const p = appt.provider;
  if (p && typeof p === "object") return `Dr. ${p.first_name || ""} ${p.last_name || ""}`.trim() || "Unassigned";
  return "Unassigned";
};

// arrived | no_show | pending | cancelled | scheduled
export const apptState = (appt) => {
  const status = (appt?.status || "scheduled").toLowerCase();
  if (appt?.no_show || status === "no_show") return "no_show";
  if (status === "cancelled" || status === "rescheduled") return "cancelled";
  if (appt?.arrived || status === "completed" || status === "in_progress") return "arrived";
  if (status === "pending") return "pending";
  return "scheduled";
};

export const emptyStats = () => ({ total: 0, arrived: 0, scheduled: 0, pending: 0, no_show: 0, cancelled: 0, byProvider: [] });

// Totals for a list of appointment records. Cancelled and rescheduled visits are counted apart
// and left out of the total, since they no longer take a slot.
export function summarize(appts) {
  const s = emptyStats();
  const providers = new Map();
  (appts || []).forEach((a) => {
    const state = apptState(a);
    s[state] += 1;
    if (state === "cancelled") return;
    s.total += 1;
    const id = apptProviderId(a);
    const key = id == null ? "none" : String(id);
    const row = providers.get(key) || { id, name: apptProviderName(a), count: 0 };
    row.count += 1;
    providers.set(key, row);
  });
  s.byProvider = [...providers.values()].sort((a, b) => b.count - a.count);
  return s;
}

// { "2026-10-22": [appointment records...] } from calendar events
export function groupByDay(events) {
  const out = {};
  (events || []).filter(isAppointment).forEach((e) => {
    const k = dayKey(e.start);
    (out[k] = out[k] || []).push(e.resource.data);
  });
  return out;
}

// Provider id -> colour. Doctors keep the same colour in every view because the list is sorted by id.
export function buildProviderColors(doctors, events) {
  const ids = new Set();
  (doctors || []).forEach((d) => ids.add(String(d.id)));
  (events || []).filter(isAppointment).forEach((e) => {
    const id = apptProviderId(e.resource.data);
    if (id != null) ids.add(String(id));
  });
  const sorted = [...ids].sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));
  const map = {};
  sorted.forEach((id, i) => {
    map[id] = PROVIDER_COLORS[i % PROVIDER_COLORS.length];
  });
  return map;
}

// Busier days get a darker blue; the thresholds are relative to the busiest day on screen.
export function heatLevel(count, max) {
  if (!count || !max) return 0;
  const r = count / max;
  if (r >= 0.85) return 3;
  if (r >= 0.6) return 2;
  return 1;
}
export const HEAT_COLORS = ["transparent", "#f1f5fe", "#e6eefd", "#dbe6fd"];
