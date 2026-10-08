import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import { toast } from "../SimpleToast";
import { announceTaskChange, errorText, fmtDateTime, runTaskAction } from "./taskShared";

/** "Task Completed?" -- one question, Yes records it as done now. Late ones must say why, as everywhere else. */
export function TaskCompletedDialog({ task, graceMinutes = 60, onClose, onDone, onMore }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const late = Math.abs(Date.now() - new Date(task.due_at).getTime()) > graceMinutes * 60000;

  const yes = async () => {
    if (late && !note.trim()) return setError("This is outside its time window. Say why in the note.");
    setBusy(true);
    setError("");
    try {
      const body = { note: note.trim() };
      if (task.task_type === "medication") Object.assign(body, { dose_given: task.dose || "", route_given: task.route || "" });
      await runTaskAction(task.id, "complete", body);
      toast.success("Documented.");
      announceTaskChange();
      onDone();
    } catch (err) {
      setError(errorText(err, "Could not save that."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="xs" data-testid="task-completed-dialog">
      <DialogTitle>Task Completed?</DialogTitle>
      <DialogContent dividers>
        <Typography variant="subtitle2">{task.title}</Typography>
        <Typography variant="caption" color="text.secondary" component="div">
          {task.patient_name} · due {fmtDateTime(task.due_at)}
          {task.dose ? ` · ${task.dose}` : ""}
          {task.route ? ` ${task.route}` : ""}
        </Typography>
        {error && (
          <Alert severity="error" sx={{ mt: 1.5 }} data-testid="task-completed-error">
            {error}
          </Alert>
        )}
        {late && (
          <>
            <Alert severity="warning" sx={{ mt: 1.5 }} data-testid="task-completed-late">
              This is more than {graceMinutes} minutes from the due time. A note is required.
            </Alert>
            <TextField size="small" fullWidth multiline minRows={2} required label="Note" value={note} onChange={(e) => setNote(e.target.value)} sx={{ mt: 1.5 }} inputProps={{ "data-testid": "task-completed-note" }} />
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ justifyContent: "space-between" }}>
        <Button size="small" onClick={() => onMore(task)} disabled={busy} data-testid="task-completed-more">
          More options
        </Button>
        <Box>
          <Button onClick={onClose} disabled={busy} data-testid="task-completed-no">
            No
          </Button>
          <Button variant="contained" onClick={yes} disabled={busy} data-testid="task-completed-yes">
            Yes
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
}

const STATE_WORD = { held: "Held", refused: "Refused", missed: "Missed", cancelled: "Cancelled" };

/** The status square: empty while waiting, a check and the initials of whoever did it once done. */
function StatusCell({ task, canPerform, onPick }) {
  if (task.status === "pending") {
    const box = (
      <Box
        component={canPerform ? "button" : "span"}
        type={canPerform ? "button" : undefined}
        aria-label={`Document ${task.title}`}
        onClick={canPerform ? () => onPick(task) : undefined}
        data-testid={`grid-status-${task.id}`}
        sx={{
          width: 56, height: 28, borderRadius: 1, bgcolor: "transparent", cursor: canPerform ? "pointer" : "default",
          border: "2px solid", borderColor: task.overdue ? "error.main" : "divider", display: "inline-block",
          "&:hover": canPerform ? { borderColor: "primary.main" } : undefined,
        }}
      />
    );
    return task.overdue ? <Tooltip title={`${task.minutes_late} min late`}>{box}</Tooltip> : box;
  }
  const initials = task.performed_by_initials || "";
  const done = task.status === "done";
  return (
    <Box
      component="button"
      type="button"
      aria-label={`${done ? "Done" : STATE_WORD[task.status] || task.status_label}${initials ? ` by ${initials}` : ""}: ${task.title}`}
      onClick={() => onPick(task)}
      data-testid={`grid-status-${task.id}`}
      sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, border: 0, bgcolor: "transparent", cursor: "pointer", p: 0.5, color: done ? "success.main" : "warning.main", font: "inherit" }}
    >
      {done ? <CheckIcon fontSize="small" /> : <Typography variant="caption" fontWeight={700}>{STATE_WORD[task.status] || task.status_label}</Typography>}
      <Typography variant="body2" fontWeight={700} component="span" sx={{ color: "text.primary" }}>
        {initials}
      </Typography>
    </Box>
  );
}

/**
 * The last-24-hours grid: one row per task -- patient/bed, task, frequency, time, status.
 * Pending cells are empty squares you click to answer "Task Completed?"; finished ones show a check and the initials.
 */
export default function TaskGrid({ rows, loading, scoped, canPerform, graceMinutes, onOpen, onChanged, onMore }) {
  const [asking, setAsking] = useState(null);
  const cols = scoped ? 4 : 5;

  const pick = (task) => {
    if (task.status === "pending") setAsking(task);
    else onOpen(task.id);
  };

  return (
    <>
      <TableContainer component={Paper} variant="outlined" data-testid="task-grid">
        <Table size="small" aria-label="Last 24 hours" sx={{ "& td, & th": { borderRight: 1, borderColor: "divider" }, "& td:last-of-type, & th:last-of-type": { borderRight: 0 } }}>
          <TableHead>
            <TableRow>
              {!scoped && <TableCell>Patient / bed</TableCell>}
              <TableCell>Task</TableCell>
              <TableCell>Frequency</TableCell>
              <TableCell>Time</TableCell>
              <TableCell align="center">Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={cols}>
                  <CircularProgress size={20} />
                </TableCell>
              </TableRow>
            )}
            {!loading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={cols} data-testid="task-empty">
                  <Typography variant="body2" color="text.secondary">
                    Nothing in the last 24 hours.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {rows.map((t) => (
              <TableRow key={t.id} data-testid={`grid-row-${t.id}`}>
                {!scoped && (
                  <TableCell>
                    <Typography variant="body2">{t.patient_name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {[t.unit_name, t.room_name, t.bed_name].filter(Boolean).join(" · ")}
                    </Typography>
                  </TableCell>
                )}
                <TableCell>
                  <Typography variant="body2" fontWeight={600}>
                    {t.title}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {[t.dose, t.route].filter(Boolean).join(" ")}
                  </Typography>
                </TableCell>
                <TableCell>{t.frequency_label}</TableCell>
                <TableCell>
                  <Tooltip title={t.performed_at ? `Documented ${fmtDateTime(t.performed_at)}` : ""} disableHoverListener={!t.performed_at}>
                    <span>{t.is_prn ? `PRN ${fmtDateTime(t.due_at)}` : fmtDateTime(t.due_at)}</span>
                  </Tooltip>
                </TableCell>
                <TableCell align="center">
                  <StatusCell task={t} canPerform={canPerform} onPick={pick} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {asking && (
        <TaskCompletedDialog
          task={asking}
          graceMinutes={graceMinutes}
          onClose={() => setAsking(null)}
          onDone={() => {
            setAsking(null);
            onChanged();
          }}
          onMore={(t) => {
            setAsking(null);
            onMore(t);
          }}
        />
      )}
    </>
  );
}
