import { useState } from "react";
import { Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Paper, Stack, TextField, Typography } from "@mui/material";
import { apiEndpoints } from "../../config/api";
import { toast } from "../SimpleToast";
import { badgeFor, chartTabFor, fullWhen, inboxPost, notePost, announceChange } from "./inboxHelpers";

const SOAP = [
  ["subjective", "Subjective"],
  ["objective", "Objective"],
  ["assessment", "Assessment"],
  ["plan", "Plan"],
];

function PatientCard({ patient, label, onOpen }) {
  if (!patient) return null;
  return (
    <Paper variant="outlined" sx={{ p: 1.5, display: "flex", alignItems: "center", gap: 2, bgcolor: "action.hover" }}>
      <Box sx={{ flexGrow: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          {patient.name}
        </Typography>
      </Box>
      <Button size="small" onClick={onOpen} data-testid="inbox-open-chart">
        {label}
      </Button>
    </Paper>
  );
}

function NoteExcerpt({ note }) {
  if (!note) return null;
  const parts = SOAP.filter(([k]) => note[k]);
  if (!parts.length) return null;
  return (
    <Stack spacing={1}>
      {parts.map(([k, label]) => (
        <Box key={k}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: "0.04em" }}>
            {label.toUpperCase()}
          </Typography>
          <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
            {note[k]}
          </Typography>
        </Box>
      ))}
    </Stack>
  );
}

