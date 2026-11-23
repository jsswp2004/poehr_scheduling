import { useCallback, useEffect, useState } from "react";
import {
  Alert, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Grid, Paper, Stack,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
} from "@mui/material";
import { toast } from "react-toastify";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { authHeader, errorText, staffLicenseWord } from "./labShared";

const BLANK = { full_name: "", license_number: "", email: "", mobile: "", is_pathologist: false, can_release: true, username: "", password: "" };

/**
 * The lab's people: medical technologists and pathologists, their license numbers, who may release results, and
 * the mobile numbers that get new-request texts. The lab's administrator adds and changes them; a login is optional.
 */
export default function LabStaffDialog({ open, onClose, me }) {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(BLANK);
  const [error, setError] = useState("");
  const canManage = !!me?.user?.is_admin;
  const country = me?.lab?.country || "PH";

  const load = useCallback(async () => {
    try {
      const res = await api.get(apiEndpoints.labPortalStaff, { headers: await authHeader() });
      setRows(Array.isArray(res.data) ? res.data : res.data.results || []);
    } catch (err) {
      setError(errorText(err, "Could not load your staff."));
    }
  }, []);

  useEffect(() => {
    if (open) {
      setError("");
      setForm(BLANK);
      load();
    }
  }, [open, load]);

  const add = async () => {
    setError("");
    try {
      await api.post(apiEndpoints.labPortalStaff, form, { headers: await authHeader() });
      toast.success(`${form.full_name} added.`);
      setForm(BLANK);
      load();
    } catch (err) {
      setError(errorText(err, "Could not add the person."));
    }
  };

  const change = async (row, patch) => {
    setError("");
    try {
      await api.patch(apiEndpoints.labPortalStaffDetail(row.id), patch, { headers: await authHeader() });
      load();
    } catch (err) {
      setError(errorText(err, "Could not change the person."));
    }
  };

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth data-testid="lab-staff-dialog">
      <DialogTitle>Lab staff</DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
        <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>{staffLicenseWord(country)}</TableCell>
                <TableCell>Mobile (SMS)</TableCell>
                <TableCell>Login</TableCell>
                <TableCell>Can release</TableCell>
                <TableCell>Active</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} data-testid={`lab-staff-${r.id}`}>
                  <TableCell>
                    {r.full_name}
                    {r.is_pathologist && <Chip size="small" label="Pathologist" sx={{ ml: 0.5 }} />}
                    {r.is_admin && <Chip size="small" variant="outlined" label="Admin" sx={{ ml: 0.5 }} />}
                  </TableCell>
                  <TableCell>{r.license_number || "—"}</TableCell>
                  <TableCell>{r.mobile || "—"}</TableCell>
                  <TableCell>{r.username || "—"}</TableCell>
                  <TableCell><Checkbox size="small" checked={r.can_release} disabled={!canManage} onChange={(e) => change(r, { can_release: e.target.checked })} /></TableCell>
                  <TableCell><Checkbox size="small" checked={r.is_active} disabled={!canManage} onChange={(e) => change(r, { is_active: e.target.checked })} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        {canManage ? (
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Add a person</Typography>
            <Grid container spacing={1.5}>
              <Grid size={{ xs: 12, sm: 6 }}><TextField fullWidth size="small" label="Full name" value={form.full_name} onChange={set("full_name")} inputProps={{ "data-testid": "staff-name" }} /></Grid>
              <Grid size={{ xs: 12, sm: 6 }}><TextField fullWidth size="small" label={country === "US" ? "License number" : "PRC license number"} value={form.license_number} onChange={set("license_number")} /></Grid>
              <Grid size={{ xs: 12, sm: 6 }}><TextField fullWidth size="small" label="Email (portal notices)" value={form.email} onChange={set("email")} /></Grid>
              <Grid size={{ xs: 12, sm: 6 }}><TextField fullWidth size="small" label="Mobile for new-request texts" value={form.mobile} onChange={set("mobile")} placeholder={country === "US" ? "(555) 123-4567" : "0917 123 4567"} /></Grid>
              <Grid size={{ xs: 12, sm: 6 }}><TextField fullWidth size="small" label="Username (optional: for a portal login)" value={form.username} onChange={set("username")} /></Grid>
              <Grid size={{ xs: 12, sm: 6 }}><TextField fullWidth size="small" type="password" label="Password (10+ characters)" value={form.password} onChange={set("password")} disabled={!form.username} /></Grid>
            </Grid>
            <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
              <FormControlLabel control={<Checkbox checked={form.is_pathologist} onChange={set("is_pathologist")} />} label="Pathologist" />
              <FormControlLabel control={<Checkbox checked={form.can_release} onChange={set("can_release")} />} label="May release results" />
            </Stack>
            <Button variant="contained" size="small" disabled={!form.full_name.trim()} onClick={add} data-testid="staff-add">Add</Button>
          </Paper>
        ) : (
          <Typography variant="body2" color="text.secondary">Your lab's administrator adds and changes staff.</Typography>
        )}
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Close</Button></DialogActions>
    </Dialog>
  );
}
