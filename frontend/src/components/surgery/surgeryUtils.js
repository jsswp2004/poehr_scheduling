// Pure helpers for the Surgery pages: status colours, the Day Planner's time maths and date handling.

/** Colours follow the Day Planner legend: each status keeps one colour in the list rows, the bars and the legend. */
export const STATUS_META = {
  pending: { label: "Pending", bg: "#ffffff", fg: "#0f172a", border: "#94a3b8" },
  preop: { label: "In PreOp", bg: "#bbf7d0", fg: "#14532d", border: "#16a34a" },
  or: { label: "In OR", bg: "#1d4ed8", fg: "#ffffff", border: "#1e3a8a" },
  pacu: { label: "In PACU", bg: "#e9d5ff", fg: "#581c87", border: "#9333ea" },
  discharged: { label: "Discharged", bg: "#e7e5e4", fg: "#44403c", border: "#a8a29e" },
  cancelled: { label: "Procedure Cancelled", bg: "#64748b", fg: "#ffffff", border: "#334155" },
  transferred: { label: "Transferred to Inpatient", bg: "#fef3c7", fg: "#78350f", border: "#d97706" },
};

/** The order the legend lists them in. */
export const LEGEND_ORDER = ["discharged", "cancelled", "transferred", "pending", "preop", "or", "pacu"];

/** What the button for moving a case into each status says. */
export const ACTION_LABELS = {
  preop: "Start PreOp",
  or: "Patient In OR",
  pacu: "Move to PACU",
  discharged: "Discharge",
  transferred: "Transfer to Inpatient",
  cancelled: "Cancel Case",
};

export const MILESTONES = [
  { key: "preop_start", label: "PreOp Start" },
  { key: "ready_for_or", label: "Ready for OR" },
  { key: "preop_end", label: "PreOp End" },
  { key: "patient_in", label: "Patient In Room" },
  { key: "procedure_start", label: "Procedure Start" },
  { key: "procedure_end", label: "Procedure End" },
  { key: "patient_out", label: "Patient Out of Room" },
  { key: "pacu_start", label: "PACU Start" },
  { key: "discharged_at", label: "Discharged" },
];

export const LATERALITY = [
  { value: "", label: "None" },
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
  { value: "bilateral", label: "Bilateral" },
  { value: "na", label: "Non Applicable" },
];

export const CASE_TYPES = [
  { value: "elective", label: "Elective" },
  { value: "urgent", label: "Urgent" },
  { value: "emergent", label: "Emergent" },
];

const pad = (n) => String(n).padStart(2, "0");

/** Today as YYYY-MM-DD in the browser's own time zone. */
export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** "2026-11-03" plus or minus whole days. */
export const shiftDay = (iso, days) => {
  const [y, m, d] = iso.split("-").map(Number);
  const out = new Date(Date.UTC(y, m - 1, d + days));
  return `${out.getUTCFullYear()}-${pad(out.getUTCMonth() + 1)}-${pad(out.getUTCDate())}`;
};

