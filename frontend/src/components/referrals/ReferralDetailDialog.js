import { useCallback, useEffect, useState } from "react";
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
  Divider,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { toast } from "../SimpleToast";
import ReferralFormDialog from "./ReferralFormDialog";
import {
  ACTION_FORMS,
  STATUS_COLOR,
  URGENCY_COLOR,
  announceChange,
  authHeader,
  errorText,
  fmtDate,
  fmtDateTime,
  overdueText,
  runAction,
  toLocalInput,
} from "./referralShared";

const EVENT_LABELS = {
  created: "Draft created",
  edited: "Draft edited",
  signed_sent: "Signed and sent",
  resent: "Sent again",
  scheduled: "Appointment set",
  rescheduled: "Appointment changed",
  seen: "Patient seen",
  report_received: "Report received",
  needs_info: "Sent back: needs information",
  declined: "Declined by specialist",
  closed: "Closed",
  cancelled: "Cancelled",
  expired: "Expired",
  assigned: "Assigned",
  note: "Note",
};

// Buttons shown in this order, and which ones are the main next step
const ORDER = ["sign_send", "resend", "schedule", "seen", "report", "needs_info", "decline", "close", "expire", "cancel", "assign", "note"];
const PRIMARY = new Set(["sign_send", "resend", "schedule", "seen", "report", "close"]);

function Row({ label, children }) {
  if (children === "" || children == null) return null;
  return (
    <Box sx={{ display: "flex", gap: 1, mb: 0.5 }}>
      <Typography variant="body2" color="text.secondary" sx={{ width: 150, flexShrink: 0 }}>
        {label}
      </Typography>
      <Typography variant="body2" component="div" sx={{ whiteSpace: "pre-wrap" }}>
        {children}
      </Typography>
    </Box>
  );
}

