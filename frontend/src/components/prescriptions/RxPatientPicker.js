import { useEffect, useRef, useState } from "react";
import { Autocomplete, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from "@mui/material";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { authHeader } from "./rxShared";

/** Pick the patient a new prescription is for (used on the worklist page, where no chart is open). */
export default function RxPatientPicker({ open, onClose, onPick }) {
  const [text, setText] = useState("");
  const [options, setOptions] = useState([]);
  const [value, setValue] = useState(null);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    if (!open) return;
    setText("");
    setValue(null);
    setOptions([]);
  }, [open]);

  useEffect(() => {
    const term = text.trim();
    if (!open || term.length < 2) return undefined;
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.get(apiEndpoints.patients, { headers: await authHeader(), params: { search: term } });
        if (mine !== seq.current) return;
        const rows = Array.isArray(res.data) ? res.data : res.data?.results || [];
        setOptions(rows.map((p) => ({ id: p.user_id, name: `${p.first_name} ${p.last_name}`.trim(), dob: p.date_of_birth || "" })));
      } catch (err) {
        if (mine === seq.current) setOptions([]);
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [text, open]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" data-testid="rx-patient-picker">
      <DialogTitle>Who is the prescription for?</DialogTitle>
      <DialogContent>
        <Autocomplete
          sx={{ mt: 1 }}
          options={options}
          loading={loading}
          value={value}
          filterOptions={(o) => o}
          getOptionLabel={(o) => (o.dob ? `${o.name} (${o.dob})` : o.name)}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          onInputChange={(_, v) => setText(v)}
          onChange={(_, v) => setValue(v)}
          noOptionsText={text.trim().length < 2 ? "Type at least two letters" : "No patient found"}
          renderInput={(params) => <TextField {...params} size="small" label="Patient name" autoFocus inputProps={{ ...params.inputProps, "data-testid": "rx-patient-search" }} />}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!value} onClick={() => onPick(value)} data-testid="rx-patient-continue">
          Continue
        </Button>
      </DialogActions>
    </Dialog>
  );
}
