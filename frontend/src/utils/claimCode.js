/**
 * POWER Pharmacy Portal claim codes. A printed prescription's QR code holds a link to the portal's Claim page
 * (.../pharmacy-portal/claim?code=<code>); older printouts hold "POWER-RX:<code>". Either, or the 8 characters
 * typed, give the same code (the server reads all three as well).
 */
export function extractClaimCode(raw) {
  let text = String(raw || "").trim();
  const at = text.indexOf("code=");
  if (at >= 0) {
    const query = text.slice(text.indexOf("?") + 1);
    try {
      text = new URLSearchParams(query).get("code") || "";
    } catch (e) {
      text = text.slice(at + 5).split("&")[0];
    }
  } else if (text.includes("://")) {
    return ""; // a link without a claim code
  }
  text = text.toUpperCase();
  if (text.startsWith("POWER-RX:")) text = text.slice("POWER-RX:".length);
  return text.replace(/[-\s]/g, "");
}

// A claim link opened before signing in: kept for this browser tab only, picked up once by the portal after sign-in.
const PENDING_KEY = "power.portal.pendingClaim";

export function savePendingClaim(code) {
  try {
    if (code) sessionStorage.setItem(PENDING_KEY, code);
  } catch (e) {
    /* storage unavailable: the pharmacist types the code instead */
  }
}

export function takePendingClaim() {
  try {
    const code = sessionStorage.getItem(PENDING_KEY);
    sessionStorage.removeItem(PENDING_KEY);
    return code || "";
  } catch (e) {
    return "";
  }
}
