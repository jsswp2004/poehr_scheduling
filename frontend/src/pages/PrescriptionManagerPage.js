import { Box } from "@mui/material";
import ChartPageShell from "../components/patients/ChartPageShell";
import PrescriptionWorklist from "../components/prescriptions/PrescriptionWorklist";
import useMe from "../components/referrals/useMe";

/**
 * Prescription Manager (/prescriptions): every prescription for the clinic by queue -- what needs a doctor's
 * signature, what is signed and waiting to be printed or faxed, and what has gone out.
 */
function PrescriptionManagerPage() {
  const me = useMe();
  return (
    <ChartPageShell>
      <Box data-testid="rx-manager-page" sx={{ bgcolor: "background.paper", pb: 0.5 }}>
        <PrescriptionWorklist me={me} />
      </Box>
    </ChartPageShell>
  );
}

export default PrescriptionManagerPage;
