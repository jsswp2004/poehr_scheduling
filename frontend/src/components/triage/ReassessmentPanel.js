import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Paper, Stack, TextField, Typography } from "@mui/material";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { authHeader, errorText } from "../prescriptions/rxShared";
import { LEVEL_NAMES, REASSESS_FIELDS, clock, dueText, reassessmentBody, reassessmentProblem, vitalsText } from "./triageHelpers";

const EMPTY = { sbp: "", dbp: "", hr: "", rr: "", spo2: "", temp_f: "", pain: "", change: "", level: "" };
const FLAGGED = "#7A2E0E";

/**
 * The reassessment log: the initial triage, then each recheck while the patient waits.
 * It shows only once the triage note is signed. The log only grows: rows cannot be edited or deleted.
 */
export default function ReassessmentPanel({ patientId, canAdd = true, refreshKey = 0 }) {
  const [log, setLog] = useState(null);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await api.get(apiEndpoints.triageReassessments(patientId), { headers: await authHeader() });
      setLog(res.data);
      setError("");
    } catch (e) {
      setError(errorText(e, "Could not load the reassessments."));
    }
  }, [patientId]);
  useEffect(() => { load(); }, [load, refreshKey]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const currentLevel = log?.visit?.esi ?? null;

  const useFlowsheet = async () => {
    setFormError("");
    try {
      const res = await api.get(apiEndpoints.triageContext(patientId), { headers: await authHeader() });
      const v = res.data?.vitals || {};
      setForm((f) => ({
        ...f,
        ...Object.fromEntries(REASSESS_FIELDS.map(({ key }) => [key, v[key] === undefined || v[key] === null ? f[key] : String(v[key])])),
      }));
    } catch (e) {
      setFormError(errorText(e, "Could not read the flowsheet."));
    }
  };

  const save = async () => {
    const problem = reassessmentProblem(form, currentLevel);
    if (problem) { setFormError(problem); return; }
    setSaving(true);
    setFormError("");
    try {
      const res = await api.post(apiEndpoints.triageReassessments(patientId), reassessmentBody(form), { headers: await authHeader() });
      setLog(res.data);
      setForm(EMPTY);
      setAdding(false);
    } catch (e) {
      setFormError(errorText(e, "Could not save the reassessment."));
    } finally {
      setSaving(false);
    }
  };

  if (error && !log) return <Alert severity="error" sx={{ mt: 2 }} data-testid="reassess-error">{error}</Alert>;
  if (!log || !log.triage) return null;

  const gap = log.gap_minutes;
  const due = dueText(log);
  return (
    <Paper variant="outlined" sx={{ p: 2, mt: 2 }} data-testid="reassessment-panel">
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <Typography sx={{ fontWeight: 700 }}>Reassessment while waiting</Typography>
        <Box sx={{ flexGrow: 1 }} />
        {canAdd && !adding && <Button size="small" variant="contained" onClick={() => setAdding(true)} sx={{ minHeight: 40 }}>Add reassessment</Button>}
      </Stack>
      <Typography variant="body2" color="text.secondary" data-testid="reassess-gap">
        {gap
          ? `Recheck every ${gap} minutes for ESI ${currentLevel}. `
          : "Your clinic has not set recheck times yet, so no due time is shown. "}
        {due && <strong style={{ color: due === "Recheck overdue" ? "#B42318" : "inherit" }} data-testid="reassess-due">{due}</strong>}
      </Typography>

      {adding && (
        <Box sx={{ mt: 1.5, p: 1.5, border: "1px solid #D8DEE5", borderRadius: 1 }} data-testid="reassess-form">
          <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
            <Button size="small" variant="outlined" onClick={useFlowsheet}>Use latest flowsheet vitals</Button>
          </Stack>
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 1 }}>
            {REASSESS_FIELDS.map(({ key, label }) => (
              <TextField key={key} label={label} size="small" value={form[key]} onChange={set(key)} disabled={saving}
                inputProps={{ inputMode: "decimal", "data-testid": `rf-${key}` }} />
            ))}
          </Box>
          <TextField label="What changed" size="small" fullWidth multiline minRows={2} sx={{ mt: 1 }} value={form.change} onChange={set("change")} disabled={saving}
            inputProps={{ "data-testid": "rf-change" }} />
          <Typography variant="caption" sx={{ display: "block", mt: 1, fontWeight: 600 }}>Level now (leave as is if unchanged)</Typography>
          <Stack direction="row" spacing={1} sx={{ maxWidth: 360 }}>
            {[1, 2, 3, 4, 5].map((n) => {
              const chosen = Number(form.level || currentLevel) === n;
              return (
                <Button key={n} variant={chosen ? "contained" : "outlined"} disabled={saving} aria-pressed={chosen} aria-label={`ESI ${n}: ${LEVEL_NAMES[n]}`}
                  onClick={() => setForm((f) => ({ ...f, level: n === currentLevel ? "" : n }))} sx={{ minHeight: 44, minWidth: 0, flex: 1, fontWeight: 700 }}>{n}</Button>
              );
            })}
          </Stack>
          {formError && <Alert severity="error" sx={{ mt: 1 }} data-testid="reassess-form-error">{formError}</Alert>}
          <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
            <Button variant="contained" onClick={save} disabled={saving} sx={{ minHeight: 44 }}>Save reassessment</Button>
            <Button onClick={() => { setAdding(false); setForm(EMPTY); setFormError(""); }} disabled={saving} sx={{ minHeight: 44 }}>Cancel</Button>
          </Stack>
        </Box>
      )}

      <Box sx={{ overflowX: "auto", mt: 1.5 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }} data-testid="reassess-table">
          <thead>
            <tr style={{ textAlign: "left", color: "#3E4C59", fontSize: 12, textTransform: "uppercase" }}>
              {["Time", "Vital signs", "Change", "Level now", "Nurse"].map((h) => <th key={h} style={{ padding: 8, borderBottom: "1px solid #D8DEE5" }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {log.rows.map((r, i) => {
              const flagged = Object.entries(r.flags || {}).filter(([, f]) => f && f.status && f.status !== "ok").map(([k]) => k);
              return (
                <tr key={r.id ?? `first-${i}`} data-testid="reassess-row">
                  <td style={{ padding: "10px 8px", borderBottom: "1px solid #EEF1F4" }}>{clock(r.at)}</td>
                  <td style={{ padding: "10px 8px", borderBottom: "1px solid #EEF1F4", color: flagged.length ? FLAGGED : "inherit", fontWeight: flagged.length ? 600 : 400 }}>{vitalsText(r.vitals)}</td>
                  <td style={{ padding: "10px 8px", borderBottom: "1px solid #EEF1F4" }}>{r.change}</td>
                  <td style={{ padding: "10px 8px", borderBottom: "1px solid #EEF1F4" }}>
                    {r.level_after ? `ESI ${r.level_after}` : ""}{r.level_before && r.level_before !== r.level_after ? ` (was ${r.level_before})` : ""}
                  </td>
                  <td style={{ padding: "10px 8px", borderBottom: "1px solid #EEF1F4" }}>{r.nurse}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Box>
    </Paper>
  );
}
