// Pure helpers for the Triage Settings screen: turn the server's numbers into text boxes and back, with the same checks the server makes.

export const LEVELS = [1, 2, 3, 4, 5];
export const LEVEL_TITLES = { 1: "Resuscitation", 2: "Emergent", 3: "Urgent", 4: "Less urgent", 5: "Non-urgent" };

export const FEVER_FIELDS = [
  { key: "neonate_days", label: "Newborn: up to this age (days)", unit: "days" },
  { key: "fever_c", label: "Newborn and young infant: fever over (C)", unit: "C" },
  { key: "infant_months", label: "Young infant: up to this age (months)", unit: "months" },
  { key: "older_high_c", label: "Older child: fever over (C)", unit: "C" },
  { key: "older_low_c", label: "Older child: low temperature under (C)", unit: "C" },
];

const isNum = (v, low, high) => v !== "" && v !== null && v !== undefined && Number.isFinite(Number(v)) && Number(v) >= low && Number(v) <= high;
const text = (v) => (v === null || v === undefined ? "" : String(v));

// ---- recheck times ----
export const gapsToDraft = (minutes) => Object.fromEntries(LEVELS.map((n) => [n, text((minutes || {})[String(n)])]));

/** {value: {"3": 60, ...}, problem}: blanks mean "no recheck time for this level". */
export function gapsFromDraft(draft) {
  const out = {};
  for (const n of LEVELS) {
    const raw = String((draft || {})[n] ?? "").trim();
    if (raw === "") continue;
    if (!isNum(raw, 1, 1440) || !Number.isInteger(Number(raw))) return { value: null, problem: `ESI ${n}: enter whole minutes from 1 to 1440, or leave it blank.` };
    out[String(n)] = Number(raw);
  }
  return { value: out, problem: "" };
}

// ---- age table ----
export const zoneToDraft = (zone) => ({
  bands: (zone?.bands || []).map((b) => ({ max: text(b.max_months), hr: text(b.hr_over), rr: text(b.rr_over) })),
  spo2: text(zone?.spo2_below),
});

/** The start of each band in months: 0, then the end of the one before. */
export const bandStarts = (draft) => draft.bands.map((_b, i) => (i === 0 ? 0 : Number(draft.bands[i - 1].max)));

/** {value: zone for the server, problem}. */
export function zoneFromDraft(draft) {
  const bands = draft?.bands || [];
  if (bands.length === 0) return { value: null, problem: "Add at least one age band." };
  const out = [];
  let start = 0;
  for (let i = 0; i < bands.length; i++) {
    const b = bands[i];
    const last = i === bands.length - 1;
    if (!isNum(b.hr, 20, 400)) return { value: null, problem: `Band ${i + 1}: heart rate limit must be a number from 20 to 400.` };
    if (!isNum(b.rr, 5, 150)) return { value: null, problem: `Band ${i + 1}: respiratory rate limit must be a number from 5 to 150.` };
    let top = null;
    if (!last) {
      if (!isNum(b.max, 0, 1500) || Number(b.max) <= start) return { value: null, problem: `Band ${i + 1}: the upper age must be a number of months greater than ${start}.` };
      top = Number(b.max);
    }
    out.push({ min_months: start, max_months: top, hr_over: Number(b.hr), rr_over: Number(b.rr) });
    start = top;
  }
  if (!isNum(draft.spo2, 50, 100)) return { value: null, problem: "The oxygen saturation limit must be a number from 50 to 100." };
  return { value: { bands: out, spo2_below: Number(draft.spo2) }, problem: "" };
}

/** A new last band: the old last band gets an upper age (12 months more than its start) and the new one copies its limits. */
export function addBand(draft) {
  const starts = bandStarts(draft);
  const lastIndex = draft.bands.length - 1;
  if (lastIndex < 0) return { ...draft, bands: [{ max: "", hr: "", rr: "" }] };
  const last = draft.bands[lastIndex];
  const top = (Number.isFinite(starts[lastIndex]) ? starts[lastIndex] : 0) + 12;
  const bands = draft.bands.map((b, i) => (i === lastIndex ? { ...b, max: String(top) } : b));
  bands.push({ max: "", hr: last.hr, rr: last.rr });
  return { ...draft, bands };
}

/** Takes the last band away; the one before it becomes "and older". */
export function removeLastBand(draft) {
  if (draft.bands.length <= 1) return draft;
  const bands = draft.bands.slice(0, -1);
  bands[bands.length - 1] = { ...bands[bands.length - 1], max: "" };
  return { ...draft, bands };
}

// ---- fever ----
export const feverToDraft = (fever) => Object.fromEntries(FEVER_FIELDS.map((f) => [f.key, text((fever || {})[f.key])]));

export function feverFromDraft(draft) {
  const out = {};
  for (const f of FEVER_FIELDS) {
    const raw = String((draft || {})[f.key] ?? "").trim();
    if (!isNum(raw, 0, 120)) return { value: null, problem: `${f.label}: enter a number.` };
    out[f.key] = Number(raw);
  }
  return { value: out, problem: "" };
}

// ---- suicide screen age ----
/** {value: whole years or null (blank = use 18), problem}. */
export function ageFromText(raw) {
  const s = String(raw ?? "").trim();
  if (s === "") return { value: null, problem: "" };
  if (!isNum(s, 0, 18) || !Number.isInteger(Number(s))) return { value: null, problem: "Enter whole years from 0 to 18, or leave it blank for 18." };
  return { value: Number(s), problem: "" };
}

/** "Your clinic's table, approved by Dana Lee on Oct 20, 2026." / "Built-in table." */
export function sourceLine(isClinic, clinic) {
  if (!isClinic) return "Using the built-in table.";
  const who = clinic?.approved_by ? ` approved by ${clinic.approved_by}` : "";
  const when = clinic?.approved_at && !Number.isNaN(new Date(clinic.approved_at).getTime())
    ? ` on ${new Date(clinic.approved_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : "";
  return `Your clinic's own numbers${who}${when}.`;
}