/** The step dialog: asks for only what that step needs, then relays the server's answer. */
function ActionDialog({ referral, action, meta, onClose, onDone }) {
  const cfg = ACTION_FORMS[action] || { title: action, confirm: "OK" };
  const [text, setText] = useState("");
  const [when, setWhen] = useState(cfg.when === "scheduled_for" ? toLocalInput(referral.scheduled_for) : "");
  const [where, setWhere] = useState(referral.appointment_location || "");
  const [assignee, setAssignee] = useState(referral.assigned_to || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    if (cfg.required && !text.trim()) return setError("This is needed before you can continue.");
    if (cfg.when && !cfg.optionalWhen && !when) return setError("Give the date and time.");
    const body = {};
    if (cfg.field) body[cfg.field] = text;
    else if (cfg.text) body.note = text;
    if (cfg.when && when) body[cfg.when] = new Date(when).toISOString();
    if (cfg.location) body.appointment_location = where;
    if (cfg.assign) body.assigned_to = assignee || null;
    setBusy(true);
    try {
      const updated = await runAction(referral.id, action, body);
      toast.success(`${cfg.title}: done.`);
      announceChange();
      onDone(updated);
    } catch (err) {
      setError(errorText(err, "That step could not be saved."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="sm" data-testid="referral-action-dialog">
      <DialogTitle>{cfg.title}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          {error && <Alert severity="error" data-testid="referral-action-error">{error}</Alert>}
          {cfg.intro && <Typography variant="body2">{cfg.intro}</Typography>}
          {cfg.when && (
            <TextField
              size="small"
              type="datetime-local"
              label={cfg.whenLabel}
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              InputLabelProps={{ shrink: true }}
              inputProps={{ "data-testid": "referral-action-when" }}
            />
          )}
          {cfg.location && (
            <TextField
              size="small"
              label="Where (practice, address or room)"
              value={where}
              onChange={(e) => setWhere(e.target.value)}
              inputProps={{ "data-testid": "referral-action-where" }}
            />
          )}
          {cfg.assign && (
            <TextField select size="small" label="Assign to" value={assignee} onChange={(e) => setAssignee(e.target.value)} inputProps={{ "data-testid": "referral-action-assignee" }}>
              <MenuItem value="">Nobody</MenuItem>
              {(meta?.staff || []).map((s) => (
                <MenuItem key={s.id} value={s.id}>
                  {s.name} ({s.role})
                </MenuItem>
              ))}
            </TextField>
          )}
          {cfg.text && (
            <TextField
              size="small"
              multiline={!!cfg.multiline}
              minRows={cfg.rows || 3}
              label={cfg.text}
              value={text}
              onChange={(e) => setText(e.target.value)}
              inputProps={{ "data-testid": "referral-action-text" }}
            />
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Back
        </Button>
        <Button variant="contained" onClick={submit} disabled={busy} data-testid="referral-action-confirm">
          {busy ? <CircularProgress size={18} /> : cfg.confirm}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * One referral in full: what was asked, where it stands, every step so far, and the buttons for what
 * can happen next. The server says which buttons apply (`actions`), so a nurse never sees "Sign".
 */
export default function ReferralDetailDialog({ referralId, open, onClose, onChanged, meta, me }) {
  const [ref, setRef] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [action, setAction] = useState(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    if (!referralId) return;
    setLoading(true);
    setError("");
    try {
      const res = await api.get(apiEndpoints.referral(referralId), { headers: await authHeader() });
      setRef(res.data);
    } catch (err) {
      setError(errorText(err, "Could not open this referral."));
    } finally {
      setLoading(false);
    }
  }, [referralId]);

  useEffect(() => {
    if (open) {
      setRef(null);
      load();
    }
  }, [open, load]);

  const changed = (updated) => {
    setRef(updated);
    setAction(null);
    if (onChanged) onChanged(updated);
  };

  const removeDraft = async () => {
    if (!window.confirm("Delete this draft referral?")) return;
    try {
      await api.delete(apiEndpoints.referral(ref.id), { headers: await authHeader() });
      toast.success("Draft deleted.");
      announceChange();
      if (onChanged) onChanged(null, ref.id);
      onClose();
    } catch (err) {
      toast.error(errorText(err, "Could not delete the draft."));
    }
  };

  const actions = ref ? ORDER.filter((a) => ref.actions.includes(a)) : [];
  const snap = ref?.clinical_snapshot || {};
  const allergies = snap.allergies || [];

  return (
    <>
      <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" data-testid="referral-detail">
        <DialogTitle sx={{ pb: 1 }}>
          {ref ? `${ref.specialty || "Referral"} — ${ref.patient_name}` : "Referral"}
          {ref && (
            <Stack direction="row" spacing={1} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
              <Chip size="small" color={STATUS_COLOR[ref.status]} label={ref.status_label} data-testid="referral-status" />
              <Chip size="small" variant="outlined" color={URGENCY_COLOR[ref.urgency]} label={ref.urgency_label} />
              {ref.overdue && <Chip size="small" color="error" label={overdueText(ref)} data-testid="referral-overdue" />}
            </Stack>
          )}
        </DialogTitle>
        <DialogContent dividers>
          {loading && <CircularProgress size={22} />}
          {error && <Alert severity="error">{error}</Alert>}
          {ref && (
            <Box>
              {ref.status_note && ["needs_info", "declined", "cancelled", "expired"].includes(ref.status) && (
                <Alert severity={ref.status === "needs_info" ? "warning" : "info"} sx={{ mb: 2 }} data-testid="referral-status-note">
                  {ref.status_label}: {ref.status_note}
                </Alert>
              )}
              <Row label="Send to">{ref.destination_name}</Row>
              {ref.destination_detail && (
                <Row label="Contact">
                  {[ref.destination_detail.phone && `Phone ${ref.destination_detail.phone}`, ref.destination_detail.fax && `Fax ${ref.destination_detail.fax}`, ref.destination_detail.address]
                    .filter(Boolean)
                    .join(" · ")}
                </Row>
              )}
              <Row label="Referring physician">{ref.referring_provider_name}</Row>
              <Row label="Reason">{ref.reason}</Row>
              <Row label="Question">{ref.clinical_question}</Row>
              <Row label="Diagnosis">{[ref.diagnosis_code, ref.diagnosis_text].filter(Boolean).join(" - ")}</Row>
              <Row label="Assigned to">{ref.assigned_to_name}</Row>
              <Row label="Signed">{ref.signed_at ? `${ref.signed_by_name}, ${fmtDateTime(ref.signed_at)}` : ""}</Row>
              <Row label="Appointment">
                {ref.scheduled_for ? `${fmtDateTime(ref.scheduled_for)}${ref.appointment_location ? ` · ${ref.appointment_location}` : ""}` : ""}
              </Row>
              <Row label="Seen">{fmtDateTime(ref.seen_at)}</Row>
              <Row label="Schedule by">{ref.schedule_due ? fmtDate(ref.schedule_due) : ""}</Row>
              <Row label="Report due">{ref.report_due ? fmtDate(ref.report_due) : ""}</Row>

              {ref.report_text && (
                <>
                  <Divider sx={{ my: 1.5 }} />
                  <Typography variant="subtitle2">Specialist's report ({fmtDateTime(ref.report_received_at)})</Typography>
                  <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", mt: 0.5 }} data-testid="referral-report">
                    {ref.report_text}
                  </Typography>
                </>
              )}

              {ref.signed_at && (
                <>
                  <Divider sx={{ my: 1.5 }} />
                  <Typography variant="subtitle2">Allergies sent with the referral</Typography>
                  <Typography variant="body2" data-testid="referral-allergies">
                    {allergies.length > 0
                      ? allergies.map((a) => `${a.substance}${a.reaction ? ` (${a.reaction})` : ""}`).join("; ")
                      : snap.no_known_allergies
                      ? "No known allergies"
                      : "None recorded"}
                  </Typography>
                </>
              )}

              <Divider sx={{ my: 1.5 }} />
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                History
              </Typography>
              <Box data-testid="referral-timeline">
                {(ref.events || []).map((e) => (
                  <Box key={e.id} sx={{ mb: 0.75 }} data-testid="referral-event">
                    <Typography variant="body2">
                      <strong>{EVENT_LABELS[e.type] || e.type}</strong> · {e.user || "System"} · {fmtDateTime(e.at)}
                    </Typography>
                    {e.detail?.note && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", whiteSpace: "pre-wrap" }}>
                        {e.detail.note}
                      </Typography>
                    )}
                  </Box>
                ))}
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ flexWrap: "wrap", gap: 0.5, justifyContent: "flex-start", px: 3 }}>
          {ref?.status === "draft" && (
            <>
              <Button onClick={() => setEditing(true)} data-testid="referral-edit">
                Edit draft
              </Button>
              <Button color="error" onClick={removeDraft} data-testid="referral-delete">
                Delete draft
              </Button>
            </>
          )}
          {actions.map((a) => (
            <Button
              key={a}
              variant={PRIMARY.has(a) ? "contained" : "outlined"}
              color={["cancel", "decline", "expire"].includes(a) ? "error" : "primary"}
              onClick={() => setAction(a)}
              data-testid={`referral-action-${a}`}
            >
              {meta?.action_labels?.[a] || ACTION_FORMS[a]?.title || a}
            </Button>
          ))}
          <Box sx={{ flex: 1 }} />
          <Button onClick={onClose}>Close window</Button>
        </DialogActions>
      </Dialog>

      {ref && action && <ActionDialog referral={ref} action={action} meta={meta} onClose={() => setAction(null)} onDone={changed} />}
      {ref && editing && (
        <ReferralFormDialog
          open
          referral={ref}
          meta={meta}
          me={me}
          onClose={() => setEditing(false)}
          onSaved={(updated) => {
            setEditing(false);
            load();
            if (onChanged) onChanged(updated);
          }}
        />
      )}
    </>
  );
}
