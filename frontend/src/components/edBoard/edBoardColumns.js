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
  { key: "bed_status", label: "Bed Status", width: 100 },
  { key: "inc_reg", label: "Inc Reg", width: 70 },
  { key: "gender", label: "Gender", width: 80 },
  { key: "reg_comp", label: "REG Comp", width: 90 },
  { key: "actions", label: "", width: 130 },
];

export const VIEWS = [
  { value: "all", label: "ED All View" },
  { value: "waiting", label: "Waiting" },
  { value: "mine", label: "My patients" },
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

/** Which rows a view shows. `meId` is the signed-in user. */
export const filterRows = (rows, view, meId) => {
  if (view === "waiting") return rows.filter((r) => r.type === "waiting");
  if (view === "mine")
    return rows.filter((r) => r.visit && (r.visit.rn?.id === meId || r.visit.md?.id === meId));
  return rows;
};
