import { Box } from "@mui/material";
import LabInbox from "../components/LabInbox";
import BackButton from "../components/BackButton";

/** Results inbox page (/lab-inbox): everything waiting for review, most urgent first. */
function LabInboxPage() {
  return (
    <Box sx={{ mt: 0, boxShadow: 2, borderRadius: 2, bgcolor: "background.paper", p: 3 }}>
      <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1 }}>
        <BackButton to="/patients" />
      </Box>
      <LabInbox />
    </Box>
  );
}

export default LabInboxPage;
