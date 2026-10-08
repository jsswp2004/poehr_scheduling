import { Alert } from "@mui/material";
import { ALL, useFacilityScope } from "../../utils/facilityScope";

/**
 * For settings that belong to one facility's own people or data (a provider's schedule, an
 * upload, a facility's own events): when "All facilities" is chosen they ask for a single facility
 * instead of showing a form whose save could not mean anything.
 */
export default function SingleFacilityOnly({ what, children }) {
  const { enabled, choice } = useFacilityScope();
  if (enabled && choice === ALL) {
    return (
      <Alert severity="info" data-testid="single-facility-only">
        {what} belongs to one facility at a time. Choose a facility above to work on it.
      </Alert>
    );
  }
  return children;
}
