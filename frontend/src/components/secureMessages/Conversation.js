import { useMemo, useState } from "react";
import { Alert, Box, Button, Chip, CircularProgress, IconButton, Menu, MenuItem, Paper, Typography } from "@mui/material";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import GroupIcon from "@mui/icons-material/Group";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import Composer from "./Composer";
import MessageImage from "./MessageImage";
import MembersDialog from "./MembersDialog";
import useConversation from "../../hooks/secureMessages/useConversation";
import { CARE_LABEL } from "./secureApi";

const clock = (iso) => new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function Bubble({ m, showCare, seenBy, onReply, onRetract }) {
  const [anchor, setAnchor] = useState(null);
  if (m.kind === "system") {
    return (
      <Typography variant="caption" color="text.secondary" sx={{ textAlign: "center", display: "block", my: 1 }} data-testid={`message-${m.id}`}>
        {m.body}
      </Typography>
    );
  }
  return (
    <Box sx={{ display: "flex", flexDirection: "column", alignItems: m.mine ? "flex-end" : "flex-start", my: 0.75 }} data-testid={`message-${m.id}`}>
      {showCare && (
        <Chip size="small" variant="outlined" label={`${CARE_LABEL[m.care_setting] || m.care_setting} visit`} sx={{ mb: 0.5 }} />
      )}
      <Typography variant="caption" color="text.secondary">
        {m.mine ? "You" : m.sender.name} · {clock(m.created_at)}
      </Typography>
      <Paper
        elevation={0}
        sx={{
          px: 1.5, py: 1, maxWidth: "85%", bgcolor: m.mine ? "primary.main" : "action.hover", color: m.mine ? "primary.contrastText" : "text.primary",
          border: m.priority === "urgent" && !m.retracted ? "2px solid" : "none", borderColor: "error.main", display: "flex", gap: 0.5, alignItems: "flex-start",
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          {m.priority === "urgent" && !m.retracted && <Chip size="small" color="error" label="Urgent" sx={{ mb: 0.5 }} />}
          {m.reply_to && (
            <Box sx={{ borderLeft: "3px solid", borderColor: "divider", pl: 1, mb: 0.5, opacity: 0.85 }}>
              <Typography variant="caption" component="div">
                {m.reply_to.sender}: {m.reply_to.preview}
              </Typography>
            </Box>
          )}
          {m.retracted ? (
            <Typography variant="body2" component="div" sx={{ fontStyle: "italic" }}>
              Message retracted
            </Typography>
          ) : (
            <>
              {m.body && (
                <Typography variant="body2" component="div" sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                  {m.body}
                </Typography>
              )}
              {m.attachments.map((a) => (
                <MessageImage key={a.id} attachment={a} />
              ))}
            </>
          )}
        </Box>
        {!m.retracted && (
          <>
            <IconButton size="small" aria-label="Message options" onClick={(e) => setAnchor(e.currentTarget)} sx={{ color: "inherit", p: 0.25 }}>
              <MoreVertIcon fontSize="small" />
            </IconButton>
            <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
              <MenuItem
                onClick={() => {
                  setAnchor(null);
                  onReply(m);
                }}
              >
                Reply
              </MenuItem>
              {m.mine && (
                <MenuItem
                  onClick={() => {
                    setAnchor(null);
                    onRetract(m);
                  }}
                >
                  Retract
                </MenuItem>
              )}
            </Menu>
          </>
        )}
      </Paper>
      {seenBy && seenBy.length > 0 && (
        <Typography variant="caption" color="text.secondary" data-testid={`seen-${m.id}`}>
          Seen by {seenBy.join(", ")}
        </Typography>
      )}
    </Box>
  );
}

export default function Conversation({ threadId, onBack, onLeft }) {
  const { thread, messages, hasOlder, loading, error, sending, sendError, send, retract, loadOlder, reload } = useConversation(threadId);
  const [replyTo, setReplyTo] = useState(null);
  const [members, setMembers] = useState(false);
  const me = thread ? thread.me : null;

  // "Seen by" goes under the newest message of mine that others have read.
  const seen = useMemo(() => {
    const out = {};
    if (!thread || !thread.members) return out;
    const mine = [...messages].reverse().find((m) => m.mine && m.kind === "text" && !m.retracted);
    if (!mine) return out;
    out[mine.id] = thread.members.filter((x) => x.id !== me && (x.last_read || 0) >= mine.id).map((x) => x.name);
    return out;
  }, [messages, thread, me]);

  if (!threadId) {
    return (
      <Box sx={{ p: 4, textAlign: "center" }}>
        <Typography color="text.secondary">Choose a conversation, or start a new one.</Typography>
      </Box>
    );
  }
  if (loading && !thread) return <Box sx={{ p: 4, textAlign: "center" }}><CircularProgress size={28} /></Box>;
  if (error && !thread) return <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, p: 1.5, borderBottom: 1, borderColor: "divider" }}>
        {onBack && (
          <IconButton aria-label="Back to conversations" onClick={onBack} size="small">
            <ArrowBackIcon />
          </IconButton>
        )}
        <Typography variant="h6" noWrap sx={{ flexGrow: 1 }} data-testid="conversation-title">
          {thread ? thread.title : ""}
        </Typography>
        <Button size="small" startIcon={<GroupIcon />} onClick={() => setMembers(true)} data-testid="open-members">
          {thread && thread.members ? thread.members.length : ""}
        </Button>
      </Box>
      {thread && thread.kind === "patient" && (
        <Alert severity="info" sx={{ borderRadius: 0 }}>
          Everyone who cares for this patient can read this conversation, in any setting. Reads and sends are logged.
        </Alert>
      )}
      {error && <Alert severity="warning" sx={{ borderRadius: 0 }}>{error}</Alert>}
      <Box sx={{ flexGrow: 1, overflowY: "auto", p: 1.5, minHeight: 0 }} data-testid="message-scroll">
        {hasOlder && (
          <Box sx={{ textAlign: "center" }}>
            <Button size="small" onClick={loadOlder} data-testid="load-older">
              Load earlier messages
            </Button>
          </Box>
        )}
        {!messages.length && !loading && <Typography color="text.secondary" sx={{ textAlign: "center", mt: 3 }}>No messages yet.</Typography>}
        {messages.map((m, i) => {
          const prev = messages.slice(0, i).reverse().find((x) => x.kind === "text");
          const showCare = m.kind === "text" && !!m.care_setting && thread && thread.kind === "patient" && (!prev || prev.care_setting !== m.care_setting);
          return <Bubble key={m.id} m={m} showCare={showCare} seenBy={seen[m.id]} onReply={setReplyTo} onRetract={(x) => retract(x.id)} />;
        })}
      </Box>
      <Composer
        onSend={async (payload) => {
          const ok = await send(payload);
          if (ok) setReplyTo(null);
          return ok;
        }}
        sending={sending}
        error={sendError}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
      />
      <MembersDialog
        open={members}
        thread={thread}
        meId={me}
        onClose={() => setMembers(false)}
        onChanged={(left) => {
          if (left) {
            setMembers(false);
            if (onLeft) onLeft();
          } else reload();
        }}
      />
    </Box>
  );
}
