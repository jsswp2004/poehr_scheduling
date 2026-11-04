import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { authHeader } from "../patientHeader/headerApi";

const call = async (method, url, { params, data } = {}) => {
  const headers = await authHeader();
  const res = await api.request({ method, url, params, data, headers });
  return res.data;
};

const list = (data) => (Array.isArray(data) ? data : data?.results || []);

export const surgeryApi = {
  planner: (params) => call("get", apiEndpoints.surgeryPlanner, { params }),
  cases: (params) => call("get", apiEndpoints.surgeryCases, { params }),
  getCase: (id) => call("get", apiEndpoints.surgeryCase(id)),
  createCase: (data) => call("post", apiEndpoints.surgeryCases, { data }),
  updateCase: (id, data) => call("patch", apiEndpoints.surgeryCase(id), { data }),
  setStatus: (id, status, reason) => call("post", apiEndpoints.surgeryCaseStatus(id), { data: { status, reason } }),
  history: (id) => call("get", apiEndpoints.surgeryCaseHistory(id)),
  lookups: () => call("get", apiEndpoints.surgeryLookups),
  staff: (q) => call("get", apiEndpoints.surgeryStaff, { params: { q } }),
  participants: (id) => call("get", apiEndpoints.surgeryParticipants(id)),
  addParticipant: (id, data) => call("post", apiEndpoints.surgeryParticipants(id), { data }),
  updateParticipant: (id, participantId, data) => call("patch", apiEndpoints.surgeryParticipant(id, participantId), { data }),
  removeParticipant: (id, participantId) => call("delete", apiEndpoints.surgeryParticipant(id, participantId)),
  preferenceCards: (q) => call("get", apiEndpoints.surgeryPreferenceCards, { params: { q } }),
  caseCards: (id) => call("get", apiEndpoints.surgeryCaseCards(id)),
  addCard: (id, card) => call("post", apiEndpoints.surgeryCaseCards(id), { data: { card } }),
  makePrimary: (id, linkId) => call("post", apiEndpoints.surgeryCaseCard(id, linkId)),
  removeCard: (id, linkId) => call("delete", apiEndpoints.surgeryCaseCard(id, linkId)),
  usage: (id) => call("get", apiEndpoints.surgeryUsage(id)),
  addUsage: (id, data) => call("post", apiEndpoints.surgeryUsage(id), { data }),
  updateUsage: (id, usageId, data) => call("patch", apiEndpoints.surgeryUsageItem(id, usageId), { data }),
  removeUsage: (id, usageId) => call("delete", apiEndpoints.surgeryUsageItem(id, usageId)),
  charges: (id) => call("get", apiEndpoints.surgeryCharges(id)),
  addCharge: (id, data) => call("post", apiEndpoints.surgeryCharges(id), { data }),
  generateCharges: (id) => call("post", apiEndpoints.surgeryChargesGenerate(id)),
  postCharges: (id, ids) => call("post", apiEndpoints.surgeryChargesPost(id), { data: ids ? { ids } : {} }),
  updateCharge: (id, chargeId, data) => call("patch", apiEndpoints.surgeryCharge(id, chargeId), { data }),
  removeCharge: (id, chargeId) => call("delete", apiEndpoints.surgeryCharge(id, chargeId)),
  adminCards: (q) => call("get", apiEndpoints.surgeryPreferenceCards, { params: { q, all: 1 } }),
  getCard: (id) => call("get", apiEndpoints.surgeryPreferenceCard(id)),
  createCard: (data) => call("post", apiEndpoints.surgeryPreferenceCards, { data }),
  updateCard: (id, data) => call("patch", apiEndpoints.surgeryPreferenceCard(id), { data }),
  policies: () => call("get", apiEndpoints.surgeryChargePolicies),
  createPolicy: (data) => call("post", apiEndpoints.surgeryChargePolicies, { data }),
  updatePolicy: (id, data) => call("patch", apiEndpoints.surgeryChargePolicy(id), { data }),
  prices: () => call("get", apiEndpoints.surgeryChargePrices),
  savePrice: (data) => call("post", apiEndpoints.surgeryChargePrices, { data }),
  removePrice: (id) => call("delete", apiEndpoints.surgeryChargePrice(id)),
  caseVisits: (id, params) => call("get", apiEndpoints.surgeryCaseVisits(id), { params }),
  documents: (id) => call("get", apiEndpoints.surgeryDocuments(id)),
  uploadDocument: async (id, form) => {
    const headers = await authHeader(); // the browser sets the multipart boundary itself
    return (await api.post(apiEndpoints.surgeryDocuments(id), form, { headers })).data;
  },
  downloadDocument: async (id, docId) => {
    const headers = await authHeader();
    return (await api.get(apiEndpoints.surgeryDocument(id, docId), { headers, responseType: "blob" })).data;
  },
  removeDocument: (id, docId) => call("delete", apiEndpoints.surgeryDocument(id, docId)),
  rooms: (params) => call("get", apiEndpoints.surgeryRooms, { params }),
  addRoom: (data) => call("post", apiEndpoints.surgeryRooms, { data }),
  roomOptions: (params) => call("get", apiEndpoints.surgeryRoomOptions, { params }),
  updateRoom: (id, data) => call("patch", apiEndpoints.surgeryRoom(id), { data }),
  searchPatients: async (search) => list(await call("get", apiEndpoints.patients, { params: { search, page_size: 10 } })),
  openVisits: async (patientId) => list(await call("get", apiEndpoints.registrations, { params: { patient: patientId, open: 1 } })),
  doctors: async () => list(await call("get", apiEndpoints.doctors)),
};
