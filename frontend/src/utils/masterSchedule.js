// Date math and colours for the Staffing > Master Schedule grid.
// Everything is done in UTC so daylight-saving changes can never shift a day.
// Weekdays follow Python/Django: Monday = 0 ... Sunday = 6 (what the API stores).

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const WEEKDAY_OPTIONS = [
  { value: 0, label: "Monday" },
  { value: 1, label: "Tuesday" },
  { value: 2, label: "Wednesday" },
  { value: 3, label: "Thursday" },
  { value: 4, label: "Friday" },
  { value: 5, label: "Saturday" },
  { value: 6, label: "Sunday" },
];

// Header letters exactly as the paper sheet writes them.
export const DAY_LETTERS = ["M", "T", "W", "TH", "F", "S", "S"];

// Colours taken from the paper template: the first day of the work week is
// light orange; weekends alternate tan / light green from one week to the next.
export const WEEK_START_COLOR = "#FDEADA";
export const WEEKEND_COLORS = ["#EEECE1", "#EBF1DE"];

const DAY_MS = 86400000;
// A Thursday. Week parity is counted from here so a given date always gets the
// same weekend colour, whichever month is on screen.
const ANCHOR_UTC = Date.UTC(2026, 0, 1);

const pad = (n) => String(n).padStart(2, "0");

export const isoOf = (utcMs) => {
  const d = new Date(utcMs);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

const weekdayOf = (utcMs) => (new Date(utcMs).getUTCDay() + 6) % 7;

/**
 * Every day shown for a month: from the work-week start on or before the 1st
 * through the end of the work week that contains the last day.
 * month is 0-11. Each entry: { iso, day, dow, inMonth, isWeekStart, isWeekend, color }.
 */
export function gridDays(year, month, weekStart) {
  const first = Date.UTC(year, month, 1);
  const last = Date.UTC(year, month + 1, 0);
  const back = (weekdayOf(first) - weekStart + 7) % 7;
  const weekEndDow = (weekStart + 6) % 7;
  const forward = (weekEndDow - weekdayOf(last) + 7) % 7;
  const out = [];
  for (let t = first - back * DAY_MS; t <= last + forward * DAY_MS; t += DAY_MS) {
    const dow = weekdayOf(t);
    const sinceWeekStart = (dow - weekStart + 7) % 7;
    const weekStartMs = t - sinceWeekStart * DAY_MS;
    const parity = ((Math.floor((weekStartMs - ANCHOR_UTC) / (7 * DAY_MS)) % 2) + 2) % 2;
    const isWeekStart = sinceWeekStart === 0;
    const isWeekend = dow >= 5;
    let color = "";
    if (isWeekStart) color = WEEK_START_COLOR;
    else if (isWeekend) color = WEEKEND_COLORS[parity];
    const d = new Date(t);
    out.push({
      iso: isoOf(t),
      day: d.getUTCDate(),
      dow,
      inMonth: d.getUTCMonth() === month,
      isWeekStart,
      isWeekend,
      color,
    });
  }
  return out;
}
