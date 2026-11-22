import { Navigate, useLocation } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import { Alert, Box, Button, Typography } from "@mui/material";
import { PORTAL_HOME, PORTAL_ROLES, landingForCurrentUser } from "../utils/landing";
import { extractClaimCode, savePendingClaim } from "../utils/claimCode";

const signedInRole = () => {
  try {
    const token = localStorage.getItem("access_token");
    if (!token) return "";
    const { role, exp } = jwtDecode(token);
    return exp && exp * 1000 < Date.now() ? "" : role || "";
  } catch (e) {
    return "";
  }
};

/**
 * Where a prescription's QR code leads: /pharmacy-portal/claim?code=<code>.
 * Not signed in: remember the code, sign in, and the portal opens Claim with it filled in.
 * A portal login: straight to the portal's Claim box with the code (birthdate and mobile digits still needed).
 * Anyone else: a short explanation (claiming is for partner pharmacies on the portal).
 */
export default function PharmacyPortalClaimLinkPage() {
  const { search } = useLocation();
  const code = extractClaimCode(new URLSearchParams(search).get("code") || "");
  const role = signedInRole();

  if (!role) {
    savePendingClaim(code);
    return <Navigate to="/login" replace />;
  }
  if (PORTAL_ROLES.includes(role)) {
    return <Navigate to={`${PORTAL_HOME}${code ? `?claim=${encodeURIComponent(code)}` : ""}`} replace />;
  }
  return (
    <Box sx={{ maxWidth: 560, mx: "auto", px: 2, py: 4 }} data-testid="claim-link-not-portal">
      <Typography variant="h6" gutterBottom>Prescription claim code {code}</Typography>
      <Alert severity="info" sx={{ mb: 2 }}>
        This QR code is for pharmacies on the POWER Pharmacy Portal. A pharmacist of a partner pharmacy signs in to the
        portal and claims the prescription with the patient's birthdate and the last 4 digits of their mobile number.
        Your account is not a portal pharmacy account.
      </Alert>
      <Button variant="contained" href={landingForCurrentUser() || "/"}>Back to POWER</Button>
    </Box>
  );
}
