import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { DEFAULT_COLUMNS, MAX_COLUMNS, expandRange, mergeColumns, minutesLabel, parseClock } from "./taskShared";

const STEPS = [1, 2, 5, 10, 15, 20, 30, 60, 120];
const BIG = 144;

/**
 * Add and delete the grid's time columns: one time at a time, or a range (every 1, 5, 10 ... minutes).
 * Nothing changes until Save; the columns belong to the person who set them.
 */
export default function TaskColumnsDialog({ columns, onClose, onSave, saving = false, error = "" }) {
  const [list, setList] = useState(columns);
  const [one, setOne] = useState("");
  const [from, setFrom] = useState("08:00");
  const [to, setTo] = useState("12:00");
  const [step, setStep] = useState(15);
  const [problem, setProblem] = useState("");

  const rangeTimes = expandRange(parseClock(from), parseClock(to), Number(step));

  const add = (times) => {
    const merged = mergeColumns(list, times);
    if (merged.length > MAX_COLUMNS) return setProblem(`At most ${MAX_COLUMNS} columns.`);
    setProblem("");
    setList(merged);
  };

  const addOne = () => {
    const m = parseClock(one);
    if (m == null) return setProblem("Pick a time to add.");
    add([m]);
    setOne("");
  };

  const addRange = () => {
    if (parseClock(from) == null || parseClock(to) == null) return setProblem("Pick the start and end times.");
    if (rangeTimes.length === 0) return setProblem("The end time must be the same as or after the start time.");
    add(rangeTimes);
  };

  const remove = (m) => {
    if (list.length === 1) return setProblem("Keep at least one time column.");
    setProblem("");
    setList(list.filter((x) => x !== m));
  };

  return (
    <Dialog open onClose={saving ? undefined : onClose} fullWidth maxWidth="sm" data-testid="columns-dialog">
      <DialogTitle>Time columns</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {(problem || error) && (
            <Alert severity="error" data-testid="columns-error">
              {problem || error}
            </Alert>
          )}

          <Box>
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
              Add one time
            </Typography>
            <Stack direction="row" spacing={1}>
              <TextField size="small" type="time" value={one} onChange={(e) => setOne(e.target.value)} inputProps={{ step: 60, "aria-label": "Time to add", "data-testid": "col-one" }} InputLabelProps={{ shrink: true }} />
              <Button variant="outlined" onClick={addOne} data-testid="col-add-one">
                Add
              </Button>
            </Stack>
          </Box>

          <Box>
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
              Add a range
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <TextField size="small" label="From" type="time" value={from} onChange={(e) => setFrom(e.target.value)} InputLabelProps={{ shrink: true }} inputProps={{ step: 60, "data-testid": "col-from" }} />
              <TextField size="small" label="To" type="time" value={to} onChange={(e) => setTo(e.target.value)} InputLabelProps={{ shrink: true }} inputProps={{ step: 60, "data-testid": "col-to" }} />
              <TextField select size="small" label="Every" value={step} onChange={(e) => setStep(e.target.value)} sx={{ minWidth: 130 }} inputProps={{ "data-testid": "col-step" }}>
                {STEPS.map((n) => (
                  <MenuItem key={n} value={n}>
                    {n === 60 ? "hour" : n === 120 ? "2 hours" : n === 1 ? "minute" : `${n} minutes`}
                  </MenuItem>
                ))}
              </TextField>
              <Button variant="outlined" onClick={addRange} data-testid="col-add-range">
                Add range
              </Button>
            </Stack>
            <Typography variant="caption" color="text.secondary" data-testid="col-range-preview">
              {rangeTimes.length > 0 ? `${rangeTimes.length} column${rangeTimes.length === 1 ? "" : "s"}: ${minutesLabel(rangeTimes[0])} to ${minutesLabel(rangeTimes[rangeTimes.length - 1])}` : "Choose a start, an end and how often."}
            </Typography>
          </Box>

          <Box>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
              <Typography variant="subtitle2" data-testid="col-count">
                {list.length} column{list.length === 1 ? "" : "s"}
              </Typography>
              <Button size="small" onClick={() => { setProblem(""); setList(DEFAULT_COLUMNS); }} data-testid="col-reset">
                Reset to hourly
              </Button>
            </Stack>
            {list.length > BIG && (
              <Alert severity="warning" sx={{ mb: 1 }} data-testid="col-many">
                That is a lot of columns. The grid will scroll sideways.
              </Alert>
            )}
            <Box sx={{ maxHeight: 220, overflow: "auto", display: "flex", flexWrap: "wrap", gap: 0.5, p: 0.5, border: 1, borderColor: "divider", borderRadius: 1 }} data-testid="col-list">
              {list.map((m) => (
                <Chip key={m} size="small" label={minutesLabel(m)} onDelete={() => remove(m)} data-testid={`col-chip-${m}`} deleteIcon={<span aria-label={`Delete ${minutesLabel(m)}`} data-testid={`col-del-${m}`} style={{ fontSize: 16, lineHeight: 1, cursor: "pointer" }}>×</span>} />
              ))}
            </Box>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving} data-testid="col-cancel">
          Cancel
        </Button>
        <Button variant="contained" onClick={() => onSave(list)} disabled={saving || list.length === 0} data-testid="col-save">
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}

