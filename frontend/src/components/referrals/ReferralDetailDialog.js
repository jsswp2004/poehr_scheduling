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
import ReferralDeliveryFields, { deliveryPayload, initialDelivery } from "./ReferralDeliveryFields";
import {
  ACTION_FORMS,
  LINK_ACTIONS,
  STATUS_COLOR,
  URGENCY_COLOR,
  announceChange,
  authHeader,
  deliverySummary,
  errorText,
  fmtDate,
  fmtDateTime,
  openAttachment,
  overdueText,
  revokeLink,
  runAction,
  sendLink,
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
  link_sent: "Secure link sent",
  link_opened: "Specialist opened the secure link",
  link_revoked: "Secure link turned off",
  reply_notified: "Messages sent about the reply",
};

const LINK_STATE = {
  active: { label: "Active", color: "success" },
  turned_off: { label: "Turned off", color: "default" },
  expired: { label: "Expired", color: "warning" },
  closed: { label: "Ended with the referral", color: "default" },
};

const fmtSize = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/** Say in a toast what happened to the link the step was asked to send. */
function announceDelivery(delivery) {
  if (!delivery) return;
  if (delivery.error) return toast.error(`Signed, but the secure link was not sent: ${delivery.error}`);
  const lines = deliverySummary(delivery.deliveries);
  const failed = (delivery.deliveries || []).some((d) => !d.sent);
  if (failed) toast.error(`Secure link: ${lines.join("; ")}. You can send it again from the referral.`, { autoClose: 6000 });
  else if (lines.length) toast.success(`Secure link sent. ${lines.join("; ")}.`);
}

