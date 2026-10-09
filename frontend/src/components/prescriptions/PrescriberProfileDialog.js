import { useEffect, useState } from "react";
import { Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from "@mui/material";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { toast } from "../SimpleToast";
import { authHeader, errorText } from "./rxShared";

const KEYS = ["npi", "license_number", "license_state", "dea_number", "practice_name", "address", "phone", "fax"];

/**
 * What a prescription must show about the prescriber. A doctor fills in their own; an administrator can
 * fill in a doctor's (pass `userId`). The server checks the NPI and DEA numbers' check digits.
 */
export default function PrescriberProfileDialog({ open, onClose, onSaved, userId = null }) {
  const [form, setForm] = useState(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setForm(null);
    setError("");
    (async () => {
      try {
        const res = await api.get(apiEndpoints.prescriberProfile, { headers: await authHeader(), params: userId ? { user: userId } : {} });
        if (cancelled) return;
        setName(res.data.name || "");
        setForm(Object.fromEntries(KEYS.map((k) => [k, res.data[k] || ""])));
      } catch (err) {
        if (!cancelled) setError(errorText(err, "Could not load the prescriber details."));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, userId]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const field = (key, label, extra = {}) => (
    <TextField size="small" fullWidth label={label} value={form[key]} onChange={set(key)} inputProps={{ "data-testid": `profile-${key}` }} {...extra} />
  );

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await api.put(apiEndpoints.prescriberProfile, form, { headers: await authHeader(), params: userId ? { user: userId } : {} });
      toast.success("Prescriber details saved.");
      onSaved && onSaved(res.data);
      onClose();
    } catch (err) {
      setError(errorText(err, "Could not save the prescriber details."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm" data-testid="profile-dialog">
      <DialogTitle>Prescriber details{name ? ` — ${name}` : ""}</DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }} data-testid="profile-error">{error}</Alert>}
        {!form && !error && <CircularProgress size={24} />}
        {form && (
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              These print on every prescription. A prescription can't be signed without a valid NPI and a license number.
            </Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              {field("npi", "NPI (10 digits)", { inputProps: { maxLength: 10, "data-testid": "profile-npi" } })}
              {field("license_number", "License number")}
              {field("license_state", "License state", { inputProps: { maxLength: 2, "data-testid": "profile-license_state" } })}
            </Stack>
            {field("dea_number", "DEA number (optional)", { helperText: "Kept for later electronic prescribing; not printed." })}
            {field("practice_name", "Practice name (blank = clinic name)")}
            {field("address", "Practice address")}
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              {field("phone", "Phone")}
              {field("fax", "Fax")}
            </Stack>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={busy || !form} data-testid="profile-save">
          {busy ? <CircularProgress size={18} /> : "Save"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
