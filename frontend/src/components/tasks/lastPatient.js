import { jwtDecode } from "jwt-decode";
import { getAccessToken } from "../../utils/tokenManager";

/**
 * The patient last selected on the Patients page, as { id, name } (id is the patient's user id).
 * The Patients page remembers it for this browser tab, per user; the Task Manager shows it in its banner.
 * Returns null when nobody is selected or it cannot be read.
 */
export function readLastPatient() {
  try {
    const token = getAccessToken();
    if (!token) return null;
    const userId = jwtDecode(token).user_id;
    const saved = JSON.parse(window.sessionStorage.getItem(`powerSelectedPatient:${userId}`) || "null");
    return saved && saved.id ? { id: saved.id, name: saved.name || "" } : null;
  } catch (err) {
    return null;
  }
}
