import { useEffect, useRef, useState } from "react";
import {
  Box, Button, CircularProgress, IconButton, InputBase, Paper, Tooltip, Typography,
} from "@mui/material";
import ChatIcon from "@mui/icons-material/Chat";
import RemoveIcon from "@mui/icons-material/Remove";
import SendIcon from "@mui/icons-material/Send";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import AddCommentOutlinedIcon from "@mui/icons-material/AddCommentOutlined";
import FloatingAssistant from "./FloatingAssistant";
import axios from "axios";
import { getAccessToken } from "../utils/tokenManager";
import { getAuthHeaders } from "../config/api";

/**
 * Right-docked, collapsible chat assistant. Collapsed it is a slim tab on the right edge; open it is a side
 * panel that leaves the page usable. The server decides what the signed-in user may see; the conversation is
 * cleared on reload.
 *
 * The assistant can PREPARE a change (a message to send, a contact to add). It shows as a confirmation card
 * and nothing happens until the user presses the confirm button; the server runs it, never the chat model.
 *
 * Used by the Communicator today (CommunicatorAssistantDock) and meant to be reused by other modules.
 * (The Staffing Center has its own older copy, StaffingAssistantDock.)
 *
 * Props:
 *   title          panel title and accessible name, e.g. "Communicator assistant"
 *   messageUrl     POST {message, conversation_id} -> {conversation_id, answer, actions, confirmations}
 *   actionUrl      (cardId, "confirm" | "cancel") => url
 *   quick          starter questions shown while the chat is empty
 *   intro, note    the two lines shown above the starter questions
 *   knownRoutes    route names this page understands; server buttons for any other route are dropped
 *   onNavigate     (route) => void, called when a server button is pressed
 *   changedEvent   optional window event name fired after a confirmed change, so the page can reload its data
 *   extraBody      optional object merged into every message request (e.g. {patient_id} for the open chart)
 */

const errorText = (e) => {
  const d = e?.response?.data;
  if (typeof d === "string" && d.length < 300) return d;
  if (d?.error) return String(d.error);
  if (d?.detail) return String(d.detail);
  return e?.message || "Something went wrong.";
};

