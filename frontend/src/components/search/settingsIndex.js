import { ADMIN_TOOLS } from "../../hooks/admin/adminTools";
import { moduleEnabled } from "../../utils/orgModules";

// Every tab of the Settings page. `words` are what people call it, so they can find it by those too.
export const SETTINGS = [
  { id: "maintenance", label: "Schedule Maintenance", description: "Provider schedules and availability", words: "provider hours calendar slots working days time off" },
  { id: "env", label: "Environment Profile", description: "How this clinic's environment is set up", words: "environment clinic profile site" },
  { id: "uploads", label: "Uploads / Downloads", description: "Upload and download clinic files", words: "upload download import export file csv" },
  { id: "patient-header", label: "Patient Header", description: "Items shown on the patient banner", words: "banner allergies code status header items" },
  { id: "tab-management", label: "Tab Management", description: "Which chart tabs show, and in what order", words: "chart tabs order hide show layout default tab" },
  { id: "referrals", label: "Referrals", description: "Overdue timers for referrals", words: "referral overdue timer" },
  { id: "tasks", label: "Tasks", description: "Timing rules and medication pass times", words: "task timing rules medication pass times mar schedule" },
  { id: "dictation", label: "Dictation", description: "Speech-to-text for notes, AI cleanup", words: "speech voice transcribe enable dictation ai cleanup", module: "dictation" },
].map((s) => ({ ...s, group: "setting", where: `Settings › ${s.label}`, path: `/settings?tab=${s.id}` }));

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

// Settings and tools whose name, description or usual words contain every word typed, best first.
export function findSettings(query, role, { limit = 5 } = {}) {
  if (role !== "admin" && role !== "system_admin") return [];
  const words = norm(query).split(/[\s,;]+/).filter(Boolean);
  if (!words.length || words.join("").length < 2) return [];
  const pool = [...SETTINGS.filter((s) => moduleEnabled(s.module)), ...toolEntries(role)];
  const scored = [];
  pool.forEach((entry) => {
    const label = norm(entry.label);
    const hay = `${label} ${norm(entry.description)} ${norm(entry.words)}`;
    if (!words.every((w) => hay.includes(w))) return;
    const rank = words.every((w) => label.startsWith(w) || label.includes(` ${w}`)) ? 0 : words.every((w) => label.includes(w)) ? 1 : 2;
    scored.push({ rank, entry });
  });
  scored.sort((a, b) => a.rank - b.rank || a.entry.label.localeCompare(b.entry.label));
  const out = { setting: [], tool: [] };
  scored.forEach(({ entry }) => {
    if (out[entry.group].length < limit) out[entry.group].push(entry);
  });
  return [...out.setting, ...out.tool].map((e) => ({ ...e, type: "setting", rowKey: `x${e.id}` }));
}
