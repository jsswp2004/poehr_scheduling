import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { toast } from "../SimpleToast";
import { STATUS_COLOR, announceTaskChange, authHeader, errorText, fmtDateTime, fromLocalInput, runTaskAction, toLocalInput } from "./taskShared";

const TITLES = { complete: "Document as given / done", hold: "Hold this dose", refuse: "Patient refused", note: "Add a note" };

/** Complete / hold / refuse / note on one task. The server checks every rule and its message is shown as is. */
export function TaskActionDialog({ task, action, graceMinutes = 60, onClose, onDone }) {
  const isMed = task.task_type === "medication";
  const [when, setWhen] = useState("");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState(action === "refuse" ? "Patient refused" : "");
  const [dose, setDose] = useState(task.dose || "");
  const [route, setRoute] = useState(task.route || "");
  const [site, setSite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const performed = when ? new Date(when) : new Date();
  const late = action === "complete" && Math.abs(performed - new Date(task.due_at)) > graceMinutes * 60000;

  const submit = async () => {
    setError("");
    if (action === "hold" && !reason.trim()) return setError("Say why it was held.");
    if (action === "note" && !note.trim()) return setError("Type the note first.");
    if (late && !note.trim()) return setError("This is outside its time window. Say why in the note.");
    setBusy(true);
    try {
      const body = { note: note.trim(), reason: reason.trim() };
      if (when) body.performed_at = fromLocalInput(when);
      if (action === "complete") Object.assign(body, { dose_given: dose, route_given: route, site });
      const data = await runTaskAction(task.id, action, body);
      toast.success(action === "note" ? "Note added." : "Documented.");
      announceTaskChange();
      onDone(data);
    } catch (err) {
      setError(errorText(err, "Could not save that."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="xs" data-testid="task-action-dialog">
      <DialogTitle>{TITLES[action]}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <Box>
            <Typography variant="subtitle2">{task.title}</Typography>
            <Typography variant="caption" color="text.secondary">
              {task.patient_name} · due {fmtDateTime(task.due_at)}
              {task.dose ? ` · ${task.dose}` : ""}
              {task.route ? ` ${task.route}` : ""}
            </Typography>
            {task.instructions && (
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                {task.instructions}
              </Typography>
            )}
          </Box>
          {error && <Alert severity="error" data-testid="task-action-error">{error}</Alert>}
          {action !== "note" && (
            <TextField
              size="small"
              type="datetime-local"
              label="Time (leave blank for now)"
              InputLabelProps={{ shrink: true }}
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              inputProps={{ max: toLocalInput(new Date().toISOString()), "data-testid": "task-when" }}
            />
          )}
          {action === "complete" && isMed && (
            <Stack direction="row" spacing={1}>
              <TextField size="small" label="Dose given" value={dose} onChange={(e) => setDose(e.target.value)} inputProps={{ "data-testid": "task-dose-given" }} />
              <TextField size="small" label="Route" value={route} onChange={(e) => setRoute(e.target.value)} sx={{ width: 110 }} />
              <TextField size="small" label="Site" value={site} onChange={(e) => setSite(e.target.value)} sx={{ width: 110 }} />
            </Stack>
          )}
          {(action === "hold" || action === "refuse") && (
            <TextField
              size="small"
              label={action === "hold" ? "Why is it being held?" : "Reason"}
              required={action === "hold"}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              inputProps={{ "data-testid": "task-reason" }}
            />
          )}
          {late && (
            <Alert severity="warning" data-testid="task-late-hint">
              This is more than {graceMinutes} minutes from the due time. A note is required.
            </Alert>
          )}
          <TextField
            size="small"
            multiline
            minRows={2}
            label={action === "note" || late ? "Note" : "Note (optional)"}
            required={action === "note" || late}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            inputProps={{ "data-testid": "task-note" }}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant="contained" onClick={submit} disabled={busy} data-testid="task-action-submit">
          {busy ? <CircularProgress size={18} /> : action === "note" ? "Add note" : "Save"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** A task's full record: what it was, who did what, and its history. Notes can be added while it is open to the roles that document. */
export function TaskDetailDialog({ taskId, canNote, onClose, onChanged }) {
  const [task, setTask] = useState(null);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);

  const load = async () => {
    try {
      const res = await api.get(apiEndpoints.orderTask(taskId), { headers: await authHeader() });
      setTask(res.data);
    } catch (err) {
      setError(errorText(err, "Could not load the task."));
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, [taskId]);

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" data-testid="task-detail-dialog">
      <DialogTitle>{task ? task.title : "Task"}</DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error">{error}</Alert>}
        {!task && !error && <CircularProgress size={22} />}
        {task && (
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
              <Chip size="small" color={STATUS_COLOR[task.status]} label={task.status_label} />
              {task.overdue && <Chip size="small" color="error" label={`${task.minutes_late} min late`} />}
              <Typography variant="body2">{task.patient_name}</Typography>
              {task.bed_name && (
                <Typography variant="caption" color="text.secondary">
                  {[task.unit_name, task.room_name, task.bed_name].filter(Boolean).join(" · ")}
                </Typography>
              )}
            </Stack>
            <Typography variant="body2">
              Due {fmtDateTime(task.due_at)} · {task.frequency_label}
              {task.dose ? ` · ${task.dose}` : ""}
              {task.route ? ` ${task.route}` : ""}
            </Typography>
            {task.instructions && <Typography variant="body2">{task.instructions}</Typography>}
            {task.performed_at && (
              <Typography variant="body2" data-testid="task-performed">
                {task.status_label} {fmtDateTime(task.performed_at)} by {task.performed_by_name}
                {task.reason ? ` — ${task.reason}` : ""}
                {task.note ? ` (${task.note})` : ""}
              </Typography>
            )}
            <Box>
              <Typography variant="subtitle2">History</Typography>
              {(task.events || []).map((e) => (
                <Typography key={e.id} variant="caption" display="block" color="text.secondary">
                  {fmtDateTime(e.at)} · {e.type}
                  {e.user ? ` · ${e.user}` : ""}
                  {e.detail?.note ? ` — ${e.detail.note}` : e.detail?.reason ? ` — ${e.detail.reason}` : ""}
                </Typography>
              ))}
            </Box>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        {canNote && task && (
          <Button onClick={() => setAdding(true)} data-testid="task-add-note">
            Add note
          </Button>
        )}
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
      {adding && task && (
        <TaskActionDialog
          task={task}
          action="note"
          onClose={() => setAdding(false)}
          onDone={() => {
            setAdding(false);
            load();
            onChanged();
          }}
        />
      )}
    </Dialog>
  );
}

/** Give an as-needed dose: pick the PRN order, say why, and the server checks the minimum gap. */
export function PrnDialog({ patient, onClose, onDone }) {
  const [orders, setOrders] = useState(null);
  const [orderId, setOrderId] = useState("");
  const [reason, setReason] = useState("");
  const [override, setOverride] = useState("");
  const [needOverride, setNeedOverride] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get(apiEndpoints.orderTaskPrnOrders, { headers: await authHeader(), params: { patient: patient.id } });
        setOrders(res.data || []);
        if ((res.data || []).length === 1) setOrderId(res.data[0].order);
      } catch (err) {
        setError(errorText(err, "Could not load the as-needed orders."));
        setOrders([]);
      }
    })();
  }, [patient.id]);

  const chosen = (orders || []).find((o) => o.order === orderId);

  const submit = async () => {
    setError("");
    if (!orderId) return setError("Choose the order.");
    if (!reason.trim()) return setError("Say why it was given.");
    setBusy(true);
    try {
      const body = { order: orderId, reason: reason.trim() };
      if (needOverride && override.trim()) body.override_reason = override.trim();
      await api.post(apiEndpoints.orderTaskPrn, body, { headers: await authHeader() });
      toast.success("Dose documented.");
      announceTaskChange();
      onDone();
    } catch (err) {
      setError(errorText(err, "Could not save that."));
      if (err?.response?.status === 409) setNeedOverride(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="xs" data-testid="prn-dialog">
      <DialogTitle>Give an as-needed dose — {patient.name}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          {error && <Alert severity="warning" data-testid="prn-error">{error}</Alert>}
          {orders === null && <CircularProgress size={22} />}
          {orders && orders.length === 0 && !error && <Typography variant="body2">This patient has no active as-needed orders.</Typography>}
          {orders && orders.length > 0 && (
            <>
              <TextField select size="small" label="Order" value={orderId} onChange={(e) => setOrderId(e.target.value)} inputProps={{ "data-testid": "prn-order" }}>
                {orders.map((o) => (
                  <MenuItem key={o.order} value={o.order}>
                    {o.title} {o.dose} {o.route}
                  </MenuItem>
                ))}
              </TextField>
              {chosen && (
                <Typography variant="caption" color="text.secondary">
                  For {chosen.prn_reason}. {chosen.last_given_at ? `Last given ${fmtDateTime(chosen.last_given_at)}.` : "Not given yet."}
                  {chosen.min_interval_hours ? ` At least ${chosen.min_interval_hours} h apart.` : ""}
                </Typography>
              )}
              <TextField size="small" required label="Why it is being given" value={reason} onChange={(e) => setReason(e.target.value)} inputProps={{ "data-testid": "prn-reason" }} />
              {needOverride && (
                <TextField size="small" required label="Reason to give it sooner" value={override} onChange={(e) => setOverride(e.target.value)} inputProps={{ "data-testid": "prn-override" }} />
              )}
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant="contained" onClick={submit} disabled={busy || !orders || orders.length === 0} data-testid="prn-submit">
          {needOverride ? "Give anyway" : "Document dose"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
