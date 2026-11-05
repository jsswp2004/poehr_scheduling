import { Navigate } from "react-router-dom";
import { Box, Typography } from "@mui/material";
import RegisterPage from "./RegisterPage";
import { moduleEnabled } from "../utils/orgModules";

/**
 * POWER Registration on its own: the same Quick Register, patients table, Full Registration and setup the
 * Register tab in POWER Notes uses (same records), without the rest of the chart. It is the Registration tile on
 * the Solutions page, and the header "Register" link for organizations that have Registration but not Clinical Notes.
 */
export default function RegistrationWorkspacePage() {
  if (!moduleEnabled("registration")) return <Navigate to="/solutions" replace />;
  return (
    <Box sx={{ maxWidth: 1400, mx: "auto", px: { xs: 0, md: 1 }, pt: 2, pb: 4 }} data-testid="registration-workspace">
      <Typography variant="h5" sx={{ px: 2, fontWeight: 600 }}>
        Registration
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ px: 2, mb: 1 }}>
        Register patients, start visits, and keep demographics, insurance and payments up to date.
      </Typography>
      <RegisterPage adminMode={true} />
    </Box>
  );
}
