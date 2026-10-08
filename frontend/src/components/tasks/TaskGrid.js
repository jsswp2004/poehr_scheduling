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
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import { toast } from "../SimpleToast";
import { DEFAULT_COLUMNS, announceTaskChange, columnFor, errorText, fmtDateTime, fmtTime, minutesLabel, runTaskAction } from "./taskShared";

/** "Task Completed?" -- one question, Yes records it as done now. Late ones must say why, as everywhere else. */
export function TaskCompletedDialog({ task, performedAt = null, graceMinutes = 60, onClose, onDone, onMore }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const givenAt = performedAt ? performedAt.getTime() : Date.now();
  const late = Math.abs(givenAt - new Date(task.due_at).getTime()) > graceMinutes * 60000;
  const can = (a) => (task.actions || []).includes(a);

  const yes = async () => {
    if (late && !note.trim()) return setError("This is outside its time window. Say why in the note.");
    setBusy(true);
    setError("");
    try {
      const body = { note: note.trim() };
      if (performedAt) body.performed_at = performedAt.toISOString();
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
        {performedAt && (
          <Typography variant="body2" sx={{ mt: 1 }} data-testid="task-completed-at">
            Given at {fmtDateTime(performedAt.toISOString())}
          </Typography>
        )}
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
      <DialogActions sx={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <Box>
          <Button size="small" onClick={() => onMore(task, "complete")} disabled={busy} data-testid="task-completed-more">
            More options
          </Button>
          {can("hold") && (
            <Button size="small" onClick={() => onMore(task, "hold")} disabled={busy} data-testid="task-completed-hold">
              Hold
            </Button>
          )}
          {can("refuse") && (
            <Button size="small" color="error" onClick={() => onMore(task, "refuse")} disabled={busy} data-testid="task-completed-refuse">
              Refused
            </Button>
          )}
        </Box>
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

export const DUE_BG = "#c8e6c9"; // light green: due now
export const OVERDUE_BG = "#f8c9d4"; // light pink: overdue
const WORD = { held: "Held", refused: "Refused", missed: "Missed" };
const LEFT = [150, 230, 120]; // widths of the three fixed columns

/** One task's mark inside its hour cell: pink/green when it needs doing, a check and initials when done. */
function Mark({ task, canClick, onPick }) {
  const time = fmtTime(task.due_at);
  const can = (task.actions || []).includes("complete");
  const clickable = task.status === "done" || task.status === "held" || task.status === "refused" || (canClick && can && (task.status === "pending" || task.status === "missed"));
  let content;
  let sx = {};
  let word;
  if (task.status === "done") {
    word = "Done";
    content = (
      <>
        <CheckIcon sx={{ fontSize: 16, color: "success.main" }} />
        <b>{task.performed_by_initials}</b>
      </>
    );
  } else if (task.status === "held" || task.status === "refused") {
    word = WORD[task.status];
    content = (
      <>
        <span>{word}</span>
        <b>{task.performed_by_initials}</b>
      </>
    );
    sx = { color: "warning.dark" };
  } else if (task.status === "missed") {
    word = "Missed";
    content = <b>{time}</b>;
    sx = { color: "#d32f2f", fontWeight: 700 };
  } else {
    word = task.overdue ? "Overdue" : task.due_now ? "Due" : "Scheduled";
    content = <span>{time}</span>;
    if (task.overdue) sx = { backgroundColor: OVERDUE_BG };
    else if (task.due_now) sx = { backgroundColor: DUE_BG };
  }
  const tip = task.performed_at ? `Documented ${fmtDateTime(task.performed_at)}${task.performed_by_name ? ` by ${task.performed_by_name}` : ""}` : task.overdue ? `${task.minutes_late} min late` : "";
  const box = (
    <Box
      component={clickable ? "button" : "span"}
      type={clickable ? "button" : undefined}
      aria-label={`${word}: ${task.title} at ${time}`}
      data-testid={`grid-cell-${task.id}`}
      data-state={task.status === "pending" ? (task.overdue ? "overdue" : task.due_now ? "due" : "scheduled") : task.status}
      onClick={clickable ? (e) => { e.stopPropagation(); onPick(task); } : undefined}
      sx={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: 0.5, width: "100%", minHeight: 28, px: 0.5, border: 0, borderRadius: 0.5,
        bgcolor: "transparent", font: "inherit", fontSize: 12, cursor: clickable ? "pointer" : "default", color: "text.primary",
        "&:hover": clickable ? { outline: "2px solid", outlineColor: "primary.main" } : undefined, ...sx,
      }}
    >
      {content}
    </Box>
  );
  return tip ? <Tooltip title={tip}>{box}</Tooltip> : box;
}

/**
 * The day grid, laid out like the eMAR: the task on the left, the hours of the day across the top, and each
 * task's mark in the hour it is due. An "Earlier" column holds anything from before this day still waiting or missed.
 */
export default function TaskGrid({ rows, day, columns = DEFAULT_COLUMNS, showEarlier, loading, scoped, canPerform, graceMinutes, onOpen, onChanged, onMore, onSelectPatient = null }) {
  const [asking, setAsking] = useState(null); // { task, at }
  const start = day.getTime();
  const end = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime();
  const now = new Date();
  const isToday = now.getTime() >= start && now.getTime() < end;
  const hasEarlier = rows.some((t) => new Date(t.due_at).getTime() < start);
  const earlier = showEarlier && hasEarlier;
  const nowColumn = isToday ? columnFor(columns, now.getHours() * 60 + now.getMinutes()) : null;

  // one line per order (per patient), each with its tasks sorted into the hour they fall in
  const lines = [];
  const byKey = new Map();
  rows.forEach((t) => {
    const key = `${t.patient}-${t.order}`;
    let line = byKey.get(key);
    if (!line) {
      line = { key, first: t, tasks: [], cells: new Map() };
      byKey.set(key, line);
      lines.push(line);
    }
    line.tasks.push(t);
    const due = new Date(t.due_at);
    const slot = due.getTime() < start ? "earlier" : columnFor(columns, due.getHours() * 60 + due.getMinutes());
    if (!line.cells.has(slot)) line.cells.set(slot, []);
    line.cells.get(slot).push(t);
  });

  const waiting = (t) => (t.status === "pending" || t.status === "missed") && (t.actions || []).includes("complete");

  const pick = (task) => {
    if (task.status === "pending" || task.status === "missed") setAsking({ task, at: null });
    else onOpen(task.id);
  };

  // Anywhere in a cell works, not only the small mark inside it. A cell with no task of its own, in a row that
  // still has something waiting, records that task as given at this column's time.
  const clickCell = (line, slot) => {
    if (!canPerform) return;
    const here = line.cells.get(slot) || [];
    if (here.length > 0) {
      const target = here.find(waiting) || here[0];
      if (target) pick(target);
      return;
    }
    if (slot === "earlier") return;
    const at = new Date(start + slot * 60000);
    if (at.getTime() > Date.now()) return;
    const open = line.tasks.filter(waiting);
    if (open.length === 0) return;
    const task = open.reduce((best, t) => (Math.abs(new Date(t.due_at) - at) < Math.abs(new Date(best.due_at) - at) ? t : best));
    setAsking({ task, at });
  };
  const canGive = (line, slot) => {
    if (!canPerform || slot === "earlier" || (line.cells.get(slot) || []).length > 0) return false;
    return start + slot * 60000 <= Date.now() && line.tasks.some(waiting);
  };

  const headCell = { position: "sticky", top: 0, zIndex: 3, backgroundColor: "grey.100", borderBottom: 1, borderColor: "divider", fontSize: 12, fontWeight: 600, p: 0.75, whiteSpace: "nowrap" };
  const cell = { borderBottom: 1, borderRight: 1, borderColor: "divider", p: 0.25, verticalAlign: "middle", textAlign: "center", fontSize: 12, minWidth: 56 };
  const fixed = [!scoped && "Patient / bed", "Task", "Frequency"].filter(Boolean);
  const widths = scoped ? [LEFT[1], LEFT[2]] : LEFT;
  const stickyAt = (i) => {
    const w = widths.slice(0, i).reduce((a, b) => a + b, 0);
    return { position: "sticky", left: w, zIndex: 2, backgroundColor: "background.paper", minWidth: widths[i], maxWidth: widths[i] };
  };
  const span = fixed.length + (earlier ? 1 : 0) + columns.length;

  return (
    <>
      <Paper variant="outlined" sx={{ overflow: "auto", maxHeight: "68vh" }} data-testid="task-grid">
        <Box component="table" aria-label="Tasks by hour" sx={{ borderCollapse: "separate", borderSpacing: 0, width: "max-content", minWidth: "100%" }}>
          <thead>
            <tr>
              {fixed.map((h, i) => (
                <Box component="th" key={h} scope="col" sx={{ ...headCell, ...stickyAt(i), zIndex: 4, textAlign: "left", backgroundColor: "grey.100" }}>
                  {h}
                </Box>
              ))}
              {earlier && (
                <Box component="th" scope="col" sx={{ ...headCell, textAlign: "center", minWidth: 64 }} data-testid="grid-earlier-head">
                  Earlier
                </Box>
              )}
              {columns.map((m) => (
                <Box
                  component="th"
                  key={m}
                  scope="col"
                  data-testid={`grid-col-${m}`}
                  sx={{ ...headCell, textAlign: "center", minWidth: 56, ...(m === nowColumn ? { backgroundColor: "#e3f2fd", color: "primary.main" } : {}) }}
                >
                  {minutesLabel(m)}
                </Box>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && lines.length === 0 && (
              <tr>
                <td colSpan={span} style={{ padding: 12 }}>
                  <CircularProgress size={20} />
                </td>
              </tr>
            )}
            {!loading && lines.length === 0 && (
              <tr>
                <td colSpan={span} style={{ padding: 12 }} data-testid="task-empty">
                  <Typography variant="body2" color="text.secondary">
                    No tasks for this day.
                  </Typography>
                </td>
              </tr>
            )}
            {lines.map((line) => {
              const t = line.first;
              const slots = earlier ? ["earlier", ...columns] : columns;
              return (
                <tr key={line.key} data-testid={`grid-row-${t.order}`}>
                  {!scoped && (
                    <Box component="td" sx={{ ...cell, ...stickyAt(0), textAlign: "left", p: 0.75 }}>
                      {onSelectPatient ? (
                        <Box
                          component="button"
                          type="button"
                          onClick={() => onSelectPatient({ id: t.patient, name: t.patient_name })}
                          aria-label={`Show ${t.patient_name} only`}
                          data-testid={`grid-patient-${t.patient}`}
                          sx={{ p: 0, border: 0, bgcolor: "transparent", font: "inherit", fontSize: "0.875rem", color: "primary.main", cursor: "pointer", textAlign: "left", textDecoration: "underline" }}
                        >
                          {t.patient_name}
                        </Box>
                      ) : (
                        <Typography variant="body2">{t.patient_name}</Typography>
                      )}
                      <Typography variant="caption" color="text.secondary">
                        {[t.unit_name, t.room_name, t.bed_name].filter(Boolean).join(" · ")}
                      </Typography>
                    </Box>
                  )}
                  <Box component="td" sx={{ ...cell, ...stickyAt(scoped ? 0 : 1), textAlign: "left", p: 0.75 }}>
                    <Typography variant="body2" fontWeight={600}>
                      {t.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {[t.dose, t.route].filter(Boolean).join(" ")}
                      {t.instructions ? ` · ${t.instructions}` : ""}
                    </Typography>
                  </Box>
                  <Box component="td" sx={{ ...cell, ...stickyAt(scoped ? 1 : 2), textAlign: "left", p: 0.75 }}>
                    {t.frequency_label}
                  </Box>
                  {slots.map((slot) => (
                    <Box
                      component="td"
                      key={slot}
                      sx={{ ...cell, ...(canPerform && ((line.cells.get(slot) || []).length > 0 || canGive(line, slot)) ? { cursor: "pointer", "&:hover": { backgroundColor: canGive(line, slot) ? "#f1f8ff" : undefined } } : {}) }}
                      data-testid={`grid-slot-${t.order}-${slot}`}
                      onClick={() => clickCell(line, slot)}
                      {...(canGive(line, slot) ? { role: "button", "aria-label": `Document ${t.title} at ${minutesLabel(slot)}` } : {})}
                    >
                      {(line.cells.get(slot) || []).map((task) => (
                        <Mark key={task.id} task={task} canClick={canPerform} onPick={pick} />
                      ))}
                    </Box>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </Box>
      </Paper>
      {asking && (
        <TaskCompletedDialog
          task={asking.task}
          performedAt={asking.at}
          graceMinutes={graceMinutes}
          onClose={() => setAsking(null)}
          onDone={() => {
            setAsking(null);
            onChanged();
          }}
          onMore={(t, action) => {
            setAsking(null);
            onMore(t, action);
          }}
        />
      )}
    </>
  );
}
