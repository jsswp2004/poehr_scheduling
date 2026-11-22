import { useEffect, useState } from "react";
import {
  Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Stack, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
} from "@mui/material";
import { toast } from "react-toastify";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { authHeader, errorText, fmtDateTime } from "./pharmacyShared";
import { ChangeLines } from "../pharmacyPortal/PortalPharmacyDetailsDialog";

/**
 * eRx Routing (POWER System Admins): a portal pharmacy's details history, and its pending change to the registered
 * name / FDA LTO to approve (applied at once) or reject (with a reason the pharmacy sees).
 */
export default function PartnerChangesDialog({ partner, onClose, onReviewed }) {
  const [history, setHistory] = useState(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = partner?.pending_change || null;

  useEffect(() => {
    if (!partner) return;
    setHistory(null);
    setNote("");
    setError("");
    (async () => {
      try {
        const res = await api.get(apiEndpoints.pharmacyNetworkChanges(partner.id), { headers: await authHeader() });
        setHistory(res.data.results || []);
      } catch (err) {
        setError(errorText(err, "Could not load the history."));
      }
    })();
  }, [partner]);

  const review = async (decision) => {
    setBusy(true);
    setError("");
    try {
      await api.post(apiEndpoints.pharmacyNetworkChangeReview(partner.id, pending.id), { decision, note }, { headers: await authHeader() });
      toast.success(decision === "approve" ? "Approved: the pharmacy's details are updated." : "Rejected: the pharmacy was told why.");
      onReviewed && onReviewed();
    } catch (err) {
      setError(errorText(err, "Could not review the change."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!partner} onClose={busy ? undefined : onClose} maxWidth="md" fullWidth data-testid="partner-changes-dialog">
      <DialogTitle>{partner?.name}: pharmacy details</DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert>}
        {pending && (
          <Alert severity="warning" sx={{ mb: 2 }} data-testid="partner-pending">
            <b>Waiting for your review</b> (sent {fmtDateTime(pending.at)} by {pending.user})
            <ChangeLines change={pending} />
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mt: 1 }} alignItems={{ sm: "center" }}>
              <TextField size="small" label="Note to the pharmacy (required to reject)" value={note} onChange={(e) => setNote(e.target.value)} sx={{ minWidth: 320 }} inputProps={{ "data-testid": "partner-review-note" }} />
              <Button variant="contained" color="success" disabled={busy} onClick={() => review("approve")} data-testid="partner-review-approve">Approve</Button>
              <Button color="error" disabled={busy || !note.trim()} onClick={() => review("reject")} data-testid="partner-review-reject">Reject</Button>
            </Stack>
          </Alert>
        )}
        <Typography variant="subtitle2" sx={{ mb: 1 }}>History</Typography>
        {!history && !error && <CircularProgress size={20} />}
        {history && (
          <TableContainer component={Paper} variant="outlined" sx={{ overflowX: "auto" }}>
            <Table size="small" sx={{ minWidth: 640 }} data-testid="partner-history">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ whiteSpace: "nowrap" }}>When</TableCell>
                  <TableCell>By</TableCell>
                  <TableCell>Change</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {history.length === 0 && <TableRow><TableCell colSpan={4}><Typography variant="body2" color="text.secondary">No changes yet.</Typography></TableCell></TableRow>}
                {history.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>{fmtDateTime(c.at)}</TableCell>
                    <TableCell>{c.user}</TableCell>
                    <TableCell><ChangeLines change={c} /></TableCell>
                    <TableCell>{c.status_label}{c.reviewed_by ? ` · ${c.reviewed_by}` : ""}{c.review_note ? `: ${c.review_note}` : ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
