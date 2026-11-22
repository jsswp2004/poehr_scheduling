import { useEffect, useState } from "react";
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Grid, Paper, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
} from "@mui/material";
import { toast } from "react-toastify";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { authHeader, errorText, fmtDateTime } from "../pharmacy/pharmacyShared";

/** One change in the history: "Field: old -> new" lines. */
export function ChangeLines({ change }) {
  return Object.entries(change.changes || {}).map(([field, [from, to]]) => (
    <Typography key={field} variant="body2" color="text.secondary">
      {(change.labels || {})[field] || field}: {from || "—"} → {to || "—"}
    </Typography>
  ));
}

/**
 * The portal's "Pharmacy details". The pharmacy's administrator edits the contact details (they apply at once) and
 * can ask to change the registered name and the FDA LTO (they wait for POWER's review on eRx Routing). Pharmacists
 * read them. A suspended pharmacy can only view. The history lists every change, who made it, and the review.
 */
export default function PortalPharmacyDetailsDialog({ open, onClose, onSaved }) {
  const [data, setData] = useState(null);
  const [form, setForm] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const fill = (d) => {
    setData(d);
    setForm({ ...d.pharmacy });
  };

  useEffect(() => {
    if (!open) return;
    setData(null);
    setError("");
    (async () => {
      try {
        const res = await api.get(apiEndpoints.portalPharmacy, { headers: await authHeader() });
        fill(res.data);
      } catch (err) {
        setError(errorText(err, "Could not load the pharmacy details."));
      }
    })();
  }, [open]);

  const editable = !!data?.can_edit;
  const pendingFields = Object.keys(data?.pending?.changes || {});
  const changed = data ? [...data.contact_fields, ...data.regulatory_fields].filter((f) => String(form[f] ?? "") !== String(data.pharmacy[f] ?? "")) : [];

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await api.patch(apiEndpoints.portalPharmacy, Object.fromEntries(changed.map((f) => [f, form[f]])), { headers: await authHeader() });
      fill(res.data);
      toast.success(res.data.submitted_for_review ? "Saved. The registered name / LTO change was sent to POWER for review." : "Pharmacy details saved.");
      onSaved && onSaved();
    } catch (err) {
      setError(errorText(err, "Could not save the pharmacy details."));
    } finally {
      setBusy(false);
    }
  };

  const field = (key, extra = {}) => (
    <TextField
      size="small" fullWidth label={data.labels[key]} value={form[key] ?? ""} disabled={!editable || pendingFields.includes(key)}
      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} inputProps={{ "data-testid": `details-${key}` }} {...extra}
    />
  );

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="lg" fullWidth data-testid="portal-details-dialog">
      <DialogTitle>Pharmacy details</DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 1.5 }} data-testid="details-error">{error}</Alert>}
        {!data && !error && <CircularProgress size={24} />}
        {data && (
          <Box>
            {data.pending && (
              <Alert severity="info" sx={{ mb: 1.5 }} data-testid="details-pending">
                <b>Pending POWER review</b> (sent {fmtDateTime(data.pending.at)} by {data.pending.user}). Nothing changes until POWER approves it.
                <ChangeLines change={data.pending} />
              </Alert>
            )}
            {!editable && (
              <Alert severity="info" icon={false} sx={{ mb: 1.5, py: 0 }} data-testid="details-readonly">
                {data.pharmacy.status === "suspended" ? "Your pharmacy is suspended: its details can be viewed but not changed." : "Only your pharmacy's administrator can change these details."}
              </Alert>
            )}
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Contact details (saved at once)</Typography>
            <Grid container spacing={1.5} sx={{ mb: 2 }}>
              <Grid size={{ xs: 12, md: 8 }}>{field("address")}</Grid>
              <Grid size={{ xs: 12, md: 4 }}>{field("barangay")}</Grid>
              <Grid size={{ xs: 12, sm: 6 }}>{field("city")}</Grid>
              <Grid size={{ xs: 12, sm: 6 }}>{field("province")}</Grid>
              <Grid size={{ xs: 12, sm: 4 }}>{field("phone")}</Grid>
              <Grid size={{ xs: 12, sm: 4 }}>{field("email")}</Grid>
              <Grid size={{ xs: 12, sm: 4 }}>{field("sms_mobile", { placeholder: "0917 123 4567", helperText: "New-prescription texts when no pharmacist has a mobile" })}</Grid>
            </Grid>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Registered details (POWER reviews changes)</Typography>
            <Grid container spacing={1.5} sx={{ mb: 2 }}>
              <Grid size={{ xs: 12, md: 6 }}>{field("name")}</Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>{field("fda_lto_number")}</Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>{field("lto_expiry", { type: "date", InputLabelProps: { shrink: true } })}</Grid>
            </Grid>
            {data.pharmacy.problem && <Alert severity="warning" sx={{ mb: 2 }}>{data.pharmacy.problem}</Alert>}
            <Typography variant="subtitle2" sx={{ mb: 1 }}>History</Typography>
            <TableContainer component={Paper} variant="outlined" sx={{ overflowX: "auto" }}>
              <Table size="small" aria-label="Pharmacy details history" sx={{ minWidth: 700 }} data-testid="details-history">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>When</TableCell>
                    <TableCell>By</TableCell>
                    <TableCell>Change</TableCell>
                    <TableCell>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.history.length === 0 && <TableRow><TableCell colSpan={4}><Typography variant="body2" color="text.secondary">No changes yet.</Typography></TableCell></TableRow>}
                  {data.history.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>{fmtDateTime(c.at)}</TableCell>
                      <TableCell>{c.user}</TableCell>
                      <TableCell><ChangeLines change={c} /></TableCell>
                      <TableCell>
                        {c.status_label}
                        {c.reviewed_by && <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>{c.reviewed_by}{c.review_note ? `: ${c.review_note}` : ""}</Typography>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Close</Button>
        {editable && <Button variant="contained" onClick={save} disabled={busy || changed.length === 0} data-testid="details-save">Save</Button>}
      </DialogActions>
    </Dialog>
  );
}
