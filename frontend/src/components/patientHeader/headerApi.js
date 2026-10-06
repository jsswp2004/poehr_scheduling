import { getValidToken } from "../../utils/auth";

/** Authorization header for the patient header calls. */
export const authHeader = async () => {
  const token = await getValidToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token.access_token || token}` };
};

/** The server's own message when there is one (it says what to fix), otherwise a plain fallback. */
export const errorText = (err, fallback) =>
  err?.response?.data?.detail ||
  (err?.response?.data && typeof err.response.data === "object"
    ? Object.values(err.response.data).flat().join(" ")
    : null) ||
  fallback;
