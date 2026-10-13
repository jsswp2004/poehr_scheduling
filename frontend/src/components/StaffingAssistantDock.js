import { useEffect, useRef, useState } from "react";
import {
  Box, Button, CircularProgress, Drawer, IconButton, InputBase, Paper, Tooltip, Typography,
} from "@mui/material";
import ChatIcon from "@mui/icons-material/Chat";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import SendIcon from "@mui/icons-material/Send";
import AddCommentOutlinedIcon from "@mui/icons-material/AddCommentOutlined";
import axios from "axios";
import { getAccessToken } from "../utils/tokenManager";
import { apiEndpoints, getAuthHeaders } from "../config/api";

/**
 * Right-docked, collapsible staffing assistant for the Staffing Center (managers only).
 * Collapsed it is a slim tab on the right edge; open it is a side panel that leaves the page usable.
 * The server decides what the signed-in user may see; the conversation is cleared on reload.
 *
 * Props: onNavigate(tabKey) - switches the Staffing Center tab for the quick-action buttons.
 */

// Screens the server may suggest, mapped to Staffing Center tabs. Anything else is ignored.
const ROUTE_TO_TAB = {
  "/(tabs)/calendar": "calendar",
  "/(tabs)/reports": "reports",
  "/(tabs)/timeoff": "timeoff",
  "/(tabs)/roster": "roster",
};

const QUICK = [
  "Who is working today?",
  "Is coverage met today?",
  "Any pending time-off requests?",
  "Who is unscheduled this week?",
];

const PANEL_WIDTH = 400;

const errorText = (e) => {
  const d = e?.response?.data;
  if (typeof d === "string" && d.length < 300) return d;
  if (d?.error) return String(d.error);
  if (d?.detail) return String(d.detail);
  return e?.message || "Something went wrong.";
};

function StaffingAssistantDock({ onNavigate }) {
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
        apiEndpoints.staffingAssistant,
        { message: q, conversation_id: convoId.current },
        { headers: getAuthHeaders(getAccessToken()), timeout: 45000 },
      );
      convoId.current = res.data.conversation_id;
      const actions = (res.data.actions || []).filter((a) => ROUTE_TO_TAB[a.route]).slice(0, 2);
      setMsgs((m) => [...m, { from: "assistant", text: res.data.answer, actions }]);
    } catch (e) {
      setMsgs((m) => [...m, { from: "assistant", text: errorText(e), failed: true }]);
    } finally {
      setBusy(false);
    }
  };

  const newChat = () => {
    if (busy) return;
    convoId.current = undefined;
    setMsgs([]);
  };

  const go = (route) => {
    const tab = ROUTE_TO_TAB[route];
    if (tab && onNavigate) onNavigate(tab);
  };

  return (
    <>
      {!open && (
        <Tooltip title="Open assistant" placement="left">
          <Button
            onClick={() => setOpen(true)}
            aria-label="Open assistant"
            sx={{
              position: "fixed", right: 0, top: "38%", zIndex: 1200, minWidth: 0, width: 36, height: 96,
              borderRadius: "14px 0 0 14px", flexDirection: "column", gap: 0.5,
              bgcolor: "primary.main", color: "#fff", boxShadow: 4,
              "&:hover": { bgcolor: "primary.dark" },
            }}
          >
            <ChatIcon fontSize="small" />
            <ChevronLeftIcon fontSize="small" />
          </Button>
        </Tooltip>
      )}

      <Drawer
        anchor="right"
        variant="persistent"
        open={open}
        PaperProps={{ sx: { width: { xs: "100%", sm: PANEL_WIDTH }, maxWidth: "100%" } }}
      >
        <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
          <Box sx={{ display: "flex", alignItems: "center", px: 1.5, py: 1, borderBottom: 1, borderColor: "divider" }}>
            <ChatIcon color="primary" fontSize="small" />
            <Typography variant="subtitle1" sx={{ flex: 1, ml: 1, fontWeight: 700 }}>Assistant</Typography>
            {msgs.length > 0 && (
              <Tooltip title="New chat">
                <IconButton size="small" onClick={newChat} aria-label="Start a new chat">
                  <AddCommentOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            <Tooltip title="Collapse">
              <IconButton size="small" onClick={() => setOpen(false)} aria-label="Collapse assistant">
                <ChevronRightIcon />
              </IconButton>
            </Tooltip>
          </Box>

          <Box sx={{ flex: 1, overflowY: "auto", p: 1.5 }}>
            {msgs.length === 0 && (
              <Box>
                <Typography variant="body2" sx={{ mb: 0.5 }}>
                  Ask about coverage, schedules, time off, and staffing.
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
                  I only show what your role allows. Please don&apos;t enter patient information.
                </Typography>
                {QUICK.map((q) => (
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
                  {!!m.actions?.length && (
                    <Box sx={{ mt: 0.5, display: "flex", gap: 0.75, flexWrap: "wrap" }}>
                      {m.actions.map((a) => (
                        <Button key={a.route} size="small" variant="outlined" onClick={() => go(a.route)} sx={{ borderRadius: 4, textTransform: "none" }}>
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
      </Drawer>
    </>
  );
}

export default StaffingAssistantDock;
