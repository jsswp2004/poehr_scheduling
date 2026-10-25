/**
 * Small shared pieces for the Staffing calendar's in-between states: coverage
 * failed to load (with a retry), a loading skeleton, and "this unit has no
 * staffing requirement yet".
 */
import { Alert, Box, Button } from "@mui/material";

/** Shifts loaded but the coverage request failed. `detail` says what is still reliable. */
export function CoverageFailedBanner({ detail = "", onRetry = null, retrying = false }) {
  return (
    <Box
      role="alert"
      sx={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 1,
        mb: 1,
        p: 1,
        borderRadius: 1,
        bgcolor: "#fffaeb",
        border: "1px solid #fde4a8",
        fontSize: 13,
        color: "#7a4a00",
      }}
    >
      <span>
        <b>Shifts loaded, coverage colours unavailable.</b> {detail}
      </span>
      <Box sx={{ flex: 1 }} />
      {onRetry && (
        <Button size="small" color="inherit" onClick={onRetry} disabled={retrying} sx={{ fontWeight: 700 }}>
          {retrying ? "Retrying…" : "Retry coverage"}
        </Button>
      )}
    </Box>
  );
}

/** Grey placeholder rows shown while the first load is in flight. */
export function CalendarSkeleton({ rows = 5 }) {
  return (
    <Box sx={{ flex: 1, p: 3 }} aria-label="Loading" role="status">
      {Array.from({ length: rows }, (_, i) => (
        <Box key={i} sx={{ display: "flex", gap: 1, mb: 1 }}>
          <Box sx={{ width: 60, height: 24, borderRadius: "4px", bgcolor: "#e4e7ec" }} />
          <Box sx={{ flex: 1, height: 24, borderRadius: "4px", bgcolor: "#eef1f6" }} />
          <Box sx={{ width: 60, height: 24, borderRadius: "4px", bgcolor: "#eef1f6" }} />
        </Box>
      ))}
    </Box>
  );
}

/** The chosen unit has no staffing requirement in view, so every day would stay grey. */
export function NoRequirementNotice({ unitName, onOpenUnits = null }) {
  return (
    <Alert
      severity="info"
      sx={{ mb: 1 }}
      action={
        onOpenUnits ? (
          <Button color="inherit" size="small" onClick={onOpenUnits}>
            Open Units &amp; Census
          </Button>
        ) : null
      }
    >
      <b>No staffing requirement set for {unitName}.</b> Days stay grey until a census and a requirement exist.
    </Alert>
  );
}

/** Reminder under the role chips: the filter narrows people, never the coverage maths. */
export function RoleFilterNote({ role }) {
  return (
    <Box sx={{ mb: 1, fontSize: 13, color: "text.secondary" }}>
      Showing <b>{role}</b> only. Coverage counts include all roles.
    </Box>
  );
}
