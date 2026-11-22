import { useCallback, useEffect, useState } from "react";
import {
  Alert, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Grid, Paper, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Typography,
} from "@mui/material";
import { toast } from "react-toastify";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { authHeader, errorText } from "../pharmacy/pharmacyShared";

const BLANK = { full_name: "", prc_number: "", email: "", mobile: "", username: "", password: "" };

/**
 * The pharmacy's pharmacists: name, PRC license number (RA 10918) and email (each active pharmacist gets the portal
 * notices). The pharmacy's administrator adds, edits and deactivates them; a portal login is optional.
 */
export default function PortalStaffDialog({ open, onClose }) {
  const [rows, setRows] = useState([]);
  const [canManage, setCanManage] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [editing, setEditing] = useState(null); // { id, full_name, prc_number, email }
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await api.get(apiEndpoints.portalStaff, { headers: await authHeader() });
      setRows(res.data.results || []);
      setCanManage(!!res.data.can_manage);
    } catch (err) {
      setError(errorText(err, "Could not load your pharmacists."));
    }
  }, []);

  useEffect(() => {
    if (open) {
      setError("");
      setForm(BLANK);
      setEditing(null);
      load();
    }
  }, [open, load]);

  const save = async (fn, message) => {
    setError("");
    try {
      await fn();
      toast.success(message);
      load();
      return true;
    } catch (err) {
      setError(errorText(err, "Could not save."));
      return false;
    }
  };

  const add = async () => {
    if (await save(async () => api.post(apiEndpoints.portalStaff, form, { headers: await authHeader() }), "Pharmacist added.")) setForm(BLANK);
  };
  const update = async (id, body, message) => save(async () => api.patch(apiEndpoints.portalStaffDetail(id), body, { headers: await authHeader() }), message);

  const f = (key, label, extra = {}) => (
    <TextField size="small" fullWidth label={label} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} inputProps={{ "data-testid": `staff-${key}` }} {...extra} />
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth data-testid="portal-staff-dialog">
      <DialogTitle>Pharmacists</DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 1 }} data-testid="staff-error">{error}</Alert>}
        <TableContainer component={Paper} variant="outlined" sx={{ overflowX: "auto" }}>
          <Table size="small" aria-label="Pharmacists" sx={{ minWidth: 900 }}>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>PRC number</TableCell>
                <TableCell>Email (portal notices)</TableCell>
                <TableCell sx={{ minWidth: 190, whiteSpace: "nowrap" }}>Mobile (SMS)</TableCell>
                <TableCell>Login</TableCell>
                <TableCell>Status</TableCell>
                {canManage && <TableCell />}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((s) =>
                editing && editing.id === s.id ? (
                  <TableRow key={s.id} data-testid={`staff-row-${s.id}`}>
                    <TableCell><TextField size="small" value={editing.full_name} onChange={(e) => setEditing({ ...editing, full_name: e.target.value })} /></TableCell>
                    <TableCell><TextField size="small" value={editing.prc_number} onChange={(e) => setEditing({ ...editing, prc_number: e.target.value })} inputProps={{ "data-testid": "staff-edit-prc" }} /></TableCell>
                    <TableCell><TextField size="small" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} inputProps={{ "data-testid": "staff-edit-email" }} /></TableCell>
                    <TableCell sx={{ minWidth: 190 }}><TextField size="small" fullWidth sx={{ minWidth: 180 }} value={editing.mobile} placeholder="0917 123 4567" onChange={(e) => setEditing({ ...editing, mobile: e.target.value })} inputProps={{ "data-testid": "staff-edit-mobile" }} /></TableCell>
                    <TableCell>{s.username || "—"}</TableCell>
                    <TableCell />
                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      <Button size="small" variant="contained" data-testid="staff-edit-save"
                        onClick={async () => { if (await update(s.id, { full_name: editing.full_name, prc_number: editing.prc_number, email: editing.email, mobile: editing.mobile }, "Saved.")) setEditing(null); }}>
                        Save
                      </Button>
                      <Button size="small" onClick={() => setEditing(null)}>Cancel</Button>
                    </TableCell>
                  </TableRow>
                ) : (
                  <TableRow key={s.id} data-testid={`staff-row-${s.id}`} sx={{ opacity: s.is_active ? 1 : 0.55 }}>
                    <TableCell>{s.full_name}{s.is_admin && <Chip size="small" variant="outlined" label="Admin" sx={{ ml: 0.5 }} />}</TableCell>
                    <TableCell>{s.prc_number || "—"}</TableCell>
                    <TableCell>{s.email || "—"}</TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>{s.mobile || "—"}</TableCell>
                    <TableCell>{s.username || "No login"}</TableCell>
                    <TableCell>{s.is_active ? "Active" : "Deactivated"}</TableCell>
                    {canManage && (
                      <TableCell sx={{ whiteSpace: "nowrap" }}>
                        <Button size="small" onClick={() => setEditing({ id: s.id, full_name: s.full_name, prc_number: s.prc_number, email: s.email, mobile: s.mobile || "" })} data-testid={`staff-edit-${s.id}`}>Edit</Button>
                        <Button size="small" color={s.is_active ? "error" : "primary"} data-testid={`staff-toggle-${s.id}`}
                          onClick={() => update(s.id, { is_active: !s.is_active }, s.is_active ? "Deactivated." : "Reactivated.")}>
                          {s.is_active ? "Deactivate" : "Reactivate"}
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                )
              )}
            </TableBody>
          </Table>
        </TableContainer>
        {canManage ? (
          <Stack spacing={1} sx={{ mt: 2 }} data-testid="staff-add">
            <Typography variant="subtitle2">Add a pharmacist</Typography>
            <Grid container spacing={1}>
              <Grid size={{ xs: 12, sm: 4 }}>{f("full_name", "Full name")}</Grid>
              <Grid size={{ xs: 12, sm: 4 }}>{f("prc_number", "PRC license number")}</Grid>
              <Grid size={{ xs: 12, sm: 4 }}>{f("email", "Email")}</Grid>
              <Grid size={{ xs: 12, sm: 4 }}>{f("mobile", "Mobile for SMS (optional)", { placeholder: "0917 123 4567" })}</Grid>
              <Grid size={{ xs: 12, sm: 4 }}>{f("username", "Portal username (optional)")}</Grid>
              <Grid size={{ xs: 12, sm: 4 }}>{f("password", "Password (10+ characters, optional)", { type: "password" })}</Grid>
            </Grid>
            <Stack direction="row">
              <Button variant="contained" size="small" disabled={!form.full_name.trim() || !form.prc_number.trim() || !form.email.trim()} onClick={add} data-testid="staff-add-save">
                Add pharmacist
              </Button>
            </Stack>
          </Stack>
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Only your pharmacy's administrator can change this list.</Typography>
        )}
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Close</Button></DialogActions>
    </Dialog>
  );
}
