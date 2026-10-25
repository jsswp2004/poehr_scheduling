import axios from "axios";
import { apiEndpoints, getAuthHeaders } from "../../config/api";
import { getAccessToken } from "../../utils/tokenManager";

/** Save a Blob as a file download. */
export function saveBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => window.URL.revokeObjectURL(url), 60000);
}

function filenameFrom(response, fallback) {
  const match = /filename="?([^";]+)"?/.exec(response.headers?.["content-disposition"] || "");
  return match ? match[1] : fallback;
}

/** The message in an error response whose body was requested as a blob. */
export async function blobErrorMessage(err, fallback = "Could not create the file.") {
  try {
    const text = await err.response.data.text();
    return JSON.parse(text).error || fallback;
  } catch (e) {
    return err?.response?.data?.error || fallback;
  }
}

/** Ask the server for a report as a PDF (or CSV) and download it. */
export async function downloadReportFile({ kind, file, params = {} }) {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== "" && v != null));
  const response = await axios.get(apiEndpoints.staffingReportExport(kind), {
    headers: getAuthHeaders(getAccessToken()),
    params: { file, tz: Intl.DateTimeFormat().resolvedOptions().timeZone, ...clean },
    responseType: "blob",
  });
  saveBlob(response.data, filenameFrom(response, `${kind}.${file}`));
}
