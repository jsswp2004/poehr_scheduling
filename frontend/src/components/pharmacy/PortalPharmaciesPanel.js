import { useCallback, useEffect, useState } from "react";
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Stack, Table,
  TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
} from "@mui/material";
import { toast } from "react-toastify";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { authHeader, errorText } from "./pharmacyShared";
import PortalAccessLogDialog from "./PortalAccessLogDialog";

const STATUS_COLOR = { pending: "warning", approved: "success", suspended: "error" };

/**
 * The eRx Routing tab: partner pharmacies on the POWER Pharmacy Portal. POWER administrators approve, suspend and
 * reinstate them; clinic staff add approved ones to the clinic's pharmacy directory so prescriptions can be routed.
 */
export default function PortalPharmaciesPanel() {
  const [rows, setRows] = useState([]);
  const [canApprove, setCanApprove] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [suspend, setSuspend] = useState(null);
  const [reason, setReason] = useState("");
  const [logOpen, setLogOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(apiEndpoints.pharmacyNetwork, { headers: await authHeader() });
      setRows(res.data.results || []);
      setCanApprove(!!res.data.can_approve);
      setError("");
    } catch (err) {
      setError(errorText(err, "Could not load the portal pharmacies."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setStatus = async (p, action, why = "") => {
    try {
      await api.post(apiEndpoints.pharmacyNetworkStatus(p.id), { action, reason: why }, { headers: await authHeader() });
      toast.success(`${p.name}: ${action === "approve" ? "approved" : action === "suspend" ? "suspended" : "reinstated"}.`);
      setSuspend(null);
      load();
    } catch (err) {
      toast.error(errorText(err, "Could not change the pharmacy."));
    }
  };

  const addToDirectory = async (p) => {
    try {
      await api.post(apiEndpoints.pharmacyNetworkAdd(p.id), {}, { headers: await authHeader() });
      toast.success(`${p.name} is in your pharmacy directory: prescriptions sent to it go to the portal.`);
      load();
    } catch (err) {
      toast.error(errorText(err, "Could not add the pharmacy."));
    }
  };

  return (
    <Box sx={{ px: 2, py: 1 }} data-testid="portal-pharmacies">
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>eRx Routing: POWER Pharmacy Portal</Typography>
        <span style={{ flexGrow: 1 }} />
        {canApprove && <Button size="small" onClick={() => setLogOpen(true)} data-testid="open-access-log">Access log</Button>}
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Prescriptions sent to a portal pharmacy reach it electronically. Any approved pharmacy can also claim a printed prescription with its claim code and the patient's birthdate.
        Pharmacies register at /pharmacy-portal/register.
      </Typography>
      {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
      <TableContainer component={Paper} variant="outlined">
        <Table size="small" aria-label="Portal pharmacies">
          <TableHead>
            <TableRow>
              <TableCell>Pharmacy</TableCell>
              <TableCell>FDA LTO</TableCell>
              <TableCell>Status</TableCell>
              {canApprove && <TableCell>Pharmacists (PRC)</TableCell>}
              <TableCell align="right" />
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && rows.length === 0 && <TableRow><TableCell colSpan={5}><CircularProgress size={20} /></TableCell></TableRow>}
            {!loading && rows.length === 0 && (
              <TableRow><TableCell colSpan={5}><Typography variant="body2" color="text.secondary">No portal pharmacies yet.</Typography></TableCell></TableRow>
            )}
            {rows.map((p) => (
              <TableRow key={p.id} data-testid={`partner-row-${p.id}`}>
                <TableCell>
                  <Typography variant="body2">{p.name}</Typography>
                  <Typography variant="caption" color="text.secondary">{[p.city, p.province].filter(Boolean).join(", ")}</Typography>
                </TableCell>
                <TableCell>
                  {p.fda_lto_number}
                  <Typography variant="caption" color={p.lto_expired ? "error.main" : "text.secondary"} sx={{ display: "block" }}>
                    {p.lto_expired ? "Expired " : "Valid until "}{p.lto_expiry}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Chip size="small" color={STATUS_COLOR[p.status] || "default"} label={p.status_label} />
                  {p.status_reason && <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>{p.status_reason}</Typography>}
                </TableCell>
                {canApprove && <TableCell>{(p.pharmacists || []).map((s) => `${s.full_name} ${s.prc_number}`).join("; ")}</TableCell>}
                <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                  {canApprove && p.status === "pending" && <Button size="small" variant="contained" onClick={() => setStatus(p, "approve")} data-testid={`partner-approve-${p.id}`}>Approve</Button>}
                  {canApprove && p.status === "approved" && <Button size="small" color="error" onClick={() => { setReason(""); setSuspend(p); }} data-testid={`partner-suspend-${p.id}`}>Suspend</Button>}
                  {canApprove && p.status === "suspended" && <Button size="small" onClick={() => setStatus(p, "reinstate")}>Reinstate</Button>}
                  {!canApprove && p.can_receive && !p.in_directory && <Button size="small" onClick={() => addToDirectory(p)} data-testid={`partner-add-${p.id}`}>Add to our directory</Button>}
                  {!canApprove && p.in_directory && <Chip size="small" variant="outlined" label="In our directory" />}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <PortalAccessLogDialog open={logOpen} onClose={() => setLogOpen(false)} pharmacies={rows} />
      <Dialog open={!!suspend} onClose={() => setSuspend(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Suspend {suspend?.name}</DialogTitle>
        <DialogContent dividers>
          <TextField size="small" fullWidth label="Reason (sent to the pharmacy)" value={reason} onChange={(e) => setReason(e.target.value)} inputProps={{ "data-testid": "partner-suspend-reason" }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSuspend(null)}>Cancel</Button>
          <Button color="error" variant="contained" disabled={!reason.trim()} onClick={() => setStatus(suspend, "suspend", reason)} data-testid="partner-suspend-confirm">Suspend</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
