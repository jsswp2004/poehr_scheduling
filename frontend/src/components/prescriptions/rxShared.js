import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { authHeader, errorText } from "../patientHeader/headerApi";

export { authHeader, errorText };

/** Who may draft prescriptions (the server's list); only a doctor signs, and only their own. */
export const RX_ROLES = ["doctor", "nurse", "admin", "system_admin"];
export const RX_ADMIN_ROLES = ["admin", "system_admin"];

export const STATUS_COLOR = { draft: "default", signed: "info", sent: "success", cancelled: "error" };

export const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString() : "");
export const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString() : "");

const ROUTE_PHRASE = {
  PO: "by mouth", SL: "under the tongue", IM: "into the muscle", SC: "under the skin", IV: "intravenously",
  IVPB: "intravenously", PR: "rectally", Topical: "on the skin", Inhaled: "by inhalation", Ophthalmic: "in the eye",
  Otic: "in the ear", Nasal: "in the nose", Transdermal: "on the skin", "Via tube": "via feeding tube", Other: "",
};
const ROUTE_VERB = {
  PO: "Take", SL: "Place", IM: "Inject", SC: "Inject", IV: "Give", IVPB: "Give", PR: "Insert", Topical: "Apply",
  Inhaled: "Inhale", Ophthalmic: "Instill", Otic: "Instill", Nasal: "Spray", Transdermal: "Apply", "Via tube": "Give", Other: "Use",
};
const FREQ_PHRASE = {
  once: "once", stat: "now", daily: "once daily", qam: "every morning", qhs: "at bedtime", bid: "twice daily",
  tid: "three times daily", qid: "four times daily", q1h: "every hour", q2h: "every 2 hours", q4h: "every 4 hours",
  q6h: "every 6 hours", q8h: "every 8 hours", q12h: "every 12 hours", weekly: "once weekly", prn: "",
};

/** The directions as a sentence -- the same wording the server freezes at signing, shown while typing. */
export function buildSig(f) {
  const parts = [ROUTE_VERB[f.route] || "Take"];
  if (f.dose && f.dose.trim()) parts.push(f.dose.trim());
  if (ROUTE_PHRASE[f.route]) parts.push(ROUTE_PHRASE[f.route]);
  if (FREQ_PHRASE[f.frequency]) parts.push(FREQ_PHRASE[f.frequency]);
  const days = Number(f.duration_days);
  if (days) parts.push(`for ${days} day${days !== 1 ? "s" : ""}`);
  if (f.prn || f.frequency === "prn") parts.push("as needed" + (f.prn_reason && f.prn_reason.trim() ? ` for ${f.prn_reason.trim()}` : ""));
  let sentence = parts.join(" ");
  sentence = sentence.charAt(0).toUpperCase() + sentence.slice(1) + ".";
  const extra = (f.sig_extra || "").trim();
  if (extra) sentence += " " + (/[.!?]$/.test(extra) ? extra : extra + ".");
  return sentence;
}

export async function loadMeta() {
  const res = await api.get(apiEndpoints.prescriptionMeta, { headers: await authHeader() });
  return res.data;
}

export async function runAction(id, action, body = {}) {
  const res = await api.post(apiEndpoints.prescriptionAction(id), { action, ...body }, { headers: await authHeader() });
  return res.data;
}

/**
 * Open the prescription's PDF in a new tab. Printing (`log: true`) is recorded on the prescription;
 * a preview is not. The person prints from the PDF viewer, or saves it to fax.
 */
export async function openPdf(id, { log = false } = {}) {
  const headers = await authHeader();
  const url = apiEndpoints.prescriptionPdf(id);
  const res = log ? await api.post(url, {}, { headers, responseType: "blob" }) : await api.get(url, { headers, responseType: "blob" });
  const blobUrl = URL.createObjectURL(res.data);
  window.open(blobUrl, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
}

/** A blob error body is JSON text; read the server's message out of it. */
export async function pdfErrorText(err, fallback) {
  const data = err?.response?.data;
  if (data && typeof data.text === "function") {
    try {
      const parsed = JSON.parse(await data.text());
      if (parsed.detail) return parsed.detail;
    } catch (e) {
      /* fall through */
    }
  }
  return errorText(err, fallback);
}

export const announceChange = () => window.dispatchEvent(new Event("prescriptions-changed"));

export const pharmacyLine = (p) =>
  [p.name, [p.address, [p.city, p.state, p.zip_code].filter(Boolean).join(" ")].filter(Boolean).join(", ")].filter(Boolean).join(" — ");
