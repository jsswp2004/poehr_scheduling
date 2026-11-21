import { Box, Typography } from "@mui/material";
import PharmacyPatientList from "./PharmacyPatientList";
import VerificationQueue from "./VerificationQueue";
import MedProfilePanel from "./MedProfilePanel";
import OutpatientFillQueue from "./OutpatientFillQueue";
import PortalPharmaciesPanel from "./PortalPharmaciesPanel";

/** Shown on a pharmacy tab that is planned but not built yet (none at the moment). */
export function PharmacyComingSoon({ title, phase }) {
  return (
    <Box sx={{ p: 3 }} data-testid="pharmacy-coming-soon">
      <Typography variant="h6" sx={{ mb: 1 }}>{title}</Typography>
      <Typography variant="body2" color="text.secondary">Coming in Phase {phase}.</Typography>
    </Box>
  );
}

/**
 * What the Pharmacy care setting shows on its own chart tabs. Orders, Prescriptions, Results and Patient Info
 * are the Patients page's usual panels; this covers the pharmacy-only ones.
 */
export default function PharmacyWorkspace({ view, role, selectedPatient, onSelect, onOpenChart, onListChange }) {
  if (view === "verification_queue") {
    return <VerificationQueue role={role} patient={selectedPatient} onSelectPatient={onSelect} />;
  }
  if (view === "med_profile") {
    if (!selectedPatient) return null;
    return <MedProfilePanel key={selectedPatient.id} patient={selectedPatient} role={role} />;
  }
  if (view === "outpatient_rx") return <OutpatientFillQueue onSelectPatient={onSelect} />;
  if (view === "erx_routing") return <PortalPharmaciesPanel />;
  return (
    <PharmacyPatientList
      selectedId={selectedPatient ? selectedPatient.id : null}
      onSelect={onSelect}
      onOpenChart={onOpenChart}
      onListChange={onListChange}
    />
  );
}
