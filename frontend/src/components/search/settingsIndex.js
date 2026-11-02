import { ADMIN_TOOLS } from "../../hooks/admin/adminTools";
import { moduleEnabled } from "../../utils/orgModules";
import { MODULE_LINKS, linkTarget } from "../../utils/moduleLinks";

// Every tab of the Settings page. `words` are what people call it, so they can find it by those too.
// The Settings page is part of the clinical and scheduling services; a Staffing-only clinic has no Settings page.
const SETTINGS_MODULES = ["scheduling", "clinical_documentation", "patient_portal", "registration", "communicator", "telehealth", "dictation", "lab_interface"];
const STAFF_ROLES = ["admin", "system_admin", "doctor", "nurse", "registrar"];
const ADMIN_ROLES = ["admin", "system_admin"];

export const SETTINGS = [
  { id: "maintenance", module: "scheduling", label: "Schedule Maintenance", description: "Provider schedules and availability", words: "provider hours calendar slots working days time off" },
  { id: "env", label: "Environment Profile", description: "How this clinic's environment is set up", words: "environment clinic profile site" },
  { id: "uploads", module: "scheduling", label: "Uploads / Downloads", description: "Upload and download clinic files", words: "upload download import export file csv" },
  { id: "patient-header", module: "clinical_documentation", label: "Patient Header", description: "Items shown on the patient banner", words: "banner allergies code status header items" },
  { id: "tab-management", module: "clinical_documentation", label: "Tab Management", description: "Which chart tabs show, and in what order", words: "chart tabs order hide show layout default tab" },
  { id: "referrals", module: "clinical_documentation", label: "Referrals", description: "Overdue timers for referrals", words: "referral overdue timer" },
  { id: "tasks", module: "clinical_documentation", label: "Tasks", description: "Timing rules and medication pass times", words: "task timing rules medication pass times mar schedule" },
  { id: "dictation", label: "Dictation", description: "Speech-to-text for notes, AI cleanup", words: "speech voice transcribe enable dictation ai cleanup", module: "dictation" },
].map((s) => ({ ...s, group: "setting", where: `Settings › ${s.label}`, path: `/settings?tab=${s.id}` }));

// The pages of the Staffing module, and each standard report. Staffing-only clinics are served by these.
const STAFFING_PAGES = [
  { id: "calendar", label: "Calendar", description: "Who works when, by day", words: "schedule shifts coverage month week", path: "/staffing?tab=calendar" },
  { id: "master", label: "Master Schedule", description: "Month view of the whole schedule", words: "master monthly print", path: "/staffing?tab=master" },
  { id: "roster", label: "Roster", description: "Staff names, roles, contact and messaging", words: "staff employees people nurses cna lpn rn phone email", path: "/staffing?tab=roster" },
  { id: "assign", label: "Assign Schedule", description: "Give staff shifts and repeating patterns", words: "assign shift pattern recurring", path: "/staffing?tab=assign", admin: true },
  { id: "units", label: "Units & Census", description: "Units, beds and the daily census", words: "unit census beds hppd shift pattern 8 hour 12 hour", path: "/staffing?tab=units" },
  { id: "timeoff", label: "Time Off", description: "Time-off requests and emergency call-outs", words: "vacation leave sick callout call out pto cover", path: "/staffing?tab=timeoff" },
  { id: "upload", label: "Upload CSV", description: "Load staff, schedules or the master schedule from a file", words: "import csv spreadsheet", path: "/staffing?tab=upload", admin: true },
  { id: "reports", label: "Reports", description: "Staffing reports", words: "report export print pdf", path: "/staffing?tab=reports" },
  { id: "rules", label: "Staffing Standards", description: "Required hours and ratios per unit", words: "standards rules hppd ratio requirement coverage", path: "/staffing?tab=rules" },
  { id: "report-coverage_compliance", label: "Coverage compliance", description: "Each unit and shift checked against its standard", words: "report compliance understaffed", path: "/staffing?tab=reports&report=coverage_compliance" },
  { id: "report-schedule", label: "Schedule report", description: "Every scheduled shift in a date range", words: "report shifts export", path: "/staffing?tab=reports&report=schedule" },
  { id: "report-daily_forms", label: "Daily staffing forms", description: "Printable daily forms with unit beds and census", words: "report daily form print", path: "/staffing?tab=reports&report=daily_forms" },
  { id: "report-unscheduled", label: "Staff with no schedule", description: "Active staff with no shifts in the range", words: "report unscheduled no shifts", path: "/staffing?tab=reports&report=unscheduled" },
  { id: "report-labor_hours", label: "Labor hours", description: "Scheduled hours for each person", words: "report hours overtime", path: "/staffing?tab=reports&report=labor_hours" },
  { id: "report-shift_distribution", label: "Shift-type distribution", description: "Day, evening, night and custom shifts per person", words: "report nights weekends distribution", path: "/staffing?tab=reports&report=shift_distribution" },
  { id: "report-subscriptions", label: "Report subscriptions", description: "Reports emailed on a schedule", words: "report subscribe email schedule automatic", path: "/staffing?tab=reports&report=subscriptions" },
  { id: "report-message_log", label: "Message delivery log", description: "Texts and emails sent to staff and whether delivered", words: "report sms text email reminders delivered", path: "/staffing?tab=reports&report=message_log" },
].map((p) => ({ ...p, group: "staffing", where: p.id.startsWith("report-") ? "Staffing › Reports" : `Staffing › ${p.label}` }));

