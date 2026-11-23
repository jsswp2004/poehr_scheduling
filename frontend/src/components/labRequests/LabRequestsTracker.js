import { useCallback, useEffect, useState } from "react";
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Typography,
} from "@mui/material";
import { toast } from "react-toastify";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { LAB_STATUS_COLOR, authHeader, errorText, fmtDateTime } from "../labPortal/labShared";

const CANCELLABLE = ["unclaimed", "new", "accepted", "collected", "in_process"];

/**
 * A patient's lab requests at outside labs (POWER Lab Portal): where each is, the code the patient shows, and Cancel.
 * Released results arrive in Lab Results and the provider's inbox like any other lab report.
 */
export default function LabRequestsTracker({ patientId = null, refreshKey = 0, canCancel = false, openOnly = false, title = "Outside lab requests" }) {
  const clinicWide = !patientId;
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [cancelling, setCancelling] = useState(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    try {
      const params = clinicWide ? (openOnly ? { open: 1 } : {}) : { patient: patientId };
      const res = await api.get(apiEndpoints.labRequests, { headers: await authHeader(), params });
      setRows(Array.isArray(res.data) ? res.data : res.data.results || []);
      setError("");
    } catch (err) {
      setRows([]);
      if (err?.response && err.response.status !== 403) setError(errorText(err, "Could not load the outside lab requests."));
    }
  }, [patientId, clinicWide, openOnly]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const cancel = async () => {
    try {
      await api.post(apiEndpoints.labRequestCancel(cancelling.id), { reason }, { headers: await authHeader() });
      toast.success(`${cancelling.number} cancelled. The lab was told.`);
      setCancelling(null);
      load();
    } catch (err) {
      toast.error(errorText(err, "Could not cancel the lab request."));
    }
  };

  if (rows.length === 0 && !error && !clinicWide) return null;

  return (
    <Box data-testid="lab-requests-tracker">
      {title && <Typography variant="subtitle1" sx={{ mb: 1 }}>{title}</Typography>}
      {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Request</TableCell>
              {clinicWide && <TableCell>Patient</TableCell>}
              <TableCell>Tests</TableCell>
              <TableCell>Lab</TableCell>
              <TableCell>Patient's code</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Updated</TableCell>
              <TableCell align="right" />
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={clinicWide ? 8 : 7}><Typography variant="body2" color="text.secondary" data-testid="lab-requests-empty">No outside lab requests{openOnly ? " waiting" : ""}.</Typography></TableCell></TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id} data-testid={`lab-request-row-${r.id}`}>
                <TableCell>
                  {r.number}
                  {r.priority === "stat" && <Chip size="small" color="error" label="STAT" sx={{ ml: 0.5 }} />}
                  {r.care_setting === "inpatient" && <Typography variant="caption" display="block" color="text.secondary">Inpatient{r.location ? ` · ${r.location}` : ""}</Typography>}
                </TableCell>
                {clinicWide && <TableCell>{r.patient?.name}<Typography variant="caption" display="block" color="text.secondary">{r.provider}</Typography></TableCell>}
                <TableCell>{r.tests.map((t) => t.name).join(", ")}</TableCell>
                <TableCell>{r.lab || <Typography variant="body2" color="text.secondary">Patient chooses</Typography>}</TableCell>
                <TableCell><code>{r.claim_code}</code></TableCell>
                <TableCell>
                  <Chip size="small" color={LAB_STATUS_COLOR[r.status] || "default"} label={r.status_label} />
                  {r.decline_reason && <Typography variant="caption" display="block" color="error">{r.decline_reason}</Typography>}
                  {r.cancel_reason && <Typography variant="caption" display="block" color="text.secondary">{r.cancel_reason}</Typography>}
                </TableCell>
                <TableCell>{fmtDateTime(r.updated_at)}</TableCell>
                <TableCell align="right">
                  {canCancel && CANCELLABLE.includes(r.status) && (
                    <Button size="small" color="error" onClick={() => { setReason(""); setCancelling(r); }} data-testid={`lab-request-cancel-${r.id}`}>Cancel</Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Dialog open={!!cancelling} onClose={() => setCancelling(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Cancel {cancelling?.number}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1}>
            <Typography variant="body2">The lab is told not to collect, and the orders can be sent again.</Typography>
            <TextField autoFocus size="small" label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} inputProps={{ "data-testid": "lab-request-cancel-reason" }} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCancelling(null)}>Back</Button>
          <Button color="error" variant="contained" disabled={!reason.trim()} onClick={cancel} data-testid="lab-request-cancel-confirm">Cancel request</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
