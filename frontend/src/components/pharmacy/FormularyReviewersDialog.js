import { useEffect, useState } from "react";
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Switch, Table, TableBody, TableCell,
  TableHead, TableRow, Typography,
} from "@mui/material";
import { toast } from "react-toastify";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { authHeader, errorText, fmtDateTime } from "./pharmacyShared";

/**
 * System administrators only: choose the POWER formulary reviewers, the pharmacists (from any clinic) who may mark
 * SHARED formulary items reviewed. Every change is logged with who made it and when.
 */
export default function FormularyReviewersDialog({ open, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(null); // the pharmacist being changed

  useEffect(() => {
    if (!open) return;
    setData(null);
    setError("");
    (async () => {
      try {
        const res = await api.get(apiEndpoints.formularyReviewers, { headers: await authHeader() });
        setData(res.data);
      } catch (err) {
        setError(errorText(err, "Could not load the pharmacists."));
      }
    })();
  }, [open]);

  const toggle = async (row) => {
    setBusy(row.id);
    setError("");
    try {
      const res = await api.patch(apiEndpoints.formularyReviewer(row.id), { reviewer: !row.reviewer }, { headers: await authHeader() });
      setData(res.data);
      toast.success(row.reviewer ? `${row.name} no longer reviews the shared formulary.` : `${row.name} now reviews the shared formulary.`);
    } catch (err) {
      setError(errorText(err, "Could not change the reviewer."));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth data-testid="formulary-reviewers-dialog">
      <DialogTitle>POWER formulary reviewers</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Reviewers may mark shared POWER formulary items reviewed, together with system administrators. A clinic's own items are reviewed by that clinic's pharmacists.
        </Typography>
        {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
        {!data && !error && <CircularProgress size={24} />}
        {data && (
          <>
            <Table size="small" aria-label="Pharmacists">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: "bold" }}>Pharmacist</TableCell>
                  <TableCell sx={{ fontWeight: "bold" }}>Clinic</TableCell>
                  <TableCell sx={{ fontWeight: "bold" }} align="right">Reviewer</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.results.length === 0 && (
                  <TableRow><TableCell colSpan={3}><Typography variant="body2" color="text.secondary">No pharmacists yet.</Typography></TableCell></TableRow>
                )}
                {data.results.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.name}</TableCell>
                    <TableCell>{r.clinic}</TableCell>
                    <TableCell align="right">
                      <Switch checked={r.reviewer} disabled={busy !== null} onChange={() => toggle(r)} inputProps={{ "aria-label": `${r.name} reviews the shared formulary`, "data-testid": `reviewer-${r.id}` }} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Box sx={{ mt: 2 }} data-testid="reviewers-log">
              <Typography variant="subtitle2">Changes</Typography>
              {data.log.length === 0 && <Typography variant="body2" color="text.secondary">No changes yet.</Typography>}
              {data.log.map((c) => (
                <Typography key={c.id} variant="body2" color="text.secondary">
                  {fmtDateTime(c.at)} · {c.by} {c.granted ? "made" : "removed"} {c.pharmacist} {c.granted ? "a reviewer" : "as a reviewer"}
                </Typography>
              ))}
            </Box>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