/** "11-03-2026", the way the Case List shows dates. */
export const usDate = (iso) => {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${m}-${d}-${y}`;
};

/** "7 am", "12 pm", "12 am" for the planner's hour ruler. */
export const hourLabel = (h) => {
  const hour = h % 24;
  const suffix = hour < 12 ? "am" : "pm";
  return `${hour % 12 === 0 ? 12 : hour % 12} ${suffix}`;
};

/**
 * Minutes since midnight of `date` for a local ISO time such as "2026-11-03T08:30-05:00".
 * Read from the text itself so the browser's time zone cannot shift it; a time on another day
 * clamps to the start or end of this one.
 */
export const minutesOfDay = (iso, date) => {
  const day = iso.slice(0, 10);
  if (day > date) return 1440;
  if (day < date) return 0;
  return Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16));
};

/** Where a bar sits on the planner, as percentages of the visible hours. */
export const barGeometry = (bar, date, dayStart, dayEnd) => {
  const span = (dayEnd - dayStart) * 60;
  const from = Math.max(minutesOfDay(bar.scheduled_start, date) - dayStart * 60, 0);
  const to = Math.min(minutesOfDay(bar.scheduled_end, date) - dayStart * 60, span);
  return { left: (from / span) * 100, width: Math.max(((to - from) / span) * 100, 0.8) };
};

/** Give each bar a lane so cases that overlap in one room are drawn one above the other. */
export const assignLanes = (bars) => {
  const sorted = [...bars].sort((a, b) => (a.scheduled_start < b.scheduled_start ? -1 : a.scheduled_start > b.scheduled_start ? 1 : a.id - b.id));
  const laneEnds = [];
  const placed = sorted.map((bar) => {
    let lane = laneEnds.findIndex((end) => end <= bar.scheduled_start);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = bar.scheduled_end;
    return { ...bar, lane };
  });
  return { bars: placed, lanes: Math.max(laneEnds.length, 1) };
};

/** "HH:MM" from a local ISO time, blank when there is none. */
export const clock = (iso) => (iso ? iso.slice(11, 16) : "");

/** The value a datetime-local input wants ("2026-11-03T08:30") from a local ISO time. */
export const toInputValue = (iso) => (iso ? iso.slice(0, 16) : "");

/** What to send for a case's start: the server reads it in its own time zone. */
export const startValue = (date, time) => `${date}T${time}`;

/** Case List search box: matches name, MRN, case ID, procedures. */
export const matchesSearch = (row, text) => {
  const term = text.trim().toLowerCase();
  if (!term) return true;
  return [row.patient.name, row.patient.mrn, String(row.case_number), row.procedures_text, row.service, row.surgeon?.name]
    .filter(Boolean)
    .some((v) => String(v).toLowerCase().includes(term));
};

/** "BASCOM, MARK B" in the list; the first line of a patient's name in capitals like the source screens. */
export const displayName = (name) => (name || "").toUpperCase();

/** Statuses a case cannot leave; the Status Board can hide them so only live cases show. */
export const DONE_STATUSES = ["discharged", "cancelled", "transferred"];

/** Text sizes for the Status Board's seven "A" buttons, smallest to largest (the fourth is the default). */
export const BOARD_FONT_SIZES = [12, 14, 16, 20, 26, 34, 44];

export const BOARD_NAME_MODES = [
  { value: "full", label: "Full name" },
  { value: "last_initial", label: "Last name, first initial" },
  { value: "initials", label: "Initials only" },
];

/**
 * A patient's name as a wall display should show it. The board can sit where visitors see it, so it
 * can cut the name down: "Bascom, Mark B" becomes "BASCOM, M." or "M.B.".
 */
export const boardName = (name, mode = "full") => {
  const text = (name || "").trim();
  if (!text || mode === "full") return text.toUpperCase();
  const [last = "", rest = ""] = text.split(",").map((part) => part.trim());
  const first = rest.split(/\s+/)[0] || "";
  if (mode === "initials") return `${first.charAt(0)}.${last.charAt(0)}.`.toUpperCase();
  return first ? `${last}, ${first.charAt(0)}.`.toUpperCase() : last.toUpperCase();
};

/** The rows the board shows: in time order, optionally without cases that are finished. */
export const boardRows = (rows, hideDone) =>
  [...rows]
    .filter((r) => !hideDone || !DONE_STATUSES.includes(r.status))
    .sort((a, b) => (a.scheduled_start < b.scheduled_start ? -1 : a.scheduled_start > b.scheduled_start ? 1 : a.id - b.id));

/** Minutes as "2:36" (hours and minutes), the way the case header shows durations and delays. */
export const hoursMinutes = (minutes) => {
  if (minutes === null || minutes === undefined || minutes === "") return "";
  const m = Math.max(Number(minutes) || 0, 0);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
};

/** "11-03-2026 08:02" for a timestamp, or "" when it is not set. */
export const usDateTime = (iso) => (iso ? `${usDate(iso)} ${clock(iso)}` : "");

export const DOC_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg"];
export const DOC_MAX_BYTES = 10 * 1024 * 1024;

/** Why a file cannot be uploaded, or "" when it can (the server checks again). */
export const documentProblem = (file) => {
  if (!file) return "Choose a file.";
  const name = (file.name || "").toLowerCase();
  if (!DOC_EXTENSIONS.some((e) => name.endsWith(e))) return "Only PDF, PNG and JPEG files can be uploaded.";
  if (file.size === 0) return "That file is empty.";
  if (file.size > DOC_MAX_BYTES) return "That file is larger than 10 MB.";
  return "";
};

/** 1536 -> "1.5 KB" */
export const fileSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};
