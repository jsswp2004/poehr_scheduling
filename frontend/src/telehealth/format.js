const pad = (n) => String(n).padStart(2, "0");

/** 247000 -> "4:07", 3725000 -> "1:02:05" */
export function formatWait(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function formatClock(iso) {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  } catch {
    return "";
  }
}

/** "2026-10-13" -> "Tuesday, October 13" (parsed as a local date, not UTC) */
export function formatDay(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(
    new Date(y, m - 1, d)
  );
}

export function todayISO(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** How far the server clock is ahead of this device (ms). Add it to Date.now() for server time. */
export function clockOffset(serverIso, now = Date.now()) {
  return Date.parse(serverIso) - now;
}

export function patientOf(session) {
  return session?.participants?.find((p) => p.role === "patient") ?? null;
}

/**
 * One word for where a visit stands, from the staff point of view:
 * no-session | not-arrived | arrived (opened link, no consent yet) | waiting (consented) | in-visit | ended
 */
export function visitState(session) {
  if (!session) return "no-session";
  if (session.status === "ended") return "ended";
  const patient = patientOf(session);
  if (patient?.admitted_at) return "in-visit";
  if (patient?.arrived_at) return patient.consented ? "waiting" : "arrived";
  return "not-arrived";
}

export function isWaiting(state) {
  return state === "arrived" || state === "waiting";
}

/** Milliseconds the patient has been in the waiting room, using server-corrected time. */
export function waitMs(session, nowMs, offsetMs = 0) {
  const patient = patientOf(session);
  if (!patient?.arrived_at) return 0;
  return Math.max(0, nowMs + offsetMs - Date.parse(patient.arrived_at));
}

/** After this long in the waiting room the timer turns red so nobody is missed. */
export const LONG_WAIT_MS = 10 * 60 * 1000;
export function isLongWait(ms) {
  return ms >= LONG_WAIT_MS;
}
