import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, CircularProgress, Paper, Stack, TextField, Typography } from "@mui/material";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { toast } from "../SimpleToast";
import { applyToFacilities } from "../../utils/facilityScope";
import { CLOCK_FREQUENCIES, authHeader, errorText } from "./taskShared";

const isTime = (t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

/** Settings > Tasks: the time window, when an undocumented task counts as missed, and the clock times of each frequency. */
export default function TaskSettings() {
  const [cfg, setCfg] = useState(null);
  const [grace, setGrace] = useState("60");
  const [missed, setMissed] = useState("12");
  const [ahead, setAhead] = useState("24");
  const [times, setTimes] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await api.get(apiEndpoints.orderTaskSettings, { headers: await authHeader() });
      const d = res.data;
      setCfg(d);
      setGrace(String(d.grace_minutes));
      setMissed(String(d.missed_after_hours));
      setAhead(String(d.look_ahead_hours));
      setTimes(Object.fromEntries(Object.entries(d.pass_times || {}).map(([k, v]) => [k, v.join(", ")])));
      setError("");
    } catch (err) {
      setError(errorText(err, "Could not load the task settings."));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const canEdit = !!cfg?.can_edit;

  const save = async () => {
    setError("");
    const whole = (v, lo, hi, label) => {
      const n = Number(v);
      if (!Number.isInteger(n) || n < lo || n > hi) throw new Error(`${label} must be a whole number from ${lo} to ${hi}.`);
      return n;
    };
    let body;
    try {
      const pass_times = {};
      CLOCK_FREQUENCIES.forEach((f) => {
        const list = String(times[f.value] || "").split(",").map((t) => t.trim()).filter(Boolean);
        if (!list.length || !list.every(isTime)) throw new Error(`Give ${f.label} one or more times like 09:00, separated by commas.`);
        pass_times[f.value] = list;
      });
      body = {
        grace_minutes: whole(grace, 0, 720, "The time window"),
        missed_after_hours: whole(missed, 1, 168, "The hours before a task counts as missed"),
        look_ahead_hours: whole(ahead, 12, 72, "The look-ahead hours"),
        pass_times,
      };
    } catch (err) {
      return setError(err.message);
    }
    setBusy(true);
    try {
      await applyToFacilities(async () => api.put(apiEndpoints.orderTaskSettings, body, { headers: await authHeader() }));
      toast.success("Task rules saved. New tasks use the new times; tasks already created keep theirs.");
      load();
    } catch (err) {
      setError(errorText(err, "Could not save the task rules."));
    } finally {
      setBusy(false);
    }
  };

  if (!cfg && !error) return <CircularProgress size={22} />;

  return (
    <Box sx={{ p: 2, maxWidth: 900 }} data-testid="task-settings">
      <Typography variant="h6">Tasks</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        How nurse tasks made from signed orders behave in your clinic.
      </Typography>
      {error && <Alert severity="error" sx={{ mb: 1 }} data-testid="task-settings-error">{error}</Alert>}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle1">Timing rules</Typography>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mt: 1.5 }}>
          <TextField size="small" type="number" label="On-time window (± minutes)" helperText="Outside this a note is required" value={grace} disabled={!canEdit} onChange={(e) => setGrace(e.target.value)} inputProps={{ min: 0, max: 720, "data-testid": "task-grace" }} />
          <TextField size="small" type="number" label="Missed after (hours)" helperText="Undocumented tasks turn to Missed" value={missed} disabled={!canEdit} onChange={(e) => setMissed(e.target.value)} inputProps={{ min: 1, max: 168, "data-testid": "task-missed" }} />
          <TextField size="small" type="number" label="Create tasks ahead (hours)" helperText="12 to 72" value={ahead} disabled={!canEdit} onChange={(e) => setAhead(e.target.value)} inputProps={{ min: 12, max: 72, "data-testid": "task-ahead" }} />
        </Stack>
      </Paper>
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle1">Medication pass times</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          The clock times for orders written as daily, BID, TID and so on. Use 24-hour times separated by commas.
        </Typography>
        <Stack spacing={1.5}>
          {CLOCK_FREQUENCIES.map((f) => (
            <TextField key={f.value} size="small" label={f.label} value={times[f.value] ?? ""} disabled={!canEdit} onChange={(e) => setTimes((t) => ({ ...t, [f.value]: e.target.value }))} inputProps={{ "data-testid": `pass-${f.value}` }} />
          ))}
        </Stack>
      </Paper>
      {canEdit ? (
        <Button variant="contained" onClick={save} disabled={busy} data-testid="task-settings-save">
          Save task rules
        </Button>
      ) : (
        <Typography variant="caption" color="text.secondary">
          An administrator sets these rules.
        </Typography>
      )}
    </Box>
  );
}
