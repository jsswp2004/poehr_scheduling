import { Alert, Box, Paper, Stack, Typography } from "@mui/material";
import { formatMl } from "../utils/ioHelpers";

const PERIODS = [
  ["shift", "This shift"],
  ["day", "Last 24 hours"],
  ["stay", "Length of stay"],
];

/** Alert banner and shift / 24 h / stay totals for the Intake & Output flowsheet. */
export default function IntakeOutputSummary({ summary }) {
  if (!summary) return null;
  const alerts = summary.alerts || [];
  return (
    <Box sx={{ mb: 2 }} data-testid="io-summary">
      {alerts.length > 0 && (
        <Stack spacing={1} sx={{ mb: 1.5 }}>
          {alerts.map((alert) => (
            <Alert key={alert.code} severity="warning">
              {alert.message}
            </Alert>
          ))}
        </Stack>
      )}
      <Stack direction={{ xs: "column", md: "row" }} spacing={1.5}>
        {PERIODS.map(([key, title]) => {
          const period = summary.periods?.[key];
          if (!period) return null;
          return (
            <Paper key={key} variant="outlined" sx={{ flex: 1, p: 1.5, borderRadius: 2 }}>
              <Typography variant="caption" color="text.secondary" display="block">
                {title}
                {key === "shift" && period.label ? ` (${period.label})` : ""}
              </Typography>
              <Stack direction="row" spacing={3} sx={{ mt: 0.5 }}>
                <Box>
                  <Typography variant="caption" color="text.secondary">Intake</Typography>
                  <Typography variant="h6">{formatMl(period.intake)}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Output</Typography>
                  <Typography variant="h6">{formatMl(period.output)}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Net</Typography>
                  <Typography variant="h6" aria-label={`${title} net`}>{formatMl(period.net, { signed: true })}</Typography>
                </Box>
              </Stack>
            </Paper>
          );
        })}
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.75 }}>
        All amounts in mL (1 oz = 30 mL). Insensible loss is not measured or added.
        {summary.urine_ml_kg_h != null ? ` Urine ${summary.urine_ml_kg_h} mL/kg/h over the last 6 hours (${summary.weight_kg} kg).` : ""}
      </Typography>
    </Box>
  );
}