/** Send (or send again) the secure link, or copy it to share another way. */
function SendLinkDialog({ referral, onClose, onDone }) {
  const [delivery, setDelivery] = useState(() => {
    const start = initialDelivery(referral.destination_detail);
    return start.mode === "none" ? { ...start, mode: "sms" } : start;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  const submit = async () => {
    setError("");
    const { payload, error: missing } = deliveryPayload(delivery);
    if (missing) return setError(missing);
    if (!payload) return setError("Choose text, email, both, or copy the link.");
    setBusy(true);
    try {
      const result = await sendLink(referral.id, payload);
      announceDelivery({ deliveries: result.deliveries });
      announceChange();
      if (result.url) {
        setCopied(result.url);
        onDone(result.referral, { keepOpen: true });
      } else {
        onDone(result.referral);
      }
    } catch (err) {
      setError(errorText(err, "The link could not be sent."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="sm" data-testid="referral-send-link-dialog">
      <DialogTitle>{referral.link ? "Send the secure link again" : "Send the secure link"}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          {error && <Alert severity="error" data-testid="referral-send-link-error">{error}</Alert>}
          {referral.link?.state === "active" && (
            <Alert severity="warning">Sending a new link turns the earlier one off. The specialist will need to use the new one.</Alert>
          )}
          {copied ? (
            <>
              <Alert severity="success">Here is the new link. Anyone who has it can open the referral, so share it carefully.</Alert>
              <TextField size="small" value={copied} InputProps={{ readOnly: true }} inputProps={{ "data-testid": "referral-copied-link" }} onFocus={(e) => e.target.select()} />
              <Button
                variant="outlined"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(copied);
                    toast.success("Link copied.");
                  } catch {
                    toast.error("Select the link and copy it.");
                  }
                }}
              >
                Copy to clipboard
              </Button>
            </>
          ) : (
            <ReferralDeliveryFields value={delivery} onChange={setDelivery} allowCopy noneLabel="Cancel" />
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          {copied ? "Done" : "Back"}
        </Button>
        {!copied && (
          <Button variant="contained" onClick={submit} disabled={busy || delivery.mode === "none"} data-testid="referral-send-link-confirm">
            {busy ? <CircularProgress size={18} /> : delivery.mode === "copy" ? "Make the link" : "Send"}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

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
  const [delivery, setDelivery] = useState(() => initialDelivery(referral.destination_detail));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canSendLink = LINK_ACTIONS.includes(action);

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
    if (canSendLink) {
      const { payload, error: missing } = deliveryPayload(delivery);
      if (missing) return setError(missing);
      if (payload) body.delivery = payload;
    }
    setBusy(true);
    try {
      const updated = await runAction(referral.id, action, body);
      toast.success(`${cfg.title}: done.`);
      announceDelivery(updated.delivery);
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
          {canSendLink && <ReferralDeliveryFields value={delivery} onChange={setDelivery} noneLabel="Not now" />}
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
  const [linkDialog, setLinkDialog] = useState(false);

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

  const turnLinkOff = async () => {
    if (!window.confirm("Turn the secure link off? The specialist will no longer be able to open it.")) return;
    try {
      const updated = await revokeLink(ref.id);
      toast.success("Secure link turned off.");
      announceChange();
      changed(updated);
    } catch (err) {
      toast.error(errorText(err, "Could not turn the link off."));
    }
  };

  const openFile = async (attachment) => {
    try {
      await openAttachment(ref.id, attachment);
    } catch (err) {
      toast.error(errorText(err, "Could not open that file."));
    }
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

              {(ref.link || ref.can_send_link) && (
                <>
                  <Divider sx={{ my: 1.5 }} />
                  <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                    Secure link to the specialist
                  </Typography>
                  {ref.link ? (
                    <Box data-testid="referral-link">
                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                        <Chip
                          size="small"
                          color={LINK_STATE[ref.link.state]?.color || "default"}
                          label={LINK_STATE[ref.link.state]?.label || ref.link.state}
                          data-testid="referral-link-state"
                        />
                        {ref.link.state === "active" && (
                          <Typography variant="body2" color="text.secondary">
                            works until {fmtDate(ref.link.expires_at)}
                          </Typography>
                        )}
                      </Stack>
                      {deliverySummary(ref.link.deliveries).map((line) => (
                        <Typography key={line} variant="body2" data-testid="referral-link-delivery">
                          {line}
                        </Typography>
                      ))}
                      <Typography variant="body2" color="text.secondary" data-testid="referral-link-opened">
                        {ref.link.first_opened_at
                          ? `Opened ${fmtDateTime(ref.link.first_opened_at)}${ref.link.open_count > 1 ? ` (${ref.link.open_count} times)` : ""}${ref.link.verified ? ", code confirmed" : ""}`
                          : "Not opened yet"}
                      </Typography>
                    </Box>
                  ) : (
                    <Typography variant="body2" color="text.secondary" data-testid="referral-link-none">
                      No secure link has been sent. Without one, the specialist's answers are entered by hand here.
                    </Typography>
                  )}
                  {ref.can_send_link && (
                    <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                      <Button size="small" variant="outlined" onClick={() => setLinkDialog(true)} data-testid="referral-send-link">
                        {ref.link ? "Send link again" : "Send secure link"}
                      </Button>
                      {ref.link?.state === "active" && (
                        <Button size="small" color="error" onClick={turnLinkOff} data-testid="referral-revoke-link">
                          Turn link off
                        </Button>
                      )}
                    </Stack>
                  )}
                </>
              )}

              {(ref.attachments || []).length > 0 && (
                <>
                  <Divider sx={{ my: 1.5 }} />
                  <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                    Files from the specialist
                  </Typography>
                  {ref.attachments.map((a) => (
                    <Stack key={a.id} direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }} data-testid="referral-attachment">
                      <Button size="small" onClick={() => openFile(a)} sx={{ textTransform: "none" }}>
                        {a.file_name}
                      </Button>
                      <Typography variant="caption" color="text.secondary">
                        {fmtSize(a.size)}
                      </Typography>
                      <Chip
                        size="small"
                        variant="outlined"
                        color={a.review_status === "reviewed" ? "success" : "warning"}
                        label={a.review_status === "reviewed" ? "Reviewed" : "Not yet reviewed"}
                      />
                    </Stack>
                  ))}
                  <Typography variant="caption" color="text.secondary">
                    Filed on the patient's chart as an outside document. A person on the care team reviews it under Results.
                  </Typography>
                </>
              )}

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
                      <strong>{EVENT_LABELS[e.type] || e.type}</strong> · {e.user || (e.detail?.via === "secure_link" ? "Specialist (secure link)" : "System")} · {fmtDateTime(e.at)}
                    </Typography>
                    {e.type === "reply_notified" && Array.isArray(e.detail?.results) && (
                      <Typography variant="caption" color="text.secondary" display="block">
                        {e.detail.results
                          .map((r) => `${r.to === "clinic" ? "Clinic" : "Specialist"} ${r.channel === "sms" ? "text" : "email"}: ${r.sent ? "sent" : "not sent"}`)
                          .join(" · ")}
                      </Typography>
                    )}
                    {e.detail?.files?.length > 0 && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                        Attached: {e.detail.files.join(", ")}
                      </Typography>
                    )}
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
      {ref && linkDialog && (
        <SendLinkDialog
          referral={ref}
          onClose={() => setLinkDialog(false)}
          onDone={(updated, opts) => {
            setRef(updated);
            if (onChanged) onChanged(updated);
            if (!opts?.keepOpen) setLinkDialog(false);
          }}
        />
      )}
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
