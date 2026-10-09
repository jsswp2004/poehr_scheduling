import { useEffect, useRef, useState } from "react";
import {
  Alert, Autocomplete, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Stack, TextField,
} from "@mui/material";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { toast } from "../SimpleToast";
import { authHeader, errorText } from "./rxShared";

const BLANK = {
  drug_name: "", code_system: "", code: "", strength: "", form: "", dose: "", route: "PO", frequency: "", prn: false,
  prn_reason: "", sig_extra: "", indication_text: "", source: "patient", outside_prescriber: "", last_taken: "",
};

/** Add or correct a medicine the patient takes at home. Controlled drugs can be recorded here (only prescribing them is blocked). */
export default function HomeMedFormDialog({ open, onClose, onSaved, patient, med = null, options = {} }) {
  const [form, setForm] = useState(BLANK);
  const [drugOptions, setDrugOptions] = useState([]);
  const [drugText, setDrugText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const seq = useRef(0);
  const editing = !!med;

  useEffect(() => {
    if (!open) return;
    setError("");
    setDrugOptions([]);
    setForm(med ? { ...BLANK, ...Object.fromEntries(Object.keys(BLANK).map((k) => [k, med[k] ?? BLANK[k]])) } : BLANK);
    setDrugText(med ? med.drug_name : "");
  }, [open, med]);

  useEffect(() => {
    const term = drugText.trim();
    if (!open || term.length < 2 || term === form.drug_name) return undefined;
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      try {
        const res = await api.get(apiEndpoints.prescriptionDrugs, { headers: await authHeader(), params: { q: term } });
        if (mine === seq.current) setDrugOptions(res.data?.results || []);
      } catch (err) {
        if (mine === seq.current) setDrugOptions([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [drugText, open, form.drug_name]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const pickDrug = (_, value) =>
    value && typeof value === "object"
      ? setForm((f) => ({ ...f, drug_name: value.display, code_system: value.system || "", code: value.code || "" }))
      : setForm((f) => ({ ...f, drug_name: value || "", code_system: "", code: "" }));

  const save = async () => {
    setError("");
    const drug = (form.drug_name || drugText).trim();
    if (!drug) return setError("Choose the medicine.");
    const body = { ...form, drug_name: drug, last_taken: form.last_taken || null };
    setBusy(true);
    try {
      const headers = await authHeader();
      const res = editing
        ? await api.patch(apiEndpoints.homeMedication(med.id), body, { headers })
        : await api.post(apiEndpoints.homeMedications, { ...body, patient: patient.id }, { headers });
      toast.success(editing ? "Home medication saved." : "Added to the home medication list.");
      onSaved(res.data);
    } catch (err) {
      setError(errorText(err, "Could not save the medication."));
    } finally {
      setBusy(false);
    }
  };

  const outside = ["outside", "pharmacy"].includes(form.source);
  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="md" data-testid="home-med-form">
      <DialogTitle>
        {editing ? "Edit home medication" : "Add home medication"}
        {patient?.name ? ` — ${patient.name}` : ""}
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          {error && <Alert severity="error" data-testid="home-med-error">{error}</Alert>}
          <Autocomplete
            freeSolo
            options={drugOptions}
            value={form.drug_name || null}
            inputValue={drugText}
            onInputChange={(_, v) => setDrugText(v)}
            onChange={pickDrug}
            filterOptions={(o) => o}
            getOptionLabel={(o) => (typeof o === "string" ? o : o.display)}
            renderOption={(props, o) => {
              const { key, ...rest } = props;
              return (
                <li key={key} {...rest}>
                  {o.display}
                  {o.controlled && <Chip size="small" color="warning" label="Controlled" sx={{ ml: 1 }} />}
                </li>
              );
            }}
            renderInput={(params) => (
              <TextField {...params} size="small" label="Medicine" inputProps={{ ...params.inputProps, "data-testid": "home-med-drug" }} helperText="Type at least two letters to search, or type the name." />
            )}
          />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField size="small" fullWidth label="Strength" placeholder="10 mg" value={form.strength} onChange={set("strength")} inputProps={{ "data-testid": "home-med-strength" }} />
            <TextField select size="small" fullWidth label="Form" value={form.form} onChange={set("form")} inputProps={{ "data-testid": "home-med-form-type" }}>
              <MenuItem value="">&nbsp;</MenuItem>
              {(options.forms || []).map((f) => <MenuItem key={f} value={f}>{f}</MenuItem>)}
            </TextField>
          </Stack>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField size="small" fullWidth label="Dose" placeholder="1 tablet" value={form.dose} onChange={set("dose")} inputProps={{ "data-testid": "home-med-dose" }} />
            <TextField select size="small" fullWidth label="Route" value={form.route} onChange={set("route")} inputProps={{ "data-testid": "home-med-route" }}>
              <MenuItem value="">&nbsp;</MenuItem>
              {(options.routes || []).map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)}
            </TextField>
            <TextField select size="small" fullWidth label="How often" value={form.frequency} onChange={set("frequency")} inputProps={{ "data-testid": "home-med-frequency" }}>
              <MenuItem value="">&nbsp;</MenuItem>
              {(options.frequencies || []).map((f) => <MenuItem key={f.value} value={f.value}>{f.label}</MenuItem>)}
            </TextField>
          </Stack>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
            <FormControlLabel
              control={<Checkbox size="small" checked={form.prn} onChange={(e) => setForm((f) => ({ ...f, prn: e.target.checked }))} inputProps={{ "data-testid": "home-med-prn" }} />}
              label="As needed"
            />
            {(form.prn || form.frequency === "prn") && (
              <TextField size="small" fullWidth label="As needed for" value={form.prn_reason} onChange={set("prn_reason")} inputProps={{ "data-testid": "home-med-prn-reason" }} />
            )}
            <TextField size="small" fullWidth label="Other directions (optional)" placeholder="with food" value={form.sig_extra} onChange={set("sig_extra")} inputProps={{ "data-testid": "home-med-extra" }} />
          </Stack>
          <TextField size="small" label="Taken for (optional)" value={form.indication_text} onChange={set("indication_text")} inputProps={{ "data-testid": "home-med-indication" }} />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField select size="small" fullWidth label="Reported by" value={form.source} onChange={set("source")} inputProps={{ "data-testid": "home-med-source" }}>
              {(options.sources || []).map((s) => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
            </TextField>
            {outside && (
              <TextField size="small" fullWidth label="Prescribed by (optional)" value={form.outside_prescriber} onChange={set("outside_prescriber")} inputProps={{ "data-testid": "home-med-outside" }} />
            )}
            <TextField
              size="small" fullWidth type="date" label="Last taken (optional)" value={form.last_taken} onChange={set("last_taken")}
              InputLabelProps={{ shrink: true }} inputProps={{ "data-testid": "home-med-last-taken" }}
            />
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={busy} data-testid="home-med-save">
          {busy ? <CircularProgress size={18} /> : editing ? "Save" : "Add"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
