import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { getValidToken } from "../../utils/auth";

export const scanAuthHeader = async () => {
  const token = await getValidToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token.access_token || token}` };
};

/** Patients matching an MRN or name (the pickers' search). */
export async function searchScanPatients(q) {
  const res = await api.get(apiEndpoints.labReportScanPatients, { headers: await scanAuthHeader(), params: { q } });
  return Array.isArray(res.data) ? res.data : [];
}

/** One patient's identity and visits: { patient: {id, mrn, name}, visits: [{id, code, date, title}] }. */
export async function loadScanVisits(patientId) {
  const res = await api.get(apiEndpoints.labReportScanVisits, { headers: await scanAuthHeader(), params: { patient: patientId } });
  return { patient: res.data?.patient || null, visits: res.data?.visits || [] };
}

/** File a finished scan to Results (same endpoint as an attached file). */
export async function fileScan({ blob, patientId, visitId, title, scanMeta, allowDuplicate = false }) {
  const body = new FormData();
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  body.append("patient", patientId);
  body.append("file", blob, `scan-${stamp}.pdf`);
  if (visitId) body.append("visit", visitId);
  if (title && title.trim()) body.append("title", title.trim());
  body.append("scan_meta", JSON.stringify(scanMeta || {}));
  if (allowDuplicate) body.append("allow_duplicate", "true");
  const res = await api.post(apiEndpoints.labReportUpload, body, { headers: await scanAuthHeader() });
  return res.data;
}
