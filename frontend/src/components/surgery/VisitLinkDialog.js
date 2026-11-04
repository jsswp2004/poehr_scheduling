import { useCallback, useEffect, useState } from "react";
import { Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from "@mui/material";
import { toast } from "../SimpleToast";
import { errorText } from "../patientHeader/headerApi";
import { surgeryApi } from "./surgeryApi";
import { usDateTime } from "./surgeryUtils";

/** Case/Visit Link: find the patient's visits by date range and status, then tick the one this case belongs to. */
export default function VisitLinkDialog({ open, caseId, onClose, onLinked }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    const params = {};
    if (from) params.date_from = from;
    if (to) params.date_to = to;
    if (status) params.status = status;
    surgeryApi.caseVisits(caseId, params).then(setRows).catch((e) => toast.error(errorText(e, "Could not load the visits.")));
  }, [caseId, from, to, status]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const link = async (visitId) => {
    setBusy(true);
    try {
      onLinked(await surgeryApi.updateCase(caseId, { visit: visitId }));
      toast.success(visitId ? "Visit linked" : "Visit unlinked");
      onClose();
    } catch (err) {
      toast.error(errorText(err, "The visit link was not changed."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Case/Visit Link</DialogTitle>
      <DialogContent>
        <Stack direction="row" spacing={1} sx={{ py: 1 }}>
          <TextField size="small" type="date" label="From" value={from} onChange={(e) => setFrom(e.target.value)} InputLabelProps={{ shrink: true }} />
          <TextField size="small" type="date" label="To" value={to} onChange={(e) => setTo(e.target.value)} InputLabelProps={{ shrink: true }} />
          <TextField select size="small" label="Visit status" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ minWidth: 150 }}>
            <MenuItem value="">All</MenuItem>
            <MenuItem value="open">Open</MenuItem>
            <MenuItem value="discharged">Discharged</MenuItem>
          </TextField>
        </Stack>
        <Table size="small" aria-label="Patient visits">
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox">Link</TableCell>
              {["Visit ID", "Date", "Care Setting", "Reason / Procedure", "Location", "Status"].map((h) => (
                <TableCell key={h}>{h}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {(rows || []).map((v) => (
              <TableRow key={v.id} selected={v.linked}>
                <TableCell padding="checkbox">
                  <Checkbox size="small" checked={v.linked} disabled={busy} onChange={() => link(v.linked ? null : v.id)} inputProps={{ "aria-label": `Link ${v.visit_number}` }} />
                </TableCell>
                <TableCell>
                  {v.visit_number}
                  {v.other_case && (
                    <Box component="span" sx={{ display: "block", fontSize: 11, color: "warning.main" }}>
                      also on case {v.other_case}
                    </Box>
                  )}
                </TableCell>
                <TableCell>{usDateTime(v.date)}</TableCell>
                <TableCell>{v.care_setting}</TableCell>
                <TableCell>{v.reason}</TableCell>
                <TableCell>{v.location}</TableCell>
                <TableCell>{v.status === "open" ? "Open" : "Discharged"}</TableCell>
              </TableRow>
            ))}
            {rows && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7}>
                  <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>
                    No visits found for this patient.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