// Every module's own page, from the same list the header icons use, so each only shows for the services the clinic has.
const PAGE_WORDS = {
  "check-in": "arrive arrived front desk",
  patients: "patient list census ed board chart",
  documentation: "notes documents charting",
  scheduler: "appointments calendar booking",
  team: "colleagues coworkers providers",
  register: "registration admit new patient",
  portal: "patient portal dashboard",
  staffing: "staff schedule shifts roster",
  telehealth: "video visit call",
  dictate: "dictation voice speech",
  "lab-inbox": "lab results labs review",
  "secure-messages": "messages secure chat inbox",
  "secure-audit": "audit log messages",
};
const EXTRA_PAGES = [
  { id: "page-reports", label: "Reports", words: "reports analytics custom export", path: "/reports", roles: STAFF_ROLES },
  { id: "page-communicator", label: "Communicator", words: "sms text email announcements messages patients", path: "/communicator", roles: ["admin", "system_admin", "registrar"], module: "communicator" },
  { id: "page-management", label: "Management Portal", words: "admin tools builders", path: "/admin/", roles: ADMIN_ROLES },
  { id: "page-account", label: "Account Settings", words: "account plan billing subscription", path: "/account", roles: ADMIN_ROLES },
];

export function pageEntries(role) {
  const fromNav = MODULE_LINKS.filter((m) => (!m.roles || m.roles.includes(role)) && !(m.notFor && m.notFor.includes(role)) && moduleEnabled(m.module)).map((m) => ({
    id: `page-${m.key}`, label: m.label, words: PAGE_WORDS[m.key] || "", path: linkTarget(m, moduleEnabled("clinical_documentation")),
  }));
  const extra = EXTRA_PAGES.filter((p) => p.roles.includes(role) && moduleEnabled(p.module));
  return [...fromNav, ...extra].map((p) => ({ ...p, description: "Open this page", group: "page", where: "Go to" }));
}

// Plain words people use for the portal tools.
const TOOL_WORDS = {
  calendar: "schedule today appointments",
  search: "appointment find",
  messages: "message inbox sms email",
  "check-in": "arrive arrived front desk",
  "note-builder": "note template notes form",
  "flowsheet-builder": "flowsheet vitals rows rules table grid",
  "status-board-builder": "board ed status columns",
  "order-builder": "order set orders",
  "triage-settings": "triage esi scale prompts",
  "location-manager": "location facility unit room bed",
  settings: "clinic preferences",
  "organization-access": "plan users rights access services organization billing subscription",
  "system-dictionaries": "dropdown list lookup choices roles",
  profile: "account password picture",
};

export function toolEntries(role) {
  return ADMIN_TOOLS.filter((t) => t.requiredRoles.includes(role) && moduleEnabled(t.module))
    .filter((t) => t.id !== "settings") // its tabs are listed one by one
    .map((t) => ({ id: `tool-${t.id}`, label: t.label, description: t.description, words: TOOL_WORDS[t.id] || "", group: "tool", where: "Management Portal", path: t.path }));
}

const norm = (text) => String(text || "").toLowerCase();

// Staffing pages, settings and tools whose name, description or usual words contain every word typed, best first.
// Staffing pages are for anyone who can open the Staffing module; settings and tools are for administrators.
export function findSettings(query, role, { limit = 5 } = {}) {
  const admin = ADMIN_ROLES.includes(role);
  if (!STAFF_ROLES.includes(role)) return [];
  const words = norm(query).split(/[\s,;]+/).filter(Boolean);
  if (!words.length || words.join("").length < 2) return [];
  const pool = [];
  pool.push(...pageEntries(role));
  if (moduleEnabled("staffing")) pool.push(...STAFFING_PAGES.filter((p) => admin || !p.admin));
  if (admin && moduleEnabled(SETTINGS_MODULES)) pool.push(...SETTINGS.filter((s) => moduleEnabled(s.module)));
  if (admin) pool.push(...toolEntries(role));
  const scored = [];
  pool.forEach((entry) => {
    const label = norm(entry.label);
    const hay = `${label} ${norm(entry.description)} ${norm(entry.words)} ${norm(entry.where)}`;
    if (!words.every((w) => hay.includes(w))) return;
    const rank = words.every((w) => label.startsWith(w) || label.includes(` ${w}`)) ? 0 : words.every((w) => label.includes(w)) ? 1 : 2;
    scored.push({ rank, entry });
  });
  scored.sort((a, b) => a.rank - b.rank || a.entry.label.localeCompare(b.entry.label));
  const out = { page: [], staffing: [], setting: [], tool: [] };
  const best = {};
  scored.forEach(({ rank, entry }) => {
    if (out[entry.group].length < limit) out[entry.group].push(entry);
    best[entry.group] = Math.min(best[entry.group] ?? 9, rank);
  });
  // the group holding the best match comes first; ties keep Go to, Staffing, Settings, Tools
  const order = ["page", "staffing", "setting", "tool"].filter((g) => out[g].length).sort((a, b) => best[a] - best[b]);
  return order.flatMap((g) => out[g]).map((e) => ({ ...e, type: "setting", rowKey: `x${e.id}` }));
}
