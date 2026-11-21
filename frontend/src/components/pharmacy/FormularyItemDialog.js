import { useEffect, useState } from "react";
import {
  Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Grid, MenuItem,
  Stack, Tab, Tabs, TextField, Typography,
} from "@mui/material";
import { toast } from "react-toastify";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { authHeader, errorText, fmtDateTime } from "./pharmacyShared";

const BLANK = {
  code: "", generic_name: "", brand_name: "", strength: "", form: "", route: "", rxnorm_code: "", dangerous_drug: false,
  renal_threshold_crcl: "", vat_exempt: false, unit: "", unit_price_php: "", is_active: true,
};
const DEFINITION = ["generic_name", "brand_name", "strength", "form", "route", "rxnorm_code"];
const LABELS = {
  generic_name: "Generic name", brand_name: "Brand", strength: "Strength", form: "Form", route: "Default route", rxnorm_code: "RxNorm code",
  dangerous_drug: "Dangerous drug (RA 9165)", renal_threshold_crcl: "Renal: review below CrCl (mL/min)", vat_exempt: "VAT-exempt",
  unit: "Unit", unit_price_php: "Price per unit (₱)", is_active: "Active",
};
const show = (v) => (v === true ? "Yes" : v === false ? "No" : v === null || v === undefined || v === "" ? "—" : String(v));

/**
 * One formulary item. A clinic sees a shared item's definition (names, strength, form, route, RxNorm) read-only and
 * can override its local values (active, dangerous drug, renal threshold, price); each overridden value shows the
 * shared one and can be reverted. A system administrator edits the shared item itself.
 */
