// Pure helpers for the Register page (Quick Register, public sign-up and the patients table).
// No React or network here so the rules can be tested on their own.

export const digitsOnly = (value) => String(value || "").replace(/\D/g, "");

export function formatPhone(value) {
  const d = digitsOnly(value).slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

// While typing, "03141972" becomes "03/14/1972".
export function formatDobInput(value) {
  const d = digitsOnly(value).slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

// "03/14/1972" or "1972-03-14" -> "1972-03-14"; null when it is not a real date in the past.
export function parseDob(text, today = new Date()) {
  const s = String(text || "").trim();
  let y, m, d;
  let match = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    [, m, d, y] = match;
  } else if ((match = s.match(/^(\d{4})-(\d{2})-(\d{2})$/))) {
    [, y, m, d] = match;
  } else {
    return null;
  }
  const year = Number(y), month = Number(m), day = Number(d);
  const date = new Date(Date.UTC(year, month - 1, day));
  const real = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  if (!real || year < 1900) return null;
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  if (date.getTime() > todayUtc) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// "1972-03-14" -> "03/14/1972"; anything else is returned as it came.
export function showDob(iso) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : iso || "--";
}

export const SEX_OPTIONS = [
  { value: "M", label: "Male" },
  { value: "F", label: "Female" },
  { value: "X", label: "Unspecified/Other" },
];

const ascii = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

// A login name for a patient who has no portal account yet, e.g. "tlwhitfield4821".
export function makeUsername(first, last, random = Math.random) {
  const base = `${ascii(first).slice(0, 1)}${ascii(last)}`.slice(0, 20) || "patient";
  return `${base}${String(Math.floor(random() * 9000) + 1000)}`;
}

const PASSWORD_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";

// Unguessable password for a patient with no portal login. Nobody sees it; they can use Forgot password later.
export function makePassword(length = 16, cryptoObj = typeof globalThis !== "undefined" ? globalThis.crypto : undefined) {
  const bytes = new Uint32Array(length);
  if (cryptoObj && cryptoObj.getRandomValues) cryptoObj.getRandomValues(bytes);
  else for (let i = 0; i < length; i += 1) bytes[i] = Math.floor(Math.random() * 4294967296);
  return Array.from(bytes, (b) => PASSWORD_CHARS[b % PASSWORD_CHARS.length]).join("");
}

// 0 = empty, 1 = weak, 2 = okay, 3 = good
export function passwordStrength(pw) {
  const p = String(pw || "");
  if (!p) return 0;
  let score = 0;
  if (p.length >= 6) score += 1;
  if (p.length >= 10) score += 1;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p)) score += 1;
  return Math.max(1, Math.min(3, score));
}

const EMAIL = /^\S+@\S+\.\S+$/;

// Staff Quick Register. Returns {field: message}; empty means valid.
export function validateStaff(f, { portalLogin = false } = {}) {
  const e = {};
  if (!String(f.first_name || "").trim()) e.first_name = "Enter the first name.";
  if (!String(f.last_name || "").trim()) e.last_name = "Enter the last name.";
  if (!f.dob) e.dob = "Enter the date of birth.";
  else if (!parseDob(f.dob)) e.dob = "Use MM/DD/YYYY, a real date in the past.";
  if (!f.legal_sex) e.legal_sex = "Choose a sex.";
  if (!String(f.email || "").trim()) e.email = "Enter an email address.";
  else if (!EMAIL.test(f.email.trim())) e.email = "Enter a full email address, like name@example.com.";
  if (f.phone_number && digitsOnly(f.phone_number).length !== 10) e.phone_number = "Enter all 10 digits.";
  if (portalLogin) {
    if (!f.username || f.username.trim().length < 3) e.username = "Username must be at least 3 characters.";
    if (!f.password || f.password.length < 6) e.password = "Password must be at least 6 characters.";
  }
  return e;
}

// Public sign-up. Needs the clinic name only when nobody is signed in.
export function validatePublic(f, { needsOrganization = false } = {}) {
  const e = {};
  if (needsOrganization && !String(f.organization_name || "").trim()) e.organization_name = "Enter the clinic name.";
  if (!String(f.first_name || "").trim()) e.first_name = "Enter your first name.";
  if (!String(f.last_name || "").trim()) e.last_name = "Enter your last name.";
  if (!String(f.email || "").trim()) e.email = "Enter your email address.";
  else if (!EMAIL.test(f.email.trim())) e.email = "Enter a full email address, like name@example.com.";
  if (f.has_provider === "no" && digitsOnly(f.phone_number).length !== 10) e.phone_number = "Enter your 10-digit phone number so we can reach you.";
  else if (f.phone_number && digitsOnly(f.phone_number).length !== 10) e.phone_number = "Enter all 10 digits.";
  if (!f.password || f.password.length < 6) e.password = "Password must be at least 6 characters.";
  return e;
}

const SERVER_FIELD = { username: "username", email: "email", password: "password", phone_number: "phone_number", first_name: "first_name", last_name: "last_name", organization_name: "organization_name" };

// {"email": ["Enter a valid email."]} -> {email: "Enter a valid email."}; unknown fields go to _form.
// `rename` maps a server field to the field the person sees (public sign-up has no username box).
export function mapServerErrors(data, rename = {}) {
  const out = {};
  if (!data || typeof data !== "object") return out;
  Object.keys(data).forEach((key) => {
    const raw = data[key];
    const text = Array.isArray(raw) ? raw.filter((x) => typeof x === "string").join(" ") : typeof raw === "string" ? raw : "";
    if (!text) return;
    const field = rename[key] || SERVER_FIELD[key];
    if (field) out[field] = out[field] ? `${out[field]} ${text}` : text;
    else out._form = out._form ? `${out._form} ${text}` : key === "detail" || key === "message" || key === "error" ? text : `${key}: ${text}`;
  });
  return out;
}

export const isUsernameTaken = (data) => !!(data && data.username);

// Whether a possible duplicate from the search is close enough to show: same last name, first name starts alike.
export function isPossibleMatch(candidate, first, last) {
  const cf = String(candidate?.first_name || "").trim().toLowerCase();
  const cl = String(candidate?.last_name || "").trim().toLowerCase();
  const f = String(first || "").trim().toLowerCase();
  const l = String(last || "").trim().toLowerCase();
  if (!cf || !cl || !f || !l) return false;
  return cl === l && (cf === f || cf.startsWith(f.slice(0, 3)) || f.startsWith(cf.slice(0, 3)));
}

export const CARE_SETTING_LABEL = { ambulatory: "Ambulatory", emergency: "ED", acute: "Inpatient" };

// What the Visit column shows: an open visit with where it is, or "No open visit".
export function visitStatus(patient) {
  const v = patient?.current_visit;
  if (v && !v.discharge_datetime) {
    return { open: true, label: CARE_SETTING_LABEL[v.care_setting] || "Open visit", detail: v.visit_number || "" };
  }
  return { open: false, label: "No open visit", detail: "" };
}

// Turns what was typed in the table's search box into API params.
export function patientSearchParams(text) {
  const t = String(text || "").trim();
  if (!t) return {};
  const iso = parseDob(t);
  if (iso) return { dob: iso };
  if (/^[\d\s().+-]+$/.test(t) && digitsOnly(t).length >= 4) return { search: digitsOnly(t) };
  return { search: t };
}
