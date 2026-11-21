import { useCallback, useEffect, useState } from "react";
import {
  Alert, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Paper, Stack, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
} from "@mui/material";
import { toast } from "react-toastify";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { authHeader, errorText, peso } from "./pharmacyShared";

const BLANK = { drug_name: "", unit: "", unit_price: "", vat_exempt: false };

/**
 * The clinic's price table: PHP per unit, VAT included unless the drug is VAT-exempt. The fill picks the
 * longest drug name the prescription contains. Pharmacists and administrators edit it; everyone else reads it.
 */
export default function PriceTableDialog({ open, onClose }) {
  const [rows, setRows] = useState([]);
  const [canEdit, setCanEdit] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await api.get(apiEndpoints.pharmacyPrices, { headers: await authHeader() });
      setRows(res.data.results || []);
      setCanEdit(!!res.data.can_edit);
    } catch (err) {
      setError(errorText(err, "Could not load the price table."));
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
      await api.post(apiEndpoints.pharmacyPrices, form, { headers: await authHeader() });
      toast.success("Price added.");
      setForm(BLANK);
      load();
    } catch (err) {
      setError(errorText(err, "Could not save the price."));
    }
  };

  const toggle = async (row) => {
    try {
      await api.patch(apiEndpoints.pharmacyPrice(row.id), { is_active: !row.is_active }, { headers: await authHeader() });
      load();
    } catch (err) {
      setError(errorText(err, "Could not change the price."));
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth data-testid="price-table-dialog">
      <DialogTitle>Price table (₱)</DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Prices include 12% VAT unless marked VAT-exempt. Senior citizens and PWDs with an ID on file get the VAT exemption, then 20% off.
        </Typography>
        <TableContainer component={Paper} variant="outlined">
          <Table size="small" aria-label="Price table">
            <TableHead>
              <TableRow>
                <TableCell>Drug</TableCell>
                <TableCell>Unit</TableCell>
                <TableCell align="right">Price per unit</TableCell>
                <TableCell>VAT-exempt</TableCell>
                {canEdit && <TableCell />}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={5}><Typography variant="body2" color="text.secondary">No prices yet.</Typography></TableCell></TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.id} data-testid={`price-row-${r.id}`} sx={{ opacity: r.is_active ? 1 : 0.5 }}>
                  <TableCell>{r.drug_name}</TableCell>
                  <TableCell>{r.unit}</TableCell>
                  <TableCell align="right">{peso(r.unit_price)}</TableCell>
                  <TableCell>{r.vat_exempt ? "Yes" : "No"}</TableCell>
                  {canEdit && (
                    <TableCell align="right">
                      <Button size="small" onClick={() => toggle(r)}>{r.is_active ? "Turn off" : "Turn on"}</Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        {canEdit && (
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mt: 1.5 }} alignItems={{ sm: "center" }} data-testid="price-add">
            <TextField size="small" label="Generic name (and strength)" value={form.drug_name} onChange={(e) => setForm({ ...form, drug_name: e.target.value })} inputProps={{ "data-testid": "price-drug" }} />
            <TextField size="small" label="Unit" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} sx={{ maxWidth: 120 }} />
            <TextField size="small" label="₱ per unit" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: e.target.value })} sx={{ maxWidth: 120 }} inputProps={{ "data-testid": "price-amount" }} />
            <FormControlLabel control={<Checkbox size="small" checked={form.vat_exempt} onChange={(e) => setForm({ ...form, vat_exempt: e.target.checked })} />} label="VAT-exempt" />
            <Button variant="contained" size="small" disabled={!form.drug_name.trim() || !form.unit_price} onClick={add} data-testid="price-save">Add</Button>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