function AssistantDock({
  title = "Assistant",
  messageUrl,
  actionUrl,
  quick = [],
  intro = "",
  note = "",
  knownRoutes = [],
  onNavigate,
  changedEvent,
  extraBody = null,
}) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const convoId = useRef(undefined);
  const endRef = useRef(null);

  useEffect(() => {
    if (open && endRef.current) endRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, busy, open]);

  const send = async (raw) => {
    const q = (raw || "").trim();
    if (!q || busy) return;
    setText("");
    setBusy(true);
    setMsgs((m) => [...m, { from: "me", text: q }]);
    try {
      const res = await axios.post(
        messageUrl,
        { ...(extraBody || {}), message: q, conversation_id: convoId.current },
        { headers: getAuthHeaders(getAccessToken()), timeout: 45000 },
      );
      convoId.current = res.data.conversation_id;
      const actions = (res.data.actions || []).filter((a) => knownRoutes.includes(a.route)).slice(0, 2);
      const cards = (res.data.confirmations || []).map((c) => ({ ...c, state: "waiting" }));
      setMsgs((m) => [...m, { from: "assistant", text: res.data.answer, actions, cards }]);
    } catch (e) {
      setMsgs((m) => [...m, { from: "assistant", text: errorText(e), failed: true }]);
    } finally {
      setBusy(false);
    }
  };

  // Update one confirmation card in place.
  const setCard = (cardId, patch) =>
    setMsgs((all) =>
      all.map((m) =>
        m.cards ? { ...m, cards: m.cards.map((c) => (c.id === cardId ? { ...c, ...patch } : c)) } : m,
      ),
    );

  const decide = async (card, verb) => {
    if (card.state !== "waiting") return;
    setCard(card.id, { state: "working" });
    try {
      const res = await axios.post(
        actionUrl(card.id, verb),
        {},
        { headers: getAuthHeaders(getAccessToken()), timeout: 120000 }, // a big send can take a while
      );
      if (verb === "confirm") {
        setCard(card.id, { state: "done", result: res.data.message });
        if (changedEvent) window.dispatchEvent(new Event(changedEvent));
      } else {
        setCard(card.id, { state: "cancelled", result: res.data.message });
      }
    } catch (e) {
      if (verb === "confirm" && !e?.response) {
        // No answer from the server (timeout or dropped connection): it may well have gone through.
        setCard(card.id, {
          state: "unknown",
          result: "No response from the server. It may have gone through, so check the message log before trying again.",
        });
      } else {
        setCard(card.id, { state: "failed", result: errorText(e) });
      }
    }
  };

  const newChat = () => {
    if (busy) return;
    convoId.current = undefined;
    setMsgs([]);
  };

  return (
    <>
      <FloatingAssistant open={open} onOpen={() => setOpen(true)} onClose={() => setOpen(false)} label={title}>
        {({ dragProps, close }) => (
          <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <Box {...dragProps} sx={{ display: "flex", alignItems: "center", px: 1.5, py: 1, borderBottom: 1, borderColor: "divider" }}>
              <ChatIcon color="primary" fontSize="small" />
              <Typography variant="subtitle1" sx={{ flex: 1, ml: 1, fontWeight: 700 }}>{title}</Typography>
              {msgs.length > 0 && (
                <Tooltip title="New chat">
                  <IconButton size="small" onClick={newChat} aria-label="Start a new chat">
                    <AddCommentOutlinedIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              <Tooltip title="Minimize">
                <IconButton size="small" onClick={() => close()} aria-label="Collapse assistant">
                  <RemoveIcon />
                </IconButton>
              </Tooltip>
            </Box>

            <Box sx={{ flex: 1, overflowY: "auto", p: 1.5 }}>
              {msgs.length === 0 && (
                <Box>
                  {!!intro && <Typography variant="body2" sx={{ mb: 0.5 }}>{intro}</Typography>}
                  {!!note && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
                      {note}
                    </Typography>
                  )}
                  {quick.map((q) => (
                    <Button
                      key={q}
                      variant="outlined"
                      size="small"
                      onClick={() => send(q)}
                      sx={{ display: "flex", mb: 1, borderRadius: 4, textTransform: "none", justifyContent: "flex-start" }}
                    >
                      {q}
                    </Button>
                  ))}
                </Box>
              )}

              {msgs.map((m, i) => {
                const me = m.from === "me";
                return (
                  <Box key={i} sx={{ display: "flex", flexDirection: "column", alignItems: me ? "flex-end" : "flex-start", mb: 1.25 }}>
                    <Paper
                      elevation={0}
                      sx={{
                        maxWidth: "90%", px: 1.5, py: 1, borderRadius: 3, whiteSpace: "pre-wrap", wordBreak: "break-word",
                        bgcolor: me ? "primary.main" : m.failed ? "error.light" : "action.hover",
                        color: me ? "#fff" : m.failed ? "error.contrastText" : "text.primary",
                      }}
                    >
                      <Typography variant="body2" component="div">{m.text}</Typography>
                    </Paper>
                    {(m.cards || []).map((c) => (
                      <Paper
                        key={c.id}
                        variant="outlined"
                        sx={{ mt: 0.75, p: 1.25, borderRadius: 3, width: "100%", borderColor: "primary.main" }}
                      >
                        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{c.title}</Typography>
                        <Typography variant="body2" sx={{ mt: 0.25 }}>{c.summary}</Typography>
                        {!!c.detail && (
                          <Box
                            sx={{
                              mt: 0.75, p: 1, borderRadius: 2, bgcolor: "action.hover", maxHeight: 140, overflowY: "auto",
                              whiteSpace: "pre-wrap", wordBreak: "break-word",
                            }}
                          >
                            <Typography variant="body2">{c.detail}</Typography>
                          </Box>
                        )}
                        {c.state === "waiting" || c.state === "working" ? (
                          <>
                            {!!c.warning && (
                              <Typography variant="caption" color="warning.dark" sx={{ display: "block", mt: 0.75 }}>
                                {c.warning}
                              </Typography>
                            )}
                            <Box sx={{ mt: 1, display: "flex", gap: 1, justifyContent: "flex-end" }}>
                              <Button size="small" disabled={c.state === "working"} onClick={() => decide(c, "cancel")} sx={{ textTransform: "none" }}>
                                Cancel
                              </Button>
                              <Button
                                size="small"
                                variant="contained"
                                disabled={c.state === "working"}
                                onClick={() => decide(c, "confirm")}
                                sx={{ textTransform: "none", borderRadius: 4 }}
                              >
                                {c.state === "working" ? "Working…" : c.confirm_label}
                              </Button>
                            </Box>
                          </>
                        ) : (
                          <Box sx={{ mt: 0.75, display: "flex", alignItems: "flex-start", gap: 0.75 }}>
                            {c.state === "done" && <CheckCircleOutlineIcon fontSize="small" color="success" />}
                            <Typography
                              variant="body2"
                              role="status"
                              color={
                                c.state === "failed" ? "error"
                                  : c.state === "done" ? "success.main"
                                  : c.state === "unknown" ? "warning.dark"
                                  : "text.secondary"
                              }
                            >
                              {c.result}
                            </Typography>
                          </Box>
                        )}
                      </Paper>
                    ))}
                    {!!m.actions?.length && (
                      <Box sx={{ mt: 0.5, display: "flex", gap: 0.75, flexWrap: "wrap" }}>
                        {m.actions.map((a) => (
                          <Button
                            key={a.route}
                            size="small"
                            variant="outlined"
                            onClick={() => onNavigate && onNavigate(a.route)}
                            sx={{ borderRadius: 4, textTransform: "none" }}
                          >
                            {a.label}
                          </Button>
                        ))}
                      </Box>
                    )}
                  </Box>
                );
              })}

              {busy && (
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, color: "text.secondary" }}>
                  <CircularProgress size={16} />
                  <Typography variant="body2">Checking…</Typography>
                </Box>
              )}
              <div ref={endRef} />
            </Box>

            <Box sx={{ display: "flex", alignItems: "flex-end", gap: 1, p: 1.25, borderTop: 1, borderColor: "divider" }}>
              <InputBase
                multiline
                maxRows={4}
                fullWidth
                placeholder="Ask a question"
                value={text}
                disabled={busy}
                inputProps={{ maxLength: 1000, "aria-label": "Ask a question" }}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(text);
                  }
                }}
                sx={{ border: 1, borderColor: "divider", borderRadius: 4, px: 1.5, py: 0.75 }}
              />
              <IconButton color="primary" onClick={() => send(text)} disabled={busy || !text.trim()} aria-label="Send">
                <SendIcon />
              </IconButton>
            </Box>
          </Box>
        )}
      </FloatingAssistant>
    </>
  );
}

export default AssistantDock;
