/**
 * Pure helpers for the Staffing calendar: they turn one day of the
 * coverage-status response (`coverage.days[iso]`) into the short summaries the
 * month cells and the side panel show.
 *
 * A day has `items`, one per unit and shift:
 *   { unit_id, unit_name, shift_type, shift_label, status, assigned, required,
 *     required_rn, rn_scheduled, ... }
 */

export const SHIFT_ORDER = ["day", "evening", "night"];
export const SHIFT_SHORT = { day: "D", evening: "E", night: "N", custom: "C" };
export const SHIFT_NAME = { day: "Day", evening: "Evening", night: "Night", custom: "Custom" };

const RANK = { unknown: 0, met: 1, at_risk: 2, not_met: 3 };

/** The most serious status in a list ("not_met" beats "at_risk" beats "met"); "unknown" when empty. */
export const worstStatus = (statuses) =>
  (statuses || []).reduce((worst, s) => ((RANK[s] ?? -1) > (RANK[worst] ?? -1) ? s : worst), "unknown");

const shiftRank = (type) => {
  const i = SHIFT_ORDER.indexOf(type);
  return i === -1 ? SHIFT_ORDER.length : i;
};

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/**
 * One row per shift type present that day, added up across units:
 * [{ shift_type, assigned, required, status }] in Day, Evening, Night order.
 */
export function summarizeShifts(info) {
  const by = {};
  ((info && info.items) || []).forEach((it) => {
    const type = it.shift_type || "custom";
    const row = (by[type] ||= { shift_type: type, assigned: 0, required: 0, statuses: [] });
    row.assigned += num(it.assigned);
    row.required += num(it.required);
    row.statuses.push(it.status);
  });
  return Object.values(by)
    .sort((a, b) => shiftRank(a.shift_type) - shiftRank(b.shift_type))
    .map(({ statuses, ...row }) => ({ ...row, status: worstStatus(statuses) }));
}

/**
 * What still needs filling that day.
 * - staff: a unit/shift with fewer people than required.
 * - rn: the shift has fewer RNs than the rule requires (reported once per shift,
 *   because the RN count is for the whole facility).
 * Items with no census (status "unknown") are skipped: there is nothing to fill.
 */
export function toFillList(info) {
  const out = [];
  const rnByShift = {};
  ((info && info.items) || []).forEach((it, idx) => {
    if (it.status === "unknown") return;
    const need = num(it.required) - num(it.assigned);
    if (need > 0) {
      out.push({
        key: `staff-${idx}`,
        kind: "staff",
        unit_id: it.unit_id ?? null,
        unit_name: it.unit_name || "",
        shift_type: it.shift_type || "day",
        shift_label: it.shift_label || SHIFT_NAME[it.shift_type] || "",
        need,
      });
    }
    if (it.required_rn != null) {
      const rnNeed = num(it.required_rn) - num(it.rn_scheduled);
      const seen = rnByShift[it.shift_type];
      if (rnNeed > 0 && (!seen || rnNeed > seen.need)) {
        rnByShift[it.shift_type] = {
          key: `rn-${it.shift_type}`,
          kind: "rn",
          unit_id: it.unit_id ?? null,
          unit_name: it.unit_name || "",
          shift_type: it.shift_type || "day",
          shift_label: it.shift_label || SHIFT_NAME[it.shift_type] || "",
          need: rnNeed,
        };
      }
    }
  });
  return [...out, ...Object.values(rnByShift)].sort(
    (a, b) => shiftRank(a.shift_type) - shiftRank(b.shift_type) || (a.kind === "rn") - (b.kind === "rn")
  );
}

/** The earliest ISO date in `coverage.days` whose overall status matches, or null. */
export function firstDayWithStatus(coverage, status) {
  const days = (coverage && coverage.days) || {};
  const hit = Object.keys(days)
    .filter((iso) => days[iso] && days[iso].status === status)
    .sort()[0];
  return hit || null;
}