export default function FormularyItemDialog({ open, item, meta, onClose, onSaved }) {
  const creating = !item;
  const [form, setForm] = useState(BLANK);
  const [tab, setTab] = useState("details");
  const [history, setHistory] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const clinicOnShared = !!item && item.scope === "shared" && !meta?.edits_shared;
  const canEdit = !!meta?.can_edit;

  useEffect(() => {
    if (!open) return;
    setError("");
    setTab("details");
    setHistory([]);
    setForm(item ? { ...BLANK, ...item, renal_threshold_crcl: item.renal_threshold_crcl ?? "", unit_price_php: item.unit_price_php ?? "" } : BLANK);
  }, [open, item]);

  useEffect(() => {
    if (!open || !item || tab !== "history") return;
    (async () => {
      try {
        const res = await api.get(apiEndpoints.formularyHistory(item.id), { headers: await authHeader() });
        setHistory(res.data.results || []);
      } catch (err) {
        setError(errorText(err, "Could not load the history."));
      }
    })();
  }, [open, item, tab]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const locked = (key) => !canEdit || (clinicOnShared && DEFINITION.includes(key));

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const headers = await authHeader();
      if (creating) {
        await api.post(apiEndpoints.formulary, form, { headers });
        toast.success("Item added.");
      } else {
        const fields = (clinicOnShared ? meta.overridable : Object.keys(BLANK).filter((k) => k !== "code"))
          .filter((k) => String(form[k] ?? "") !== String(item[k] ?? ""));
        if (fields.length === 0) {
          onClose();
          return;
        }
        await api.patch(apiEndpoints.formularyItem(item.id), Object.fromEntries(fields.map((k) => [k, form[k]])), { headers });
        toast.success(clinicOnShared ? "Saved as your clinic's values." : "Saved.");
      }
      onSaved();
    } catch (err) {
      const detail = err?.response?.data?.errors;
      setError(detail ? Object.entries(detail).map(([k, v]) => `${LABELS[k] || k}: ${v}`).join(" ") : errorText(err, "Could not save the item."));
    } finally {
      setBusy(false);
    }
  };

  const revert = async (field) => {
    setBusy(true);
    try {
      const res = await api.post(apiEndpoints.formularyRevert(item.id), { field }, { headers: await authHeader() });
      toast.success("Back to the shared value.");
      setForm({ ...BLANK, ...res.data, renal_threshold_crcl: res.data.renal_threshold_crcl ?? "", unit_price_php: res.data.unit_price_php ?? "" });
      onSaved(res.data, true);
    } catch (err) {
      setError(errorText(err, "Could not revert."));
    } finally {
      setBusy(false);
    }
  };

  const note = (key) => {
    if (!item) return null;
    const source = item.sources?.[key];
    if (source === "overridden") {
      return (
        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.25 }} data-testid={`fi-overridden-${key}`}>
          <Chip size="small" color="warning" label="Your clinic's value" />
          <Typography variant="caption" color="text.secondary">Shared: {show(item.shared_values?.[key])}</Typography>
          {canEdit && <Button size="small" onClick={() => revert(key)} disabled={busy} data-testid={`fi-revert-${key}`}>Revert</Button>}
        </Stack>
      );
    }
    if (clinicOnShared) return <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>Shared (POWER)</Typography>;
    return null;
  };

  const text = (key, extra = {}) => (
    <Box>
      <TextField size="small" fullWidth label={LABELS[key] || key} value={form[key] ?? ""} onChange={set(key)} disabled={locked(key)} inputProps={{ "data-testid": `fi-${key}` }} {...extra} />
      {note(key)}
    </Box>
  );
  const check = (key) => (
    <Box>
      <FormControlLabel control={<Checkbox checked={!!form[key]} onChange={set(key)} disabled={locked(key)} inputProps={{ "data-testid": `fi-${key}` }} />} label={LABELS[key]} />
      {note(key)}
    </Box>
  );

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="md" fullWidth data-testid="formulary-item-dialog">
      <DialogTitle sx={{ pb: 0 }}>
        {creating ? (meta?.edits_shared ? "New shared formulary item" : "New clinic item") : item.display}
        {item && <Chip size="small" sx={{ ml: 1 }} label={item.scope === "shared" ? "Shared POWER item" : "Your clinic's item"} />}
      </DialogTitle>
      {!creating && (
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ px: 3, minHeight: 36, "& .MuiTab-root": { minHeight: 36, textTransform: "none" } }}>
          <Tab value="details" label="Details" />
          <Tab value="history" label="History" data-testid="fi-history-tab" />
        </Tabs>
      )}
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 1.5 }} data-testid="fi-error">{error}</Alert>}
        {tab === "details" ? (
          <Grid container spacing={1.5}>
            {creating && <Grid size={{ xs: 12, sm: 4 }}>{text("code", { label: "Code (optional, made from the name)" })}</Grid>}
            <Grid size={{ xs: 12, sm: creating ? 4 : 6 }}>{text("generic_name")}</Grid>
            <Grid size={{ xs: 12, sm: creating ? 4 : 6 }}>{text("brand_name")}</Grid>
            <Grid size={{ xs: 12, sm: 3 }}>{text("strength")}</Grid>
            <Grid size={{ xs: 12, sm: 3 }}>
              {text("form", { select: true, children: [<MenuItem key="" value="">—</MenuItem>, ...(meta?.forms || []).map((f) => <MenuItem key={f} value={f}>{f}</MenuItem>)] })}
            </Grid>
            <Grid size={{ xs: 12, sm: 3 }}>
              {text("route", { select: true, children: [<MenuItem key="" value="">—</MenuItem>, ...(meta?.routes || []).map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)] })}
            </Grid>
            <Grid size={{ xs: 12, sm: 3 }}>{text("rxnorm_code")}</Grid>
            <Grid size={{ xs: 12, sm: 4 }}>{check("dangerous_drug")}</Grid>
            <Grid size={{ xs: 12, sm: 4 }}>{text("renal_threshold_crcl", { helperText: "Blank = no renal flag" })}</Grid>
            <Grid size={{ xs: 12, sm: 4 }}>{check("is_active")}</Grid>
            <Grid size={{ xs: 12, sm: 4 }}>{text("unit_price_php")}</Grid>
            <Grid size={{ xs: 12, sm: 4 }}>{text("unit")}</Grid>
            <Grid size={{ xs: 12, sm: 4 }}>{check("vat_exempt")}</Grid>
            {clinicOnShared && (
              <Grid size={12}>
                <Typography variant="caption" color="text.secondary">
                  The names, strength, form, route and RxNorm code belong to the shared POWER formulary. Price, unit and VAT-exempt are overridden and reverted together.
                </Typography>
              </Grid>
            )}
          </Grid>
        ) : (
          <Box data-testid="fi-history">
            {history.length === 0 && <Typography variant="body2" color="text.secondary">No changes yet.</Typography>}
            {history.map((h) => (
              <Box key={h.id} sx={{ mb: 1 }}>
                <Typography variant="body2">
                  <b>{fmtDateTime(h.at)}</b> · {h.user} · {h.source}{h.import ? ` (${h.import.filename})` : ""} · {h.scope === "shared" ? "shared item" : "your clinic"}
                </Typography>
                {Object.entries(h.changes || {}).map(([field, [from, to]]) => (
                  <Typography key={field} variant="body2" color="text.secondary">
                    {LABELS[field] || field}: {show(from)} → {show(to)}
                  </Typography>
                ))}
              </Box>
            ))}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Close</Button>
        {canEdit && tab === "details" && <Button variant="contained" onClick={save} disabled={busy || !form.generic_name} data-testid="fi-save">{creating ? "Add item" : "Save"}</Button>}
      </DialogActions>
    </Dialog>
  );
}
