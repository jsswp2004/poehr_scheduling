import { Navigate, useLocation } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import { Alert, Box, Button, Typography } from "@mui/material";
import { LAB_PORTAL_HOME, LAB_PORTAL_ROLES, landingForCurrentUser } from "../utils/landing";
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
 * Where a lab request's QR code leads: /lab-portal/claim?code=<code>.
 * Not signed in: remember the code, sign in, and the lab portal opens Check in with it filled in.
 * A lab portal login: straight to Check in with the code. Anyone else: a short explanation.
 */
export default function LabPortalClaimLinkPage() {
  const { search } = useLocation();
  const code = extractClaimCode(new URLSearchParams(search).get("code") || "");
  const role = signedInRole();

  if (!role) {
    savePendingClaim(code);
    return <Navigate to="/login" replace />;
  }
  if (LAB_PORTAL_ROLES.includes(role)) {
    return <Navigate to={`${LAB_PORTAL_HOME}${code ? `?claim=${encodeURIComponent(code)}` : ""}`} replace />;
  }
  return (
    <Box sx={{ maxWidth: 560, mx: "auto", px: 2, py: 4 }} data-testid="lab-claim-link-not-portal">
      <Typography variant="h6" gutterBottom>Lab request code {code}</Typography>
      <Alert severity="info" sx={{ mb: 2 }}>
        This code is for laboratories on the POWER Lab Portal. A medical technologist at a partner lab signs in to the portal and
        checks the patient in with their birthdate and the last 4 digits of their mobile number. Your account is not a lab portal account.
      </Alert>
      <Button variant="contained" href={landingForCurrentUser() || "/"}>Back to POWER</Button>
    </Box>
  );
}
