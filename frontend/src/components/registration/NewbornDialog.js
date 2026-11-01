import React, { useEffect, useState } from "react";
import axios from "axios";
import { Alert, Autocomplete, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { getValidToken } from "../../utils/auth";
import { apiEndpoints } from "../../config/api";

const EMPTY = { first_name: "", last_name: "", date_of_birth: "", legal_sex: "", gestational_age_weeks: "", birth_weight_g: "", create_visit: true };

/** Why the newborn form cannot be sent yet, or "". Mirrors the server's rules. */
export const newbornProblem = (mother, f, today = new Date().toISOString().slice(0, 10)) => {
  if (!mother) return "Find the mother first.";
  if (!f.first_name.trim()) return "Enter the baby's first name.";
  if (!f.date_of_birth) return "Enter the date of birth.";
  if (f.date_of_birth > today) return "The date of birth cannot be in the future.";
  const weeks = f.gestational_age_weeks === "" ? null : Number(f.gestational_age_weeks);
  if (weeks !== null && !(Number.isInteger(weeks) && weeks >= 20 && weeks <= 45)) return "Gestational age must be between 20 and 45 weeks.";
  const grams = f.birth_weight_g === "" ? null : Number(f.birth_weight_g);
  if (grams !== null && !(Number.isInteger(grams) && grams >= 200 && grams <= 7000)) return "Birth weight must be between 200 and 7000 grams.";
  return "";
};

/**
 * Registers a baby under the mother's chart: her address and phone carry over and she becomes the guarantor.
 * onCreated receives { patient, visit, mother } from the server.
 */
export default function NewbornDialog({ open, onClose, onCreated }) {
  const [mother, setMother] = useState(null);
  const [options, setOptions] = useState([]);
  const [query, setQuery] = useState("");
  const [f, setF] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setMother(null);
      setOptions([]);
      setQuery("");
      setF(EMPTY);
      setError("");
    }
  }, [open]);

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setOptions([]);
      return undefined;
    }
    let live = true;
    const timer = setTimeout(async () => {
      try {
        const token = await getValidToken();
        const res = await axios.get(apiEndpoints.patients, { headers: { Authorization: `Bearer ${token}` }, params: { search: query.trim(), page_size: 10 } });
        const rows = res.data.results || res.data || [];
        if (live) setOptions(rows.filter((p) => !p.mother).map((p) => ({ id: p.id, last_name: p.last_name, label: `${p.first_name} ${p.last_name}${p.mrn ? ` (${p.mrn})` : ""}${p.date_of_birth ? ` · DOB ${p.date_of_birth}` : ""}` })));
      } catch (err) {
        if (live) setOptions([]);
      }
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query, open]);

  const set = (key, value) => {
    setF((prev) => ({ ...prev, [key]: value }));
    setError("");
  };
  const problem = newbornProblem(mother, f);

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const token = await getValidToken();
      const body = {
        mother: mother.id,
        first_name: f.first_name.trim(),
        last_name: f.last_name.trim(),
        date_of_birth: f.date_of_birth,
        legal_sex: f.legal_sex,
        gestational_age_weeks: f.gestational_age_weeks === "" ? null : Number(f.gestational_age_weeks),
        birth_weight_g: f.birth_weight_g === "" ? null : Number(f.birth_weight_g),
        create_visit: f.create_visit,
      };
      const res = await axios.post(apiEndpoints.newbornRegistration, body, { headers: { Authorization: `Bearer ${token}` } });
      onCreated(res.data);
    } catch (err) {
      setError((err && err.response && err.response.data && err.response.data.detail) || "Could not register the baby.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm" data-testid="newborn-dialog">
      <DialogTitle>Newborn registration</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            The baby is registered under the mother&apos;s chart. Her address and phone carry over, and she is set as the guarantor.
          </Typography>
          <Autocomplete
            options={options}
            value={mother}
            onChange={(e, v) => {
              setMother(v);
              if (v && !f.last_name) set("last_name", v.last_name || "");
            }}
            onInputChange={(e, v, reason) => reason === "input" && setQuery(v)}
            filterOptions={(o) => o}
            getOptionLabel={(o) => o.label}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            noOptionsText={query.trim().length < 2 ? "Type at least 2 letters" : "No matching patients"}
            renderInput={(params) => <TextField {...params} size="small" label="Mother" inputProps={{ ...params.inputProps, "data-testid": "newborn-mother" }} />}
          />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField size="small" fullWidth label="Baby's first name" value={f.first_name} onChange={(e) => set("first_name", e.target.value)} inputProps={{ "data-testid": "newborn-first", maxLength: 150 }} />
            <TextField size="small" fullWidth label="Last name" value={f.last_name} onChange={(e) => set("last_name", e.target.value)} helperText="Blank uses the mother's" inputProps={{ maxLength: 150 }} />
          </Stack>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField size="small" fullWidth type="date" label="Date of birth" InputLabelProps={{ shrink: true }} value={f.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} inputProps={{ "data-testid": "newborn-dob" }} />
            <TextField size="small" fullWidth select label="Sex" value={f.legal_sex} onChange={(e) => set("legal_sex", e.target.value)}>
              <MenuItem value="">
                <em>Not stated</em>
              </MenuItem>
              <MenuItem value="F">Female</MenuItem>
              <MenuItem value="M">Male</MenuItem>
              <MenuItem value="X">Unspecified / Other</MenuItem>
            </TextField>
          </Stack>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField size="small" fullWidth type="number" label="Gestational age (weeks)" value={f.gestational_age_weeks} onChange={(e) => set("gestational_age_weeks", e.target.value)} inputProps={{ min: 20, max: 45 }} />
            <TextField size="small" fullWidth type="number" label="Birth weight (g)" value={f.birth_weight_g} onChange={(e) => set("birth_weight_g", e.target.value)} inputProps={{ min: 200, max: 7000 }} />
          </Stack>
          <FormControlLabel control={<Checkbox checked={f.create_visit} onChange={(e) => set("create_visit", e.target.checked)} />} label="Also start the baby's first visit" />
          {(error || (problem && (f.first_name || f.date_of_birth || mother))) && <Alert severity={error ? "error" : "info"}>{error || problem}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant="contained" onClick={submit} disabled={busy || !!problem} data-testid="newborn-save">
          Register newborn
        </Button>
      </DialogActions>
    </Dialog>
  );
}
