import { authHeader, errorText } from "../patientHeader/headerApi";

export { authHeader, errorText };

/** Lab request statuses (the server's list) and their chip colors. */
export const LAB_STATUS_COLOR = {
  unclaimed: "default",
  new: "info",
  accepted: "primary",
  collected: "secondary",
  in_process: "warning",
  preliminary: "warning",
  final: "success",
  declined: "error",
  cancelled: "default",
  expired: "default",
};

export const LAB_PORTAL_TABS = [
  { value: "new", label: "New" },
  { value: "waiting", label: "Waiting for patient" },
  { value: "collected", label: "Collected" },
  { value: "in_process", label: "In process" },
  { value: "to_release", label: "To release" },
  { value: "history", label: "History" },
];

export const COLLECTION_OPTIONS = [
  { value: "at_lab", label: "Patient goes to the lab" },
  { value: "lab_at_bedside", label: "Lab collects at the bedside" },
  { value: "hospital_collects", label: "We collect and send the specimen" },
];

export const FLAG_OPTIONS = [
  { value: "", label: "Normal" },
  { value: "L", label: "Low" },
  { value: "H", label: "High" },
  { value: "LL", label: "Critical low" },
  { value: "HH", label: "Critical high" },
  { value: "A", label: "Abnormal" },
];

export const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString() : "");

/** Text shown for a license by country: PH uses PRC numbers and DOH licenses, the US uses CLIA. */
export const licenseWord = (country) => (country === "US" ? "CLIA" : "DOH LTO");
export const staffLicenseWord = (country) => (country === "US" ? "License no." : "PRC no.");
