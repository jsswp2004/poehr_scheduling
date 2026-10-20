import { Alert, AlertTitle, Typography } from "@mui/material";

/**
 * What the nurse sees after signing a triage note that told someone about a safety concern.
 * It stays until closed (a toast would vanish before it could be read). If nobody could be told, it says to phone.
 */
export default function SafetyAlertNotice({ alert, onClose }) {
  if (!alert) return null;
  return (
    <Alert severity={alert.sent ? "warning" : "error"} onClose={onClose} sx={{ mb: 2 }} data-testid="safety-alert-notice" role="alert">
      <AlertTitle>{alert.sent ? "Safety alert sent" : "Safety alert not delivered"}</AlertTitle>
      <Typography variant="body2" sx={{ mb: 0.5 }}>{alert.message}</Typography>
      {(alert.reasons || []).map((r, i) => <Typography key={i} variant="body2">{r}</Typography>)}
    </Alert>
  );
}
