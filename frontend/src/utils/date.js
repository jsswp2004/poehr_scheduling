// src/utils/date.js
/**
 * Returns a local datetime string (YYYY-MM-DDTHH:MM) for use in <input type="datetime-local"> fields.
 * WARNING: Do NOT use for backend payloads. Always send UTC ISO strings to backend.
 */
export function toLocalDatetimeString(dateObj) {
  const local = new Date(dateObj);
  // Get local datetime string in YYYY-MM-DDTHH:MM format without timezone adjustment
  const year = local.getFullYear();
  const month = String(local.getMonth() + 1).padStart(2, '0');
  const day = String(local.getDate()).padStart(2, '0');
  const hours = String(local.getHours()).padStart(2, '0');
  const minutes = String(local.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}
