import { useCallback, useEffect, useState } from "react";
import { jwtDecode } from "jwt-decode";
import {
  Alert, Autocomplete, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Grid,
  MenuItem, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
} from "@mui/material";
import ScienceIcon from "@mui/icons-material/Science";
import { toast } from "react-toastify";
import { api } from "../api/client";
import { apiEndpoints } from "../config/api";
import { authHeader, errorText, licenseWord } from "../components/labPortal/labShared";

const MODES = [
  { value: "partner_portal", label: "POWER Lab Portal partner" },
  { value: "interface", label: "HL7 interface" },
  { value: "in_house", label: "In-house lab" },
  { value: "print_only", label: "Printed requisition only" },
];
const STATUS_COLOR = { pending: "warning", approved: "success", suspended: "error" };
const BLANK = { name: "", mode: "partner_portal", partner: null, address: "", phone: "", is_default: false, accepts_inpatient: false };

const roleOf = () => {
  try {
    return jwtDecode(localStorage.getItem("access_token") || "").role || "";
  } catch (e) {
    return "";
  }
};

/** POWER administrators: partner labs that registered on the portal, to approve, suspend or reinstate. */
function PartnerApprovals() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [suspend, setSuspend] = useState(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await api.get(apiEndpoints.labAdminPartners, { headers: await authHeader() });
      setRows(res.data || []);
    } catch (err) {
      setError(errorText(err, "Could not load the partner labs."));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setStatus = async (p, action, why = "") => {
    try {
      await api.post(apiEndpoints.labAdminPartnerStatus(p.id), { action, reason: why }, { headers: await authHeader() });
      toast.success(`${p.name}: ${action === "suspend" ? "suspended" : "approved"}.`);
      setSuspend(null);
      load();
    } catch (err) {
      toast.error(errorText(err, "Could not change the lab."));
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: 2 }} data-testid="lab-partner-approvals">
      <Typography variant="subtitle1" sx={{ mb: 0.5 }}>Partner labs on the POWER Lab Portal</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Labs register at /lab-portal/register. Check the license (DOH LTO or CLIA) and the head of the lab before approving.
      </Typography>
      {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Lab</TableCell>
              <TableCell>License</TableCell>
              <TableCell>Head</TableCell>
              <TableCell>Offers</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right" />
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((p) => (
              <TableRow key={p.id} data-testid={`partner-row-${p.id}`}>
                <TableCell>
                  <Typography variant="body2" fontWeight={600}>{p.name}</Typography>
                  <Typography variant="caption" color="text.secondary">{[p.city, p.province, p.country].filter(Boolean).join(", ")} · {p.email}</Typography>
                </TableCell>
                <TableCell>
                  {licenseWord(p.country)} {p.license_number}
                  <Typography variant="caption" display="block" color={p.problem ? "error" : "text.secondary"}>valid until {p.license_expiry}</Typography>
                </TableCell>
                <TableCell>{p.head_name}{p.head_license ? ` (${p.head_license})` : ""}</TableCell>
                <TableCell>
                  {[p.offers_walk_in && "walk-in", p.offers_bedside && "bedside", p.offers_courier && "courier", p.offers_home_service && "home service"].filter(Boolean).join(", ")}
                </TableCell>
                <TableCell>
                  <Chip size="small" color={STATUS_COLOR[p.status] || "default"} label={p.status} />
                  {p.status_reason && <Typography variant="caption" display="block" color="text.secondary">{p.status_reason}</Typography>}
                </TableCell>
                <TableCell align="right">
                  {p.status === "pending" && <Button size="small" onClick={() => setStatus(p, "approve")} data-testid={`partner-approve-${p.id}`}>Approve</Button>}
                  {p.status === "suspended" && <Button size="small" onClick={() => setStatus(p, "reinstate")}>Reinstate</Button>}
                  {p.status !== "suspended" && <Button size="small" color="error" onClick={() => { setReason(""); setSuspend(p); }}>Suspend</Button>}
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && <TableRow><TableCell colSpan={6}><Typography variant="body2" color="text.secondary">No labs have registered yet.</Typography></TableCell></TableRow>}
          </TableBody>
        </Table>
      </TableContainer>
      <Dialog open={!!suspend} onClose={() => setSuspend(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Suspend {suspend?.name}</DialogTitle>
        <DialogContent dividers>
          <TextField autoFocus fullWidth size="small" label="Reason (the lab sees it)" value={reason} onChange={(e) => setReason(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSuspend(null)}>Back</Button>
          <Button color="error" variant="contained" disabled={!reason.trim()} onClick={() => setStatus(suspend, "suspend", reason)}>Suspend</Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}

/**
 * Partner Labs (/lab-network): the clinic's lab directory (which outside labs its providers can send lab orders to,
 * the default, and which take inpatient work) and, for POWER administrators, partner lab approval.
 */
export default function LabNetworkPage() {
  const role = roleOf();
  const isSysAdmin = role === "system_admin";
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState(BLANK);
  const [partners, setPartners] = useState([]);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await api.get(apiEndpoints.clinicLabs, { headers: await authHeader(), params: { all: 1 } });
      setRows(res.data.results || []);
      setError("");
    } catch (err) {
      setError(errorText(err, "Could not load your lab directory."));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await api.get(apiEndpoints.labPartners, { headers: await authHeader(), params: { q } });
        if (live) setPartners(res.data || []);
      } catch (err) {
        if (live) setPartners([]);
      }
    })();
    return () => {
      live = false;
    };
  }, [q]);

  const add = async () => {
    try {
      await api.post(apiEndpoints.clinicLabs, { ...form, partner: form.partner ? form.partner.id : null }, { headers: await authHeader() });
      toast.success(`${form.name} added to your lab directory.`);
      setForm(BLANK);
      load();
    } catch (err) {
      toast.error(errorText(err, "Could not add the lab."));
    }
  };

  const change = async (row, patch) => {
    try {
      await api.patch(apiEndpoints.clinicLab(row.id), patch, { headers: await authHeader() });
      load();
    } catch (err) {
      toast.error(errorText(err, "Could not change the lab."));
    }
  };

  return (
    <Box sx={{ px: 2, py: 2, maxWidth: 1200, mx: "auto" }} data-testid="lab-network-page">
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <ScienceIcon color="primary" />
        <Typography variant="h6">Partner Labs</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Outside laboratories your providers can send signed lab orders to. Labs on the POWER Lab Portal get the request in their portal
        and by text, and send results straight back to the ordering provider.
      </Typography>
      {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>Your lab directory</Typography>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>How orders go</TableCell>
                <TableCell>Portal lab</TableCell>
                <TableCell>Default</TableCell>
                <TableCell>Inpatient</TableCell>
                <TableCell>Active</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} data-testid={`clinic-lab-${r.id}`}>
                  <TableCell>{r.name}</TableCell>
                  <TableCell>{r.mode_label}</TableCell>
                  <TableCell>
                    {r.partner ? r.partner.name : "—"}
                    {r.partner?.problem && <Typography variant="caption" display="block" color="error">{r.partner.problem}</Typography>}
                  </TableCell>
                  <TableCell><Checkbox size="small" checked={r.is_default} onChange={(e) => change(r, { is_default: e.target.checked })} /></TableCell>
                  <TableCell><Checkbox size="small" checked={r.accepts_inpatient} onChange={(e) => change(r, { accepts_inpatient: e.target.checked })} /></TableCell>
                  <TableCell><Checkbox size="small" checked={r.is_active} onChange={(e) => change(r, { is_active: e.target.checked })} /></TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && <TableRow><TableCell colSpan={6}><Typography variant="body2" color="text.secondary">No labs yet. Add one below.</Typography></TableCell></TableRow>}
            </TableBody>
          </Table>
        </TableContainer>

        <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>Add a lab</Typography>
        <Grid container spacing={1.5}>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField select fullWidth size="small" label="How orders go" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value, partner: e.target.value === "partner_portal" ? form.partner : null })}>
              {MODES.map((m) => <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>)}
            </TextField>
          </Grid>
          {form.mode === "partner_portal" && (
            <Grid size={{ xs: 12, sm: 8 }}>
              <Autocomplete
                size="small"
                options={partners}
                value={form.partner}
                onChange={(_, p) => setForm({ ...form, partner: p, name: form.name || (p ? p.name : "") })}
                onInputChange={(_, text) => setQ(text)}
                getOptionLabel={(p) => `${p.name}${p.city ? ` · ${p.city}` : ""}`}
                isOptionEqualToValue={(a, b) => a.id === b.id}
                getOptionDisabled={(p) => !!p.problem}
                renderInput={(params) => <TextField {...params} label="Approved POWER Lab Portal lab" />}
                data-testid="clinic-lab-partner"
              />
            </Grid>
          )}
          <Grid size={{ xs: 12, sm: 4 }}><TextField fullWidth size="small" label="Name in your directory" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} inputProps={{ "data-testid": "clinic-lab-name" }} /></Grid>
          <Grid size={{ xs: 12, sm: 4 }}><TextField fullWidth size="small" label="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Grid>
          <Grid size={{ xs: 12, sm: 4 }}><TextField fullWidth size="small" label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Grid>
        </Grid>
        <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 1 }}>
          <FormControlLabel control={<Checkbox checked={form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} />} label="Default lab" />
          <FormControlLabel control={<Checkbox checked={form.accepts_inpatient} onChange={(e) => setForm({ ...form, accepts_inpatient: e.target.checked })} />} label="Takes our inpatient (outsourced) labs" />
          <Button variant="contained" size="small" disabled={!form.name.trim() || (form.mode === "partner_portal" && !form.partner)} onClick={add} data-testid="clinic-lab-add">Add</Button>
        </Stack>
      </Paper>

      {isSysAdmin && <PartnerApprovals />}
    </Box>
  );
}
