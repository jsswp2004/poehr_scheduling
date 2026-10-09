import { useEffect, useState } from "react";
import { Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField } from "@mui/material";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { authHeader, errorText } from "./rxShared";

const BLANK = { name: "", address: "", city: "", state: "", zip_code: "", phone: "", fax: "", ncpdp_id: "" };

/** Add a pharmacy to the clinic's directory (the fax number is what the faxing step uses). */
export default function PharmacyDialog({ open, onClose, onSaved }) {
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setForm(BLANK);
      setError("");
    }
  }, [open]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const field = (key, label, extra = {}) => (
    <TextField size="small" fullWidth label={label} value={form[key]} onChange={set(key)} inputProps={{ "data-testid": `pharmacy-${key}` }} {...extra} />
  );

  const save = async () => {
    if (!form.name.trim()) return setError("The pharmacy needs a name.");
    setBusy(true);
    setError("");
    try {
      const res = await api.post(apiEndpoints.pharmacies, form, { headers: await authHeader() });
      onSaved(res.data);
    } catch (err) {
      setError(errorText(err, "Could not save the pharmacy."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm" data-testid="pharmacy-dialog">
      <DialogTitle>Add a pharmacy</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          {error && <Alert severity="error" data-testid="pharmacy-error">{error}</Alert>}
          {field("name", "Pharmacy name")}
          {field("address", "Street address")}
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            {field("city", "City")}
            {field("state", "State", { inputProps: { maxLength: 2, "data-testid": "pharmacy-state" } })}
            {field("zip_code", "ZIP")}
          </Stack>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            {field("phone", "Phone")}
            {field("fax", "Fax")}
          </Stack>
          {field("ncpdp_id", "NCPDP ID (optional, 7 digits)", { helperText: "Needed later for electronic prescribing." })}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={busy} data-testid="pharmacy-save">
          {busy ? <CircularProgress size={18} /> : "Add pharmacy"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
