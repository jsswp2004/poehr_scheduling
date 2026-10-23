// Pure helpers for the Team page: names, roles, phone and "last active" text, and who can be texted.

export const ROLE_LABELS = {
  doctor: "Doctor",
  nurse: "Nurse",
  registrar: "Registrar",
  receptionist: "Receptionist",
  admin: "Admin",
  system_admin: "System admin",
  staff: "Staff",
  none: "Team member",
};

export const roleLabel = (role) =>
  ROLE_LABELS[role] || (role ? String(role).replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "Team member");

const ROLE_COLORS = {
  doctor: ["#e0e7ff", "#3730a3"],
  nurse: ["#dcfce7", "#166534"],
  registrar: ["#fef3c7", "#92400e"],
  receptionist: ["#fce7f3", "#9d174d"],
  admin: ["#e2e8f0", "#1e293b"],
  system_admin: ["#e2e8f0", "#1e293b"],
};
export const roleColors = (role) => ROLE_COLORS[role] || ["#eef1f6", "#3b4556"];

// The filter chips. "value" is what the server's role parameter expects.
export const TEAM_FILTERS = [
  { value: "all", label: "All" },
  { value: "doctor", label: "Doctors" },
  { value: "nurse", label: "Nurses" },
  { value: "registrar", label: "Registrars" },
  { value: "admin", label: "Admins" },
  { value: "other", label: "Other" },
];

export const memberName = (m) =>
  m?.full_name || [m?.first_name, m?.last_name].filter(Boolean).join(" ") || m?.username || "Unknown user";

export const initials = (name) =>
  String(name || "")
    .replace(/^Dr\.?\s+/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("") || "?";

const AVATAR_COLORS = ["#2563eb", "#7c3aed", "#0891b2", "#c2410c", "#be185d", "#4d7c0f", "#0f766e", "#475569"];
export const avatarColor = (id) => AVATAR_COLORS[Math.abs(Number(id) || 0) % AVATAR_COLORS.length];

// "3015550142" -> "(301) 555-0142"; anything else is shown as it was entered; empty -> "".
export function phoneText(phone) {
  const raw = String(phone || "").trim();
  if (!raw) return "";
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits[0] === "1") digits = digits.slice(1);
  if (digits.length === 10 && !raw.startsWith("+")) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return raw;
}

const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const clock = (d) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

// { text, online } for the Last active column.
export function lastActive(member, now = new Date()) {
  if (member?.is_online) return { text: "Active now", online: true };
  const seen = member?.last_seen ? new Date(member.last_seen) : null;
  if (!seen || Number.isNaN(seen.getTime())) return { text: "Not seen yet", online: false };
  const minutes = Math.floor((now - seen) / 60000);
  if (minutes < 1) return { text: "Just now", online: false };
  if (minutes < 60) return { text: `${minutes} min ago`, online: false };
  if (sameDay(seen, now)) {
    const hours = Math.floor(minutes / 60);
    return { text: `${hours} hour${hours === 1 ? "" : "s"} ago`, online: false };
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(seen, yesterday)) return { text: `Yesterday, ${clock(seen)}`, online: false };
  const sameYear = seen.getFullYear() === now.getFullYear();
  return {
    text: seen.toLocaleDateString("en-US", sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" }),
    online: false,
  };
}

// Texting is allowed when the person agreed to texts, has not opted out, and has a phone number.
// The server works this out (can_text); older responses fall back to consent plus a phone.
export function canText(member) {
  if (typeof member?.can_text === "boolean") return member.can_text;
  return !!(member?.sms_consent && String(member?.phone_number || "").trim());
}

// Why Text is turned off, for the tooltip. "" when it is on.
export function textBlockedReason(member) {
  if (canText(member)) return "";
  if (!String(member?.phone_number || "").trim()) return "No phone number on file";
  return `${member?.first_name || "This person"} has not agreed to receive texts`;
}

// "Showing 11-20 of 34"
export function rangeText(page, pageSize, total) {
  if (!total) return "No one to show";
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return `Showing ${start}-${end} of ${total}`;
}
