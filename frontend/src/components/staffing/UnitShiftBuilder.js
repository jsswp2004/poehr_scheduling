import { Alert, Box, Button, Chip, IconButton, Paper, Stack, TextField, Typography } from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";

export const QUICK_SHIFTS = [
  { name: "Regular day", start: "08:00", end: "17:00", break_minutes: 60 },
  { name: "Day", start: "07:00", end: "15:00", break_minutes: 0 },
  { name: "Evening", start: "15:00", end: "23:00", break_minutes: 0 },
  { name: "Night", start: "23:00", end: "07:00", break_minutes: 0 },
];

export const MAX_SHIFTS = 6;

const toMin = (t) => {
  const [h, m] = String(t || "0:0").split(":");
  return Number(h) * 60 + Number(m);
};

/** Clock length and paid (care) hours of one shift row. */
export function shiftHours(s) {
  if (!s.start || !s.end || s.start === s.end) return { span: 0, care: 0, nextDay: false };
  const span = (toMin(s.end) - toMin(s.start) + 1440) % 1440;
  const care = Math.max(span - (Number(s.break_minutes) || 0), 0);
  return { span: span / 60, care: care / 60, nextDay: toMin(s.end) < toMin(s.start) };
}

const fmtH = (h) => (Number.isInteger(h) ? `${h}` : h.toFixed(1));

/** Messages about a shift list: errors block saving, warnings do not. */
export function checkShifts(shifts) {
  const errors = [];
  const warnings = [];
  const seen = new Set();
  shifts.forEach((s, i) => {
    const label = (s.name || "").trim() || `Shift ${i + 1}`;
    if (!(s.name || "").trim()) errors.push(`Shift ${i + 1} needs a name.`);
    else if (seen.has(s.name.trim().toLowerCase())) errors.push(`Two shifts are named "${s.name.trim()}". Names must be different.`);
    seen.add((s.name || "").trim().toLowerCase());
    const h = shiftHours(s);
    if (!h.span) errors.push(`${label} needs different start and end times.`);
    else if (h.care <= 0) errors.push(`${label}: the unpaid break must be shorter than the shift.`);
  });
  for (let i = 0; i < shifts.length; i += 1) {
    for (let j = i + 1; j < shifts.length; j += 1) {
      const a = shifts[i];
      const b = shifts[j];
      const ha = shiftHours(a);
      const hb = shiftHours(b);
      if (!ha.span || !hb.span) continue;
      const a0 = toMin(a.start);
      const b0 = toMin(b.start);
      const overlap = (x0, xl, y0, yl) => {
        const d = (y0 - x0 + 1440) % 1440;
        return d < xl * 60 || (x0 - y0 + 1440) % 1440 < yl * 60;
      };
      if (overlap(a0, ha.span, b0, hb.span)) {
        warnings.push(`${a.name || `Shift ${i + 1}`} and ${b.name || `Shift ${j + 1}`} overlap. That is allowed; their care hours are counted separately.`);
      }
    }
  }
  return { errors, warnings };
}

export default function UnitShiftBuilder({ shifts, onChange }) {
  const { errors, warnings } = checkShifts(shifts);
  const set = (i, patch) => onChange(shifts.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  const add = (preset) =>
    onChange([...shifts, { name: "", start: "08:00", end: "17:00", break_minutes: 0, ...(preset || {}) }]);
  const total = shifts.reduce((n, s) => n + shiftHours(s).care, 0);

  return (
    <Stack spacing={1.5} data-testid="unit-shift-builder">
      {shifts.map((s, i) => {
        const h = shiftHours(s);
        return (
          <Paper key={s.key || i} variant="outlined" sx={{ p: 1.5 }}>
            <Stack spacing={1.25}>
              <Stack direction="row" spacing={1} alignItems="center">
                <TextField
                  size="small"
                  fullWidth
                  label="Shift name"
                  value={s.name}
                  onChange={(e) => set(i, { name: e.target.value })}
                  slotProps={{ htmlInput: { maxLength: 40 } }}
                />
                <IconButton
                  aria-label={`Remove ${s.name || `shift ${i + 1}`}`}
                  onClick={() => onChange(shifts.filter((_, k) => k !== i))}
                  disabled={shifts.length <= 1}
                >
                  <DeleteOutlineIcon />
                </IconButton>
              </Stack>
              <Stack direction="row" spacing={1}>
                <TextField
                  size="small"
                  type="time"
                  label="Start"
                  value={s.start}
                  onChange={(e) => set(i, { start: e.target.value })}
                  slotProps={{ inputLabel: { shrink: true } }}
                  sx={{ flex: 1 }}
                />
                <TextField
                  size="small"
                  type="time"
                  label="End"
                  value={s.end}
                  onChange={(e) => set(i, { end: e.target.value })}
                  slotProps={{ inputLabel: { shrink: true } }}
                  sx={{ flex: 1 }}
                />
                <TextField
                  size="small"
                  type="number"
                  label="Unpaid break (min)"
                  value={s.break_minutes}
                  onChange={(e) => set(i, { break_minutes: e.target.value === "" ? "" : Math.max(0, Number(e.target.value)) })}
                  slotProps={{ htmlInput: { min: 0, step: 5 } }}
                  sx={{ flex: 1 }}
                />
              </Stack>
              <Typography variant="caption" color="text.secondary">
                {h.span ? `${fmtH(h.care)} care hours` : "Set a start and end time"}
                {h.nextDay ? " · Ends next day" : ""}
              </Typography>
            </Stack>
          </Paper>
        );
      })}

      {errors.map((m) => (
        <Alert key={m} severity="error">{m}</Alert>
      ))}
      {warnings.map((m) => (
        <Alert key={m} severity="warning">{m}</Alert>
      ))}

      {shifts.length < MAX_SHIFTS && (
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.75 }}>
            Add a shift
          </Typography>
          <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
            {QUICK_SHIFTS.filter((q) => !shifts.some((s) => (s.name || "").trim().toLowerCase() === q.name.toLowerCase())).map((q) => (
              <Chip
                key={q.name}
                clickable
                variant="outlined"
                label={`${q.name} ${q.start.replace(/^0/, "")}–${q.end.replace(/^0/, "")}`}
                onClick={() => add(q)}
              />
            ))}
            <Chip clickable color="primary" variant="outlined" label="+ Other" onClick={() => add({ name: "" })} />
          </Stack>
        </Box>
      )}
      <Typography variant="body2" color="text.secondary">
        {shifts.length > 0 ? `${fmtH(total)} care hours a day across ${shifts.length} shift${shifts.length === 1 ? "" : "s"}. ` : ""}
        HPPD care hours are split across these shifts in proportion to their length. Which days a shift runs is set in Coverage requirements.
      </Typography>
    </Stack>
  );
}
