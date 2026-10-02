import { api } from "../../api/client";
import { getValidToken } from "../../utils/auth";

// Same pattern as the note builder: the shared `api` instance carries no
// Authorization header of its own, so every call attaches its own token.
export const authConfig = async () => ({
    headers: { Authorization: `Bearer ${await getValidToken()}` },
});

export const listOf = (res) => (Array.isArray(res.data) ? res.data : res.data?.results || []);

export const CATEGORIES = [
    { value: "laboratory", label: "Laboratory" },
    { value: "imaging", label: "Imaging" },
    { value: "procedure", label: "Procedure" },
    { value: "referral", label: "Referral" },
    { value: "nursing", label: "Nursing" },
    { value: "medication", label: "Medication" },
    { value: "other", label: "Other" },
];

export const CODE_SYSTEMS = [
    { value: "local", label: "Local" },
    { value: "loinc", label: "LOINC" },
    { value: "hcpcs", label: "HCPCS" },
    { value: "icd10pcs", label: "ICD-10-PCS" },
    { value: "snomed", label: "SNOMED CT" },
    { value: "rxnorm", label: "RxNorm" },
    { value: "cpt", label: "CPT (entered by the clinic)" },
];

export const PRIORITIES = [
    { value: "routine", label: "Routine" },
    { value: "urgent", label: "Urgent" },
    { value: "stat", label: "STAT" },
];

export const labelOf = (list, value) => (list.find((x) => x.value === value) || {}).label || value;

// Turn a DRF error body into one readable sentence.
export const errorText = (err, fallback) => {
    const data = err?.response?.data;
    if (!data) return fallback;
    if (typeof data.detail === "string") return data.detail;
    if (typeof data === "object") {
        const parts = Object.entries(data).map(
            ([k, v]) => `${k}: ${Array.isArray(v) ? v.join(" ") : typeof v === "string" ? v : JSON.stringify(v)}`
        );
        if (parts.length) return parts.join("  ");
    }
    return fallback;
};

// Downloads go through axios (not a plain link) so the auth header is sent.
export const saveCsv = async (url, fallbackName) => {
    const res = await api.get(url, { ...(await authConfig()), responseType: "blob" });
    const disposition = (res.headers && res.headers["content-disposition"]) || "";
    const match = /filename="?([^";]+)"?/i.exec(disposition);
    const blobUrl = window.URL.createObjectURL(new Blob([res.data], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = match ? match[1] : fallbackName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(blobUrl);
};
