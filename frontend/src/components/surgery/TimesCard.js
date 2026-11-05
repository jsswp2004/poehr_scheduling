import { useEffect, useState } from "react";
import { Button, MenuItem, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from "@mui/material";
import { toast } from "../SimpleToast";
import { errorText } from "../patientHeader/headerApi";
import { surgeryApi } from "./surgeryApi";
import { MILESTONES, toInputValue, usDateTime } from "./surgeryUtils";

const fromRow = (row) => ({
  times: Object.fromEntries(MILESTONES.map((m) => [m.key, toInputValue(row.times[m.key])])),
  reasons: { ...(row.time_reasons || {}) },
});

/** The Times grid on the Intra-op tab: each milestone with the reason it ran early or late. */
export default function TimesCard({ row, lookups, editable, onSaved }) {
  const [form, setForm] = useState(() => fromRow(row));
  const [busy, setBusy] = useState(false);

  useEffect(() => setForm(fromRow(row)), [row]);

  const reasons = lookups?.delay_reasons || [];

  const save = async () => {
    const body = { time_reasons: form.reasons };
    MILESTONES.forEach((m) => {
      body[m.key] = form.times[m.key] || null;
    });
    setBusy(true);
    try {
      const saved = await surgeryApi.updateCase(row.id, body);
      toast.success("Times saved");
      onSaved(saved);
    } catch (err) {
      toast.error(errorText(err, "The times were not saved."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Times{row.times.patient_in ? ` · Patient In: ${usDateTime(row.times.patient_in)}` : ""}
      </Typography>
      <TableContainer>
        <Table size="small" aria-label="Case times">
          <TableHead>
            <TableRow>
              <TableCell>Type</TableCell>
              <TableCell>Time</TableCell>
              <TableCell>Delay/Early Reason</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {MILESTONES.map((m) => {
              const current = form.reasons[m.key] || "";
              const options = current && !reasons.includes(current) ? [current, ...reasons] : reasons;
              return (
                <TableRow key={m.key}>
                  <TableCell sx={{ whiteSpace: "nowrap" }}>{m.label}</TableCell>
                  <TableCell>
                    <TextField
                      size="small"
                      type="datetime-local"
                      value={form.times[m.key]}
                      disabled={!editable}
                      onChange={(e) => setForm((f) => ({ ...f, times: { ...f.times, [m.key]: e.target.value } }))}
                      inputProps={{ "aria-label": m.label }}
                    />
                  </TableCell>
                  <TableCell sx={{ minWidth: 260 }}>
                    <TextField
                      size="small"
                      select
                      fullWidth
                      value={current}
                      disabled={!editable}
                      onChange={(e) => setForm((f) => ({ ...f, reasons: { ...f.reasons, [m.key]: e.target.value } }))}
                      inputProps={{ "aria-label": `${m.label} reason` }}
                      SelectProps={{ displayEmpty: true }}
                    >
                      <MenuItem value="">
                        <em>None</em>
                      </MenuItem>
                      {options.map((r) => (
                        <MenuItem key={r} value={r}>
                          {r}
                        </MenuItem>
                      ))}
                    </TextField>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
      {editable && (
        <Button variant="contained" size="small" onClick={save} disabled={busy} sx={{ mt: 1 }}>
          {busy ? "Saving…" : "Save Times"}
        </Button>
      )}
    </Paper>
  );
}
