// Pure helpers for the triage note form (no React), so they can be tested alone.

export const TRIAGE_CODE = "triage_note";
export const CHILD_SECTION = "Child details (under 18)";
export const SUICIDE_SECTION = "Suicide risk screen";
export const ESI_SECTION = "Triage level (ESI)";
const ADULT_FIRST_LOOK_KEYS = ["first_airway", "first_breathing", "first_circulation"];

/** The template with the parts that do not apply to this patient taken out (the ESI and suicide sections have their own panels). */
export function filterTemplate(template, ctx) {
  if (!template) return template;
  const child = !!ctx?.patient?.is_child;
  const fields = (template.fields || []).filter((f) => {
    if (f.section_label === ESI_SECTION || f.section_label === SUICIDE_SECTION) return false;
    if (f.section_label === CHILD_SECTION) return child;
    if (ADULT_FIRST_LOOK_KEYS.includes(f.key)) return !child;
    if (f.key === "last_menstrual_period") return ctx?.patient?.sex !== "male";
    return true;
  });
  return { ...template, fields };
}

const yes = (v) => String(v ?? "").toLowerCase() === "yes";

/** 'none', 'referral' or 'immediate' from the saved screener answers (the same rule the server applies when signing). */
export function suicideAction(values) {
  const v = values || {};
  if (yes(v.cssrs_4) || yes(v.cssrs_5) || (yes(v.cssrs_6) && yes(v.cssrs_6_recent))) return "immediate";
  if (yes(v.cssrs_1) || yes(v.cssrs_2) || yes(v.cssrs_3) || yes(v.cssrs_6)) return "referral";
  return "none";
}

/** The ESI answers the suggestion call needs, from the note's saved values. */
export function answersFromValues(values) {
  const v = values || {};
  const resources = v.esi_resources;
  return {
    esi_a_life_saving: v.esi_a_life_saving || "",
    esi_b_high_risk: !!v.esi_b_high_risk,
    esi_b_confused: !!v.esi_b_confused,
    esi_b_severe_pain: !!v.esi_b_severe_pain,
    esi_resources: resources === undefined || resources === null ? "" : resources,
    child_immunizations: v.child_immunizations || "",
  };
}

export const LEVEL_NAMES = { 1: "Resuscitation", 2: "Emergent", 3: "Urgent", 4: "Less urgent", 5: "Non-urgent" };

/** Things the nurse still has to do before signing: [{label, done, blocking}]. The server checks the same ones when signing. */
export function checklist(values, ctx, suggestion) {
  const v = values || {};
  const vit = ctx?.vitals || {};
  const hasVitals = ["hr", "rr", "spo2", "temp_f", "sbp"].some((k) => vit[k] !== undefined && vit[k] !== null);
  const items = [
    { label: "Chief complaint", done: !!String(v.chief_complaint || "").trim(), blocking: true },
    { label: "Vital signs", done: hasVitals, blocking: true },
  ];
  if (ctx?.patient?.is_child) {
    const weight = Number(v.child_weight_kg) || vit.weight_kg;
    items.push({ label: "Child's weight in kg", done: !!weight && weight > 0, blocking: true });
  }
  const level = Number(v.esi_level);
  items.push({ label: "Triage level", done: level >= 1 && level <= 5, blocking: true });
  if (suggestion?.level && level >= 1 && level !== suggestion.level) {
    items.push({ label: "Reason for a level different from the suggestion", done: !!String(v.esi_override_reason || "").trim(), blocking: true });
  }
  items.push({ label: "Allergies confirmed with the patient", done: !!v.allergies_confirmed, blocking: false });
  items.push({ label: "Current medicines confirmed with the patient", done: !!v.medications_confirmed, blocking: false });
  return items;
}

export function fmtVital(key, value) {
  if (value === undefined || value === null) return "";
  if (key === "temp_f") return `${Number(value).toFixed(1)} F`;
  if (key === "spo2") return `${Math.round(value)}%`;
  if (key === "weight_kg") return `${value} kg`;
  return String(Math.round(value));
}


/** "BP 168/94, HR 112, RR 22, SpO2 94%, T 98.6 F, pain 8/10" from a saved set of vitals. */
export function vitalsText(vitals) {
  const v = vitals || {};
  const parts = [];
  if (v.sbp !== undefined || v.dbp !== undefined) parts.push(`BP ${v.sbp ?? "?"}/${v.dbp ?? "?"}`);
  if (v.hr !== undefined) parts.push(`HR ${v.hr}`);
  if (v.rr !== undefined) parts.push(`RR ${v.rr}`);
  if (v.spo2 !== undefined) parts.push(`SpO2 ${v.spo2}%`);
  if (v.temp_f !== undefined) parts.push(`T ${Number(v.temp_f).toFixed(1)} F`);
  if (v.pain !== undefined) parts.push(`pain ${v.pain}/10`);
  return parts.join(", ");
}

export const REASSESS_FIELDS = [
  { key: "sbp", label: "Systolic" }, { key: "dbp", label: "Diastolic" }, { key: "hr", label: "Heart rate" }, { key: "rr", label: "Resp. rate" },
  { key: "spo2", label: "SpO2 %" }, { key: "temp_f", label: "Temp F" }, { key: "pain", label: "Pain 0-10" },
];

/** The request body for a recheck from the form's text boxes; blank boxes are left out. */
export function reassessmentBody(form) {
  const vitals = {};
  REASSESS_FIELDS.forEach(({ key }) => {
    const raw = String(form?.[key] ?? "").trim();
    if (raw !== "") vitals[key] = raw;
  });
  const body = { vitals, change: String(form?.change ?? "").trim() };
  if (form?.level) body.level = form.level;
  return body;
}

/** Why the form cannot be saved yet, or "". Mirrors the server so the nurse hears it before pressing Save. */
export function reassessmentProblem(form, currentLevel) {
  const body = reassessmentBody(form);
  if (Object.keys(body.vitals).length === 0 && !body.change) return "Enter at least one vital sign or say what changed.";
  if (body.level && Number(body.level) !== Number(currentLevel) && !body.change) return "Say what changed, because the level is different now.";
  return "";
}

/** "Next recheck due 15:20" / "Overdue" / "" from a log. */
export function dueText(log, now = Date.now()) {
  if (!log?.due_at) return "";
  const due = new Date(log.due_at);
  if (Number.isNaN(due.getTime())) return "";
  if (due.getTime() <= now) return "Recheck overdue";
  return `Next recheck due ${due.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}`;
}

export const clock = (iso) => {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }) : "";
};
