import { Box, Chip, Typography } from "@mui/material";
import { authHeader, errorText } from "../patientHeader/headerApi";

export { authHeader, errorText };

/** Who works in POWER Pharmacy (the server's list). Pharmacy assistants only read in Phase 1. */
export const PHARMACY_ROLES = ["pharmacist", "pharmacy_tech", "admin", "system_admin"];
/** Who may verify, change, hold or reject a medication order: a licensed pharmacist (RA 10918) or an administrator. */
export const VERIFY_ROLES = ["pharmacist", "admin", "system_admin"];

/** Fired after a verification action so the queue badge and lists reload. */
export const PHARMACY_CHANGED_EVENT = "pharmacy-changed";

export const PHARMACY_STATUS_COLOR = {
  pending_verification: "warning",
  on_hold_clarify: "info",
  verified: "success",
  rejected: "error",
};

export const PRIORITY_LABEL = { stat: "STAT", urgent: "Urgent", routine: "Routine" };

export const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString() : "");

/** "1 h 5 m" / "12 m" for minutes waiting. */
export const fmtWait = (minutes) => {
  if (minutes == null) return "";
  if (minutes < 60) return `${minutes} m`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} m`;
};

/**
 * A medication's name as the Generics Act asks: the generic name first, the brand (if known) in parentheses,
 * with a "Dangerous drug" chip for RA 9165 drugs.
 */
export function DrugName({ drug, dangerous = false, detail = "", testId }) {
  const names = drug || {};
  return (
    <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 0.5 }} data-testid={testId}>
      <Typography variant="body2" component="span" sx={{ fontWeight: 600 }}>
        {names.generic || names.display || ""}
      </Typography>
      {names.brand && (
        <Typography variant="body2" component="span" color="text.secondary">
          ({names.brand})
        </Typography>
      )}
      {detail && (
        <Typography variant="body2" component="span" color="text.secondary">
          {detail}
        </Typography>
      )}
      {dangerous && <Chip size="small" color="error" variant="outlined" label="Dangerous drug" data-testid="dangerous-drug-chip" />}
    </Box>
  );
}

/** Dose, route and frequency as one line: "2.25 g IV · Every 6 hours". */
export const directions = (o) =>
  [[o.dose, o.route].filter(Boolean).join(" "), o.frequency_label].filter(Boolean).join(" · ");
