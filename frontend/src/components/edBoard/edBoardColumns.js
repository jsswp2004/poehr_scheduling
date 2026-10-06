/**
 * The ED board is drawn from this list of columns, so the layout is data, not markup.
 * (A later step lets an admin edit it in a board builder; until then this is the
 * built-in layout.) `key` picks how the cell is drawn in EDBoard.
 */
export const DEFAULT_COLUMNS = [
  { key: "loc", label: "LOC", width: 80 },
  { key: "los", label: "LOS", width: 100 },
  { key: "patient", label: "Patient", width: 170 },
  { key: "age", label: "Age", width: 80 },
  { key: "reason", label: "Visit Reason", width: 130 },
  { key: "complaint", label: "Chief Complaint", width: 130 },
  { key: "esi", label: "ESI", width: 70 },
  { key: "status", label: "STS", width: 90 },
  { key: "md", label: "MD", width: 150 },
  { key: "rn", label: "RN", width: 150 },
  { key: "resident", label: "Resident", width: 120 },
  { key: "comments", label: "Comments", width: 190 },
  { key: "vitals", label: "Vitals", width: 110 },
  { key: "meds", label: "Meds", width: 60 },
  { key: "lab", label: "Lab", width: 60 },
  { key: "rad", label: "Rad", width: 60 },
  { key: "urine", label: "Urine", width: 60 },
  { key: "ekg", label: "EKG", width: 60 },
  { key: "cardiac", label: "Cardiac", width: 70 },
  { key: "bed_status", label: "Bed Status", width: 100 },
  { key: "inc_reg", label: "Inc Reg", width: 70 },
  { key: "gender", label: "Gender", width: 80 },
  { key: "reg_comp", label: "REG Comp", width: 90 },
  { key: "actions", label: "", width: 130 },
];

/** Order-status icon columns: the key matches what the server sends in `visit.orders`. */
export const ORDER_ICON_COLUMNS = { meds: "Meds", lab: "Lab", rad: "Radiology", urine: "Urine", ekg: "EKG", cardiac: "Cardiac" };

/** Vitals are overdue when the last set (or the arrival, if none yet) is this many minutes old. */
export const VITALS_OVERDUE_MINUTES = 60;

/** {minutes, overdue, charted}: how long since the last vitals; never charted counts from arrival. */
export const vitalsStatus = (visit, now = Date.now(), limit = VITALS_OVERDUE_MINUTES) => {
  const charted = !!visit.vitals_last_at;
  const minutes = losMinutes(charted ? visit.vitals_last_at : visit.arrival_time, now);
  return { minutes, charted, overdue: minutes >= limit };
};

/** Which column a color rule's field is shown in (for rules that color a single cell). */
export const RULE_COLUMN = { esi: "esi", ed_status: "status", vitals_overdue: "vitals", registration_complete: "reg_comp", sex: "gender" };

/** The value a rule's field has for this visit, as text ("true"/"false" for yes-no fields). */
const ruleValue = (field, visit, now, limit) => {
  if (field === "vitals_overdue") return String(vitalsStatus(visit, now, limit).overdue);
  if (field === "registration_complete") return String(!!visit.registration_complete);
  if (field === "esi") return visit.esi == null ? "" : String(visit.esi);
  if (field === "ed_status") return visit.ed_status || "";
  if (field === "sex") return visit.sex || "";
  const custom = visit.custom?.[field];
  return custom == null ? "" : String(custom);
};

export const ruleMatches = (rule, visit, now = Date.now(), limit = VITALS_OVERDUE_MINUTES) => {
  const same = ruleValue(rule.field, visit, now, limit) === String(rule.value);
  return rule.op === "neq" ? !same : same;
};

/** {row: color or undefined, cells: {columnKey: color}} from the first matching rule of each kind. */
export const ruleColors = (rules, visit, now = Date.now(), limit = VITALS_OVERDUE_MINUTES) => {
  const out = { row: undefined, cells: {} };
  if (!visit) return out;
  for (const rule of rules || []) {
    if (!ruleMatches(rule, visit, now, limit)) continue;
    if (rule.target === "cell") {
      const column = RULE_COLUMN[rule.field] || rule.field;
      if (!out.cells[column]) out.cells[column] = rule.color;
    } else if (!out.row) {
      out.row = rule.color;
    }
  }
  return out;
};

export const VIEWS = [
  { value: "all", label: "ED All View" },
  { value: "waiting", label: "Waiting Area" },
];

/** Whole minutes from `arrival` to `now` (never negative). */
export const losMinutes = (arrival, now = Date.now()) => {
  const start = new Date(arrival).getTime();
  if (Number.isNaN(start)) return 0;
  return Math.max(0, Math.floor((now - start) / 60000));
};

/** "38d 22:23" or, inside the first day, "05:12". */
export const formatLos = (minutes) => {
  const days = Math.floor(minutes / 1440);
  const hh = String(Math.floor((minutes % 1440) / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  return days > 0 ? `${days}d ${hh}:${mm}` : `${hh}:${mm}`;
};

/**
 * Which rows a view shows. `meId` is the signed-in user. A view limited to certain beds lists only those
 * beds (patients without a bed live in the Waiting Area view); with no beds chosen it lists every bed.
 */
export const filterRows = (rows, view, meId, beds = []) => {
  let list = rows;
  if (beds && beds.length > 0) list = list.filter((r) => r.type === "bed" && beds.includes(r.bed));
  if (view === "waiting") return list.filter((r) => r.type === "waiting");
  if (view === "mine") return list.filter((r) => r.visit && (r.visit.rn?.id === meId || r.visit.md?.id === meId));
  return list;
};
