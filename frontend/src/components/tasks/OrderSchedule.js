import { Box, MenuItem, Stack, TextField, Typography, FormControlLabel, Checkbox } from "@mui/material";
import { CLOCK_FREQUENCIES, FREQUENCY_OPTIONS, ROUTE_OPTIONS, fromLocalInput, missingSchedule, toLocalInput } from "./taskShared";

const EMPTY_KEYS = ["", null, undefined];

/** Drop blank values so the server only sees what was filled in. */
function tidy(schedule) {
  const out = {};
  Object.entries(schedule).forEach(([k, v]) => {
    if (EMPTY_KEYS.includes(v) || v === false) return;
    out[k] = v;
  });
  return out;
}

/**
 * The "how often / how much" part of a draft order. A medication must have it filled in before it can
 * be signed; a nursing order may have it (then nurses get a task at each time) or be left as a standing
 * instruction; other orders do not show it at all.
 */
export default function OrderSchedule({ order, value, onChange, disabled = false }) {
  const mode = order.task_mode;
  if (!mode || mode === "none") return null;
  const s = value || {};
  const required = mode === "required";
  const isMed = order.orderable_category === "medication";
  const missing = missingSchedule(order, s);
  const kind = (FREQUENCY_OPTIONS.find((f) => f.value === s.frequency) || {}).kind;
  const durationMode = s.duration_days ? "days" : s.stop_at ? "until" : "none";

  const set = (patch) => onChange(tidy({ ...s, ...patch }));
  const setDuration = (m) => {
    if (m === "none") set({ duration_days: "", stop_at: "" });
    else if (m === "days") set({ duration_days: s.duration_days || 7, stop_at: "" });
    else set({ duration_days: "", stop_at: s.stop_at || new Date(Date.now() + 7 * 864e5).toISOString() });
  };

  return (
    <Box data-testid={`schedule-${order.id}`}>
      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
        {isMed ? "Dose and schedule" : "Schedule (optional)"}
      </Typography>
      {!required && !s.frequency && (
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
          Leave the frequency empty for a standing instruction. Choose one and nurses get a task each time it is due.
        </Typography>
      )}
      <Stack spacing={1.5}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={1.5}>
          <TextField
            select
            size="small"
            label="Frequency"
            required={required}
            value={s.frequency || ""}
            disabled={disabled}
            onChange={(e) => set({ frequency: e.target.value })}
            sx={{ minWidth: 220 }}
            error={required && missing.includes("frequency")}
            inputProps={{ "data-testid": `schedule-frequency-${order.id}` }}
          >
            {!required && <MenuItem value="">No recurring tasks</MenuItem>}
            {FREQUENCY_OPTIONS.map((f) => (
              <MenuItem key={f.value} value={f.value}>
                {f.label}
              </MenuItem>
            ))}
          </TextField>
          {isMed && (
            <>
              <TextField
                size="small"
                label="Dose"
                placeholder="e.g. 500 mg"
                required
                value={s.dose || ""}
                disabled={disabled}
                onChange={(e) => set({ dose: e.target.value })}
                error={missing.includes("dose")}
                inputProps={{ maxLength: 120, "data-testid": `schedule-dose-${order.id}` }}
              />
              <TextField
                select
                size="small"
                label="Route"
                required
                value={s.route || ""}
                disabled={disabled}
                onChange={(e) => set({ route: e.target.value })}
                sx={{ minWidth: 140 }}
                error={missing.includes("route")}
                inputProps={{ "data-testid": `schedule-route-${order.id}` }}
              >
                {ROUTE_OPTIONS.map((r) => (
                  <MenuItem key={r} value={r}>
                    {r}
                  </MenuItem>
                ))}
              </TextField>
            </>
          )}
        </Stack>

        {kind === "prn" && (
          <Stack direction={{ xs: "column", md: "row" }} spacing={1.5}>
            <TextField
              size="small"
              fullWidth
              required
              label="Give as needed for"
              placeholder="e.g. pain, nausea"
              value={s.prn_reason || ""}
              disabled={disabled}
              onChange={(e) => set({ prn_reason: e.target.value })}
              error={missing.includes("PRN reason")}
              inputProps={{ maxLength: 120, "data-testid": `schedule-prn-reason-${order.id}` }}
            />
            <TextField
              size="small"
              type="number"
              label="At least this many hours apart"
              value={s.min_interval_hours ?? ""}
              disabled={disabled}
              onChange={(e) => set({ min_interval_hours: e.target.value === "" ? "" : Number(e.target.value) })}
              sx={{ minWidth: 230 }}
              inputProps={{ min: 0.5, max: 72, step: 0.5, "data-testid": `schedule-min-interval-${order.id}` }}
            />
          </Stack>
        )}

        {s.frequency && kind !== "prn" && (
          <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} alignItems={{ md: "center" }}>
            <TextField
              size="small"
              type="datetime-local"
              label="First dose at (optional)"
              InputLabelProps={{ shrink: true }}
              value={toLocalInput(s.first_due)}
              disabled={disabled}
              onChange={(e) => set({ first_due: fromLocalInput(e.target.value) })}
              inputProps={{ "data-testid": `schedule-first-${order.id}` }}
            />
            {CLOCK_FREQUENCIES.some((f) => f.value === s.frequency) && (
              <FormControlLabel
                control={<Checkbox size="small" checked={!!s.first_dose_now} disabled={disabled} onChange={(e) => set({ first_dose_now: e.target.checked })} inputProps={{ "data-testid": `schedule-now-${order.id}` }} />}
                label="Give the first dose now"
              />
            )}
            <TextField
              select
              size="small"
              label="How long"
              value={durationMode}
              disabled={disabled}
              onChange={(e) => setDuration(e.target.value)}
              sx={{ minWidth: 190 }}
              inputProps={{ "data-testid": `schedule-duration-mode-${order.id}` }}
            >
              <MenuItem value="none">Until discontinued</MenuItem>
              <MenuItem value="days">For a number of days</MenuItem>
              <MenuItem value="until">Until a date</MenuItem>
            </TextField>
            {durationMode === "days" && (
              <TextField
                size="small"
                type="number"
                label="Days"
                value={s.duration_days || ""}
                disabled={disabled}
                onChange={(e) => set({ duration_days: e.target.value === "" ? "" : Number(e.target.value) })}
                sx={{ width: 100 }}
                inputProps={{ min: 1, max: 365, "data-testid": `schedule-days-${order.id}` }}
              />
            )}
            {durationMode === "until" && (
              <TextField
                size="small"
                type="datetime-local"
                label="Stop at"
                InputLabelProps={{ shrink: true }}
                value={toLocalInput(s.stop_at)}
                disabled={disabled}
                onChange={(e) => set({ stop_at: fromLocalInput(e.target.value) })}
                inputProps={{ "data-testid": `schedule-stop-${order.id}` }}
              />
            )}
          </Stack>
        )}

        {(s.frequency || isMed) && (
          <TextField
            size="small"
            fullWidth
            label="Instructions for the nurse (optional)"
            placeholder="e.g. give with food"
            value={s.instructions || ""}
            disabled={disabled}
            onChange={(e) => set({ instructions: e.target.value })}
            inputProps={{ maxLength: 500, "data-testid": `schedule-instructions-${order.id}` }}
          />
        )}
        {required && missing.length > 0 && (
          <Typography variant="caption" color="error" data-testid={`schedule-missing-${order.id}`}>
            Needed before signing: {missing.join(", ")}.
          </Typography>
        )}
      </Stack>
    </Box>
  );
}
