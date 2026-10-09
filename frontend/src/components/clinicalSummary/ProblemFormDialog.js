import { useEffect, useState } from "react";
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography,
} from "@mui/material";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import IcdCodePicker from "../IcdCodePicker";
import { authHeader, errorText } from "../prescriptions/rxShared";

const STATUSES = [
  { value: "active", label: "Active" },
  { value: "chronic", label: "Chronic" },
  { value: "resolved", label: "Resolved" },
];

const blank = (defaults) => ({
  description: defaults?.description || "",
  code: defaults?.code || "",
  status: "active",
  onset_date: "",
  note: "",
});

const fromProblem = (p) => ({
  description: p.description || "",
  code: p.code || "",
  status: p.status === "entered_in_error" ? "active" : p.status,
  onset_date: p.onset_date || "",
  note: p.note || "",
});

/**
 * Add a problem to the patient's list, or change one: its wording or code, its status (active, chronic,
 * resolved), when it began, a note. A wrong entry is marked "entered in error" -- it is kept, never deleted.
 */
export default function ProblemFormDialog({ open, patient, problem, defaults, onClose, onSaved }) {
  const editing = !!problem;
  const [form, setForm] = useState(blank());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmError, setConfirmError] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(problem ? fromProblem(problem) : blank(defaults));
      setError("");
      setConfirmError(false);
    }
  }, [open, problem, defaults]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  // the picker holds a list; a problem has one code, so the newest pick replaces the old one
  const pickCode = (list) => {
    const pick = list[list.length - 1];
    setForm((f) => ({
      ...f,
      code: pick ? pick.code : "",
      description: f.description || (pick && pick.description) || "",
    }));
  };

  const send = async (body) => {
    setBusy(true);
    setError("");
    try {
      const headers = await authHeader();
      const res = editing
        ? await api.patch(apiEndpoints.problemEntry(problem.id), body, { headers })
        : await api.post(apiEndpoints.problemList, { patient: patient.id, ...body }, { headers });
      onSaved(res.data);
    } catch (err) {
      setError(errorText(err, "Could not save the problem."));
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    const body = {
      description: form.description.trim(),
      code: form.code,
      status: form.status,
      onset_date: form.onset_date || null,
      note: form.note.trim(),
    };
    send(body);
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm" data-testid="problem-dialog">
      <DialogTitle>{editing ? "Edit problem" : "Add a problem"}</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 1 }} data-testid="problem-error">{error}</Alert>}
        <Stack spacing={1.5} sx={{ mt: 1 }}>
          <Box>
            <IcdCodePicker
              label="Find a diagnosis code (optional)"
              value={form.code ? [{ code: form.code, description: "" }] : []}
              onChange={pickCode}
            />
          </Box>
          <TextField
            size="small" fullWidth required label="Problem" value={form.description} onChange={set("description")}
            inputProps={{ "data-testid": "problem-description", maxLength: 255 }}
          />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <TextField select size="small" fullWidth label="Status" value={form.status} onChange={set("status")} inputProps={{ "data-testid": "problem-status" }}>
              {STATUSES.map((s) => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
            </TextField>
            <TextField
              size="small" fullWidth type="date" label="Began" value={form.onset_date} onChange={set("onset_date")}
              InputLabelProps={{ shrink: true }} inputProps={{ "data-testid": "problem-onset", max: new Date().toISOString().slice(0, 10) }}
            />
          </Stack>
          <TextField
            size="small" fullWidth multiline minRows={2} label="Note" value={form.note} onChange={set("note")}
            inputProps={{ "data-testid": "problem-note", maxLength: 300 }}
          />
          {editing && (
            <Box>
              {confirmError ? (
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="body2">This keeps the entry but removes it from the list.</Typography>
                  <Button size="small" color="error" variant="contained" disabled={busy} onClick={() => send({ status: "entered_in_error" })} data-testid="problem-error-confirm">
                    Mark entered in error
                  </Button>
                  <Button size="small" onClick={() => setConfirmError(false)}>Keep it</Button>
                </Stack>
              ) : (
                <Button size="small" color="error" onClick={() => setConfirmError(true)} data-testid="problem-error-start">
                  Entered in error…
                </Button>
              )}
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={busy || !form.description.trim()} data-testid="problem-save">
          {busy ? <CircularProgress size={18} /> : editing ? "Save" : "Add"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
