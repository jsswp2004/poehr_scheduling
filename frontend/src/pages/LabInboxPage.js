import { Box } from "@mui/material";
import LabInbox from "../components/LabInbox";
import ChartPageShell from "../components/patients/ChartPageShell";

/**
 * Results inbox page (/lab-inbox): everything waiting for review, most urgent first.
 * The care-setting side bar (folded to its icon strip) is on the left and carries the
 * Back arrow, so the page has no Back button of its own and no card padding above the title.
 */
function LabInboxPage() {
  return (
    <ChartPageShell>
      <Box data-testid="lab-inbox-page" sx={{ mt: 0, bgcolor: "background.paper", px: 2, pt: 1, pb: 2 }}>
        <LabInbox />
      </Box>
    </ChartPageShell>
  );
}

export default LabInboxPage;
