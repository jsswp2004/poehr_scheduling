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

/** The soft warning for a POWER Formulary item that still needs a pharmacist's review (never a block). */
export const NOT_REVIEWED = "Not yet reviewed by a pharmacist";

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

// ---- Phase 2: in-house outpatient fill

/** The fill queue's stages, in order, as tabs. */
export const FILL_STAGES = [
  { value: "received", label: "Received" },
  { value: "data_entry", label: "Data entry" },
  { value: "filling", label: "Filling" },
  { value: "final_check", label: "Final check" },
  { value: "ready", label: "Ready for pickup" },
  { value: "dispensed", label: "Dispensed" },
  { value: "on_hold", label: "On hold" },
];

export const FILL_STAGE_COLOR = {
  received: "default",
  data_entry: "info",
  filling: "info",
  final_check: "warning",
  ready: "success",
  dispensed: "default",
  on_hold: "error",
};

/** Fired after a fill changes, so the queue and the med profile reload. */
export const FILLS_CHANGED_EVENT = "pharmacy-fills-changed";

/** "₱1,234.50" */
export const peso = (value) => {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  return Number.isFinite(n) ? `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—";
};

export const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString() : "");

/** "Bonifacio, Andres · 21/11/2026, 10:15" for a stage that has been done. */
export const fmtWho = (who) => (who && (who.name || who.at) ? [who.name, fmtDateTime(who.at)].filter(Boolean).join(" · ") : "");
