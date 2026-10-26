import { Alert, Box, Typography } from "@mui/material";

// POWER MDS runs as its own application (it holds resident assessment data and
// is deployed separately). This page hosts it in the POWER shell when its
// address is configured, and says so plainly when it is not.
export default function MdsPage() {
  const MDS_URL = process.env.REACT_APP_MDS_URL || "";
  if (!MDS_URL) {
    return (
      <Box sx={{ p: 4, maxWidth: 720, mx: "auto" }}>
        <Typography variant="h5" gutterBottom>POWER MDS</Typography>
        <Alert severity="info">
          POWER MDS is not connected to this site yet. Set REACT_APP_MDS_URL to the address where the MDS
          application is hosted, then rebuild.
        </Alert>
      </Box>
    );
  }
  return (
    <Box sx={{ height: "100vh", width: "100%" }}>
      <iframe title="POWER MDS Assessment Portal" src={MDS_URL} style={{ border: 0, width: "100%", height: "100%" }} />
    </Box>
  );
}
