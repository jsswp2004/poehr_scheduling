import { useCallback, useEffect, useState } from "react";
import {
  Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Stack, Table, TableBody, TableCell,
  TableHead, TableRow, TextField, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { toast } from "../SimpleToast";
import { errorText } from "../patientHeader/headerApi";
import { surgeryApi } from "./surgeryApi";

const blank = { name: "", policy_type: "case_time", time_basis: "or", first_code: "", first_minutes: 30, extra_code: "", extra_minutes: 15, description: "", is_active: true };
const TYPES = [{ value: "case_time", label: "Case Time based" }, { value: "mlm", label: "MLM" }];
const BASES = [{ value: "or", label: "OR time" }, { value: "anesthesia", label: "Anesthesia time" }];

function PolicyEditor({ open, policy, onClose, onSaved }) {
  const [f, setF] = useState(blank);
  useEffect(() => {
    if (open) setF(policy || blank);
  }, [open, policy]);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = async () => {
    const body = { ...f, first_minutes: Math.max(parseInt(f.first_minutes, 10) || 30, 1), extra_minutes: Math.max(parseInt(f.extra_minutes, 10) || 15, 1) };
    delete body.id;
    try {
      onSaved(policy?.id ? await surgeryApi.updatePolicy(policy.id, body) : await surgeryApi.createPolicy(body));
      toast.success("Charge policy saved");
      onClose();
    } catch (err) {
      toast.error(errorText(err, "The policy was not saved."));
    }
  };
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{policy?.id ? "Edit Charge Policy" : "New Charge Policy"}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField size="small" label="Policy name" value={f.name} onChange={set("name")} />
          <Stack direction="row" spacing={2}>
            <TextField select size="small" label="Policy type" value={f.policy_type} onChange={set("policy_type")} sx={{ flex: 1 }}>
              {TYPES.map((t) => (
                <MenuItem key={t.value} value={t.value}>
                  {t.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField select size="small" label="Time basis" value={f.time_basis} onChange={set("time_basis")} sx={{ flex: 1 }}>
              {BASES.map((t) => (
                <MenuItem key={t.value} value={t.value}>
                  {t.label}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          <Stack direction="row" spacing={2}>
            <TextField size="small" label="First block code" value={f.first_code} onChange={set("first_code")} sx={{ flex: 2 }} />
            <TextField size="small" type="number" label="First block minutes" value={f.first_minutes} onChange={set("first_minutes")} sx={{ flex: 1 }} />
          </Stack>
          <Stack direction="row" spacing={2}>
            <TextField size="small" label="Extra block code" value={f.extra_code} onChange={set("extra_code")} sx={{ flex: 2 }} />
            <TextField size="small" type="number" label="Extra block minutes" value={f.extra_minutes} onChange={set("extra_minutes")} sx={{ flex: 1 }} />
          </Stack>
          <TextField size="small" label="Description" value={f.description} onChange={set("description")} />
          <FormControlLabel control={<Checkbox checked={f.is_active} onChange={(e) => setF((x) => ({ ...x, is_active: e.target.checked }))} />} label="Active" />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={!f.name.trim() || !f.first_code.trim()}>
          Save Policy
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Setup: time-based charge policies (a first block of minutes, then extra blocks). */
export default function PoliciesAdmin() {
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(null);
  const load = useCallback(() => surgeryApi.policies().then(setRows).catch((e) => toast.error(errorText(e, "Could not load the policies."))), []);
  useEffect(() => {
    load();
  }, [load]);
  return (
    <Box>
      <Stack direction="row" sx={{ mb: 1 }}>
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1, alignSelf: "center" }}>
          Supplies with a charge code are billed by usage automatically; policies add the time-based charges.
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing({ policy: null })}>
          New Policy
        </Button>
      </Stack>
      <Table size="small" aria-label="Charge policies">
        <TableHead>
          <TableRow>
            {["Policy", "Type", "Basis", "First block", "Extra block", "Active"].map((h) => (
              <TableCell key={h}>{h}</TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((p) => (
            <TableRow key={p.id} hover sx={{ cursor: "pointer" }} onClick={() => setEditing({ policy: p })}>
              <TableCell>{p.name}</TableCell>
              <TableCell>{TYPES.find((t) => t.value === p.policy_type)?.label}</TableCell>
              <TableCell>{BASES.find((t) => t.value === p.time_basis)?.label}</TableCell>
              <TableCell>{`${p.first_code} · ${p.first_minutes} min`}</TableCell>
              <TableCell>{p.extra_code ? `${p.extra_code} · every ${p.extra_minutes} min` : "none"}</TableCell>
              <TableCell>{p.is_active ? "Yes" : "No"}</TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={6}>
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>
                  No charge policies yet.
                </Typography>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      <PolicyEditor open={!!editing} policy={editing?.policy} onClose={() => setEditing(null)} onSaved={load} />
    </Box>
  );
}
