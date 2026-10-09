import { useEffect, useState } from "react";
import { Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Typography } from "@mui/material";
import { secure, errorText } from "./secureApi";

const stamp = (iso) => (iso ? new Date(iso).toLocaleString() : "");

/** A whole conversation for compliance review, retracted messages included. Opening it is logged by the server. */
export default function AuditTranscriptDialog({ threadId, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setData(null);
    setError("");
    if (!threadId) return undefined;
    let alive = true;
    secure
      .auditThread(threadId)
      .then((d) => alive && setData(d))
      .catch((err) => alive && setError(errorText(err, "Could not open this conversation.")));
    return () => {
      alive = false;
    };
  }, [threadId]);

  return (
    <Dialog open={!!threadId} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{data ? data.thread.title : "Conversation"}</DialogTitle>
      <DialogContent dividers>
        <Alert severity="info" sx={{ mb: 2 }}>
          Opening this transcript is recorded in the audit log under your name.
        </Alert>
        {error && <Alert severity="error">{error}</Alert>}
        {!data && !error && (
          <Box sx={{ textAlign: "center", p: 3 }}>
            <CircularProgress size={28} />
          </Box>
        )}
        {data && (
          <>
            <Typography variant="subtitle2">People</Typography>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mb: 2 }} data-testid="transcript-members">
              {data.thread.members.map((m) => (
                <Chip
                  key={m.id}
                  size="small"
                  variant={m.left_at ? "outlined" : "filled"}
                  label={`${m.name} (${m.role}) · joined ${stamp(m.joined_at)}${m.left_at ? ` · left ${stamp(m.left_at)}` : ""}`}
                />
              ))}
            </Box>
            <Divider sx={{ mb: 1 }} />
            {data.messages.length === 0 && <Typography color="text.secondary">No messages.</Typography>}
            {data.messages.map((m) => (
              <Box key={m.id} sx={{ py: 0.75 }} data-testid={`transcript-message-${m.id}`}>
                <Typography variant="caption" color="text.secondary" component="div">
                  {m.sender.name} ({m.sender.role}) · {stamp(m.created_at)}
                  {m.priority === "urgent" ? " · urgent" : ""}
                  {m.care_setting ? ` · ${m.care_setting}` : ""}
                </Typography>
                {m.body && (
                  <Typography variant="body2" component="div" sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                    {m.body}
                  </Typography>
                )}
                {m.attachments.length > 0 && (
                  <Typography variant="caption" component="div">
                    Pictures: {m.attachments.map((a) => a.name).join(", ")}
                  </Typography>
                )}
                {m.retracted && (
                  <Typography variant="caption" color="error" component="div">
                    Retracted by {m.retracted_by || "the sender"} on {stamp(m.retracted_at)}
                    {m.retract_reason ? `: ${m.retract_reason}` : ""}
                  </Typography>
                )}
              </Box>
            ))}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
