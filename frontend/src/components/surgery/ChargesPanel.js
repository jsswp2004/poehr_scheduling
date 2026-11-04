import { useCallback, useEffect, useState } from "react";
import {
  Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Paper, Stack, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { toast } from "../SimpleToast";
import { errorText } from "../patientHeader/headerApi";
import { surgeryApi } from "./surgeryApi";
import { usDate } from "./surgeryUtils";

const money = (v) => (v === null || v === undefined ? "" : Number(v).toFixed(2));

function AddChargeDialog({ open, caseId, onClose, onAdded }) {
  const [f, setF] = useState({ charge_code: "", description: "", quantity: 1, item_charge: "" });
  useEffect(() => {
    if (open) setF({ charge_code: "", description: "", quantity: 1, item_charge: "" });
  }, [open]);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const add = async () => {
    try {
      const body = { charge_code: f.charge_code.trim(), description: f.description, quantity: Math.max(parseInt(f.quantity, 10) || 1, 1) };
      if (f.item_charge !== "") body.item_charge = f.item_charge;
      onAdded(await surgeryApi.addCharge(caseId, body));
      onClose();
    } catch (err) {
      toast.error(errorText(err, "The charge was not added."));
    }
  };
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Add Charge</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField size="small" label="Charge code" value={f.charge_code} onChange={set("charge_code")} />
          <TextField size="small" label="Description" value={f.description} onChange={set("description")} />
          <TextField size="small" type="number" label="Quantity" value={f.quantity} onChange={set("quantity")} inputProps={{ min: 1 }} />
          <TextField size="small" type="number" label="Item charge ($)" value={f.item_charge} onChange={set("item_charge")} inputProps={{ min: 0, step: "0.01" }} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={add} disabled={!f.charge_code.trim()}>
          Add
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** The Charges tab: generate the case's charges from its supplies and times, review them, then post them. */
export default function ChargesPanel({ caseId, canEdit, started }) {
  const [data, setData] = useState({ charge_status: "", charges: [], warnings: [] });
  const [picked, setPicked] = useState([]);
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () => surgeryApi.charges(caseId).then((d) => setData(d)).catch((e) => toast.error(errorText(e, "Could not load the charges."))),
    [caseId]
  );
  useEffect(() => {
    load();
  }, [load]);

  const pending = data.charges.filter((c) => c.status === "pending");
  useEffect(() => setPicked(pending.map((c) => c.id)), [data.charges]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (fn, okText, failText) => {
    setBusy(true);
    try {
      const d = await fn();
      if (d && d.charges) setData(d);
      if (okText) toast.success(okText);
    } catch (err) {
      toast.error(errorText(err, failText));
    } finally {
      setBusy(false);
    }
  };
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const editQty = async (c, value) => {
    const qty = Math.max(parseInt(value, 10) || 0, 0);
    if (!qty || qty === c.quantity) return load();
    try {
      const saved = await surgeryApi.updateCharge(caseId, c.id, { quantity: qty });
      setData((d) => ({ ...d, charges: d.charges.map((x) => (x.id === saved.id ? saved : x)) }));
    } catch (err) {
      toast.error(errorText(err, "That change was not saved."));
      load();
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
        <Typography variant="subtitle2" sx={{ flex: 1 }}>
          Charges · Charge Status: <strong>{data.charge_status}</strong>
        </Typography>
        {canEdit && (
          <>
            <Button size="small" variant="outlined" disabled={busy || !started} onClick={() => run(() => surgeryApi.generateCharges(caseId), "Charges generated", "Charges were not generated.")}>
              Generate Charges
            </Button>
            <Button size="small" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}>
              Add Charge
            </Button>
            <Button size="small" variant="contained" disabled={busy || picked.length === 0} onClick={() => run(() => surgeryApi.postCharges(caseId, picked), "Charges posted", "Charges were not posted.")}>
              Post Selected
            </Button>
          </>
        )}
      </Stack>
      {data.warnings.map((w) => (
        <Alert key={w} severity="warning" sx={{ mb: 1 }}>
          {w}
        </Alert>
      ))}
      <TableContainer>
        <Table size="small" aria-label="Case charges">
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox" />
              {["Charge Code", "Item Charge ($)", "Qty", "Total Charge ($)", "Status", "Date", "Policy", "Policy Type", "Description"].map((h) => (
                <TableCell key={h}>{h}</TableCell>
              ))}
              <TableCell padding="checkbox" />
            </TableRow>
          </TableHead>
          <TableBody>
            {data.charges.map((c) => (
              <TableRow key={c.id}>
                <TableCell padding="checkbox">
                  {c.status === "pending" && canEdit && <Checkbox size="small" checked={picked.includes(c.id)} onChange={() => toggle(c.id)} inputProps={{ "aria-label": `Select ${c.charge_code}` }} />}
                </TableCell>
                <TableCell>{c.charge_code}</TableCell>
                <TableCell>{money(c.item_charge)}</TableCell>
                <TableCell sx={{ width: 90 }}>
                  <TextField
                    size="small"
                    type="number"
                    defaultValue={c.quantity}
                    key={`${c.id}-${c.quantity}`}
                    disabled={!canEdit || c.status === "posted"}
                    onBlur={(e) => editQty(c, e.target.value)}
                    inputProps={{ min: 1, "aria-label": `${c.charge_code} quantity` }}
                  />
                </TableCell>
                <TableCell>{money(c.total_charge)}</TableCell>
                <TableCell>{c.status_label}</TableCell>
                <TableCell>{usDate(c.date)}</TableCell>
                <TableCell>{c.policy}</TableCell>
                <TableCell>{c.policy_type_label}</TableCell>
                <TableCell>{c.description}</TableCell>
                <TableCell padding="checkbox">
                  {canEdit && c.status === "pending" && (
                    <IconButton
                      size="small"
                      aria-label={`Remove ${c.charge_code}`}
                      onClick={() => run(async () => { await surgeryApi.removeCharge(caseId, c.id); return surgeryApi.charges(caseId); }, null, "The charge was not removed.")}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {data.charges.length === 0 && (
              <TableRow>
                <TableCell colSpan={11}>
                  <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>
                    {started ? "No charges yet. Use Generate Charges." : "Charges can be generated once the case has started."}
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <AddChargeDialog open={addOpen} caseId={caseId} onClose={() => setAddOpen(false)} onAdded={() => load()} />
    </Paper>
  );
}
