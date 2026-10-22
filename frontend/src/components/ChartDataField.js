import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { api } from "../api/client";
import { apiEndpoints } from "../config/api";
import { getValidToken } from "../utils/auth";
import { chartSourceLabel } from "../utils/chartSources";

/**
 * A "Chart data" note field: part of the patient's chart (problem list, allergies, medications,
 * results, vitals, immunizations, Health Manager) shown read-only inside the note.
 *
 * While the note is being written it reads the chart live. The server keeps a snapshot of it in the
 * note on every save and again at signing (see appointments/chart_data.py), so a signed note always
 * shows what the chart said then; `value` is that stored snapshot and is what shows when the chart
 * can't be read (no patient, a failed request, or the Preview tab of the template editor).
 */
export default function ChartDataField({ field, value, patientId }) {
  const source = field.calc && field.calc.source;
  const [live, setLive] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!patientId || !source) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get(`${apiEndpoints.noteChartData}?patient=${patientId}&source=${source}`, {
          headers: { Authorization: `Bearer ${await getValidToken()}` },
        });
        if (!cancelled) {
          setLive(res.data);
          setFailed(false);
        }
      } catch (e) {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [patientId, source]);

  const data = live || (value && typeof value === "object" ? value : null);
  const title = (data && data.title) || field.label;

  let body;
  if (!data) {
    body = (
      <Typography variant="body2" color="text.secondary">
        {patientId && !failed
          ? "Loading from the chart..."
          : failed
          ? "Could not load this part of the chart."
          : `Shown from the patient's chart: ${chartSourceLabel(source)}.`}
      </Typography>
    );
  } else if (data.hidden) {
    body = <Alert severity="info">You don't have access to this part of the chart.</Alert>;
  } else if (!data.rows || data.rows.length === 0) {
    body = (
      <Typography variant="body2" color="text.secondary">
        {data.empty || "Nothing on the chart."}
      </Typography>
    );
  } else {
    body = (
      <Table size="small" aria-label={field.label}>
        <TableHead>
          <TableRow>
            {data.columns.map((c) => (
              <TableCell key={c.key} sx={{ fontWeight: 600, py: 0.5 }}>
                {c.label}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {data.rows.map((row, i) => (
            <TableRow key={i}>
              {data.columns.map((c) => (
                <TableCell key={c.key} sx={{ py: 0.5 }}>
                  {row[c.key] || ""}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  return (
    <Box
      data-testid={`chart-data-${field.key}`}
      sx={{ border: 1, borderColor: "divider", borderRadius: 1, overflow: "hidden" }}
    >
      <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 1.5, py: 0.75, bgcolor: "action.hover" }}>
        <Typography variant="subtitle2">{title}</Typography>
        <Chip size="small" label="From chart" color="info" variant="outlined" />
        {field.help_text && (
          <Typography variant="caption" color="text.secondary">
            {field.help_text}
          </Typography>
        )}
      </Stack>
      <Box sx={{ px: 1.5, py: 1 }}>{body}</Box>
    </Box>
  );
}
