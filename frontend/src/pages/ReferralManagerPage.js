import { Box } from "@mui/material";
import ChartPageShell from "../components/patients/ChartPageShell";
import ReferralWorklist from "../components/referrals/ReferralWorklist";
import useMe from "../components/referrals/useMe";

/**
 * Referral Manager (/referrals): every referral for the clinic by queue -- what needs action,
 * what is waiting to be scheduled, what is overdue, and which reports are waiting to be reviewed.
 */
function ReferralManagerPage() {
  const me = useMe();
  return (
    <ChartPageShell>
      <Box data-testid="referral-manager-page" sx={{ bgcolor: "background.paper", pb: 0.5 }}>
        <ReferralWorklist me={me} />
      </Box>
    </ChartPageShell>
  );
}

export default ReferralManagerPage;