// The right-hand pane: what the chosen item says and what can be done with it.
export default function ReadingPane({ item, detail, onChanged, onForward, onOpenChart }) {
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [comment, setComment] = useState("");

  if (!item || !detail) {
    return (
      <Box sx={{ p: 4, color: "text.secondary" }} data-testid="inbox-empty-pane">
        <Typography variant="body1">Choose an item to read it.</Typography>
      </Box>
    );
  }

  const badge = badgeFor(item);
  const patient = detail.patient;
  const run = async (fn, done) => {
    setBusy(true);
    try {
      await fn();
      if (done) toast.success(done);
      announceChange();
      await onChanged();
      return true;
    } catch (err) {
      toast.error(err?.response?.data?.detail || "That did not go through.");
      return false;
    } finally {
      setBusy(false);
    }
  };
  const toggleDone = () => run(() => inboxPost("done/", { key: item.key, done: !item.done }), item.done ? "Moved back to your inbox." : "Marked done.");
  const markUnread = () => run(() => inboxPost("read/", { key: item.key, read: false }), "Marked unread.");
  const sendReply = async () => {
    if (await run(() => inboxPost(`messages/${item.key.split(":")[1]}/reply/`, { body: reply.trim() }), "Reply sent.")) setReply("");
  };
  const openChart = () => patient && onOpenChart({ user_id: patient.id, full_name: patient.name }, chartTabFor(item));

  const request = detail.request;
  const noteId = detail.note && detail.note.id;
  const sendReturn = async () => {
    if (await run(() => notePost(apiEndpoints.clinicalNoteReturnCosign(noteId), { comment: comment.trim() }), "Note returned with comments.")) {
      setReturnOpen(false);
      setComment("");
    }
  };

  return (
    <Box sx={{ p: 3 }} data-testid="inbox-reading-pane">
      <Stack spacing={2}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Chip size="small" label={badge.label} color={badge.color} />
          {item.overdue && <Chip size="small" label="Overdue" color="error" />}
          <Typography variant="body2" color="text.secondary">
            {fullWhen(item.at)}
          </Typography>
        </Stack>
        <Typography variant="h5" component="h2">
          {detail.title}
        </Typography>

        {detail.kind === "message" && (
          <>
            <Typography variant="body2" color="text.secondary">
              {(detail.people || []).join(", ")}
            </Typography>
            <PatientCard patient={patient} label="Open chart" onOpen={openChart} />
            <Stack spacing={1.5} divider={<Divider flexItem />} data-testid="inbox-thread">
              {detail.messages.map((m) => (
                <Box key={m.id}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {m.from_me ? "You" : m.from_name}{" "}
                    <Typography component="span" variant="caption" color="text.secondary">
                      {fullWhen(m.at)}
                    </Typography>
                  </Typography>
                  <Typography variant="body1" sx={{ whiteSpace: "pre-wrap" }}>
                    {m.body}
                  </Typography>
                </Box>
              ))}
            </Stack>
            <TextField label="Reply" value={reply} onChange={(e) => setReply(e.target.value)} multiline minRows={3} fullWidth />
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Button variant="contained" onClick={sendReply} disabled={busy || !reply.trim()}>
                Send reply
              </Button>
              <Button onClick={() => onForward(detail)} disabled={busy}>
                Forward
              </Button>
              <Button onClick={toggleDone} disabled={busy}>
                {item.done ? "Move back to inbox" : "Mark done"}
              </Button>
            </Stack>
          </>
        )}

        {detail.kind === "alert" && (
          <>
            <PatientCard patient={patient} label={chartTabFor(item) === "results" ? "Open results" : "Open chart"} onOpen={openChart} />
            <Typography variant="body1" sx={{ whiteSpace: "pre-wrap" }} data-testid="inbox-alert-body">
              {detail.body}
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button variant="contained" color={item.severity === "critical" ? "error" : "primary"} onClick={toggleDone} disabled={busy}>
                {item.done ? "Move back to inbox" : item.subtype === "notice" ? "Mark done" : "Acknowledge"}
              </Button>
            </Stack>
          </>
        )}

        {(detail.kind === "sign" || detail.kind === "cosign") && (
          <>
            <PatientCard patient={patient} label={detail.subtype === "order" ? "Open orders" : "Open full note"} onOpen={openChart} />
            {request && (
              <Typography variant="body2">
                {item.sent ? `You asked ${request.to_name} to co-sign` : `${request.from_name} asked you to co-sign`}
                {request.message ? `: “${request.message}”` : "."}
                {request.due_at ? ` Needed by ${fullWhen(request.due_at)}.` : ""}
                {request.status !== "pending" ? ` (${request.status})` : ""}
              </Typography>
            )}
            {request && request.comment && <Typography variant="body2">Comment: {request.comment}</Typography>}
            <NoteExcerpt note={detail.note} />
            {detail.order && (
              <Typography variant="body2">
                {detail.order.priority} priority · {detail.order.status.replace("_", " ")}
                {detail.order.indication ? ` · ${detail.order.indication}` : ""}
              </Typography>
            )}
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {detail.kind === "cosign" && detail.subtype === "note" && request && request.status === "pending" && !item.sent && (
                <>
                  <Button variant="contained" color="success" disabled={busy} onClick={() => run(() => notePost(apiEndpoints.clinicalNoteCosign(noteId)), "Note co-signed.")}>
                    Co-sign
                  </Button>
                  <Button variant="outlined" disabled={busy} onClick={() => setReturnOpen(true)}>
                    Return with comments
                  </Button>
                </>
              )}
              <Button onClick={openChart} disabled={!patient}>
                {detail.subtype === "order" ? "Open orders" : "Open full note"}
              </Button>
            </Stack>
          </>
        )}

        {(item.kind === "message" || item.kind === "alert" || (item.kind === "cosign" && !item.sent)) && (
          <Box>
            <Button size="small" onClick={markUnread} disabled={busy}>
              Mark unread
            </Button>
          </Box>
        )}
      </Stack>

      <Dialog open={returnOpen} onClose={() => (busy ? null : setReturnOpen(false))} fullWidth maxWidth="sm">
        <DialogTitle>Return with comments</DialogTitle>
        <DialogContent>
          <TextField label="What needs to change" value={comment} onChange={(e) => setComment(e.target.value)} multiline minRows={3} fullWidth required sx={{ mt: 1 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReturnOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="contained" onClick={sendReturn} disabled={busy || !comment.trim()}>
            Return note
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
