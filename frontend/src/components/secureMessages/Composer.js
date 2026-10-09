import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Box, Chip, IconButton, Stack, TextField, Tooltip, Typography } from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import PriorityHighIcon from "@mui/icons-material/PriorityHigh";
import CloseIcon from "@mui/icons-material/Close";
import { MAX_BODY, MAX_IMAGES, MAX_UPLOAD_MB } from "./secureApi";

/** Message box: text, up to four pictures (shrunk by the server to 1 MB each), an urgent flag, and a reply. */
export default function Composer({ onSend, sending, error, replyTo, onCancelReply, disabled }) {
  const [text, setText] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [files, setFiles] = useState([]);
  const [problem, setProblem] = useState("");
  const input = useRef(null);

  const previews = useMemo(() => files.map((f) => ({ file: f, url: URL.createObjectURL(f) })), [files]);
  useEffect(() => () => previews.forEach((p) => URL.revokeObjectURL(p.url)), [previews]);

  const addFiles = (list) => {
    const picked = Array.from(list || []);
    if (input.current) input.current.value = "";
    setProblem("");
    const images = picked.filter((f) => f.type.startsWith("image/"));
    if (images.length !== picked.length) setProblem("Only pictures can be attached.");
    const tooBig = images.find((f) => f.size > MAX_UPLOAD_MB * 1024 * 1024);
    if (tooBig) {
      setProblem(`"${tooBig.name}" is larger than ${MAX_UPLOAD_MB} MB.`);
      return;
    }
    setFiles((cur) => {
      const next = [...cur, ...images];
      if (next.length > MAX_IMAGES) setProblem(`You can attach up to ${MAX_IMAGES} pictures.`);
      return next.slice(0, MAX_IMAGES);
    });
  };

  const canSend = !disabled && !sending && (text.trim().length > 0 || files.length > 0) && text.length <= MAX_BODY;

  const submit = async () => {
    if (!canSend) return;
    const ok = await onSend({ body: text.trim(), priority: urgent ? "urgent" : "routine", replyTo: replyTo ? replyTo.id : null, files });
    if (ok) {
      setText("");
      setFiles([]);
      setUrgent(false);
      setProblem("");
      if (onCancelReply) onCancelReply();
    }
  };

  return (
    <Box sx={{ borderTop: 1, borderColor: "divider", p: 1, bgcolor: "background.paper" }} data-testid="composer">
      {replyTo && (
        <Stack direction="row" alignItems="center" sx={{ bgcolor: "action.hover", borderRadius: 1, px: 1, py: 0.5, mb: 0.5 }}>
          <Typography variant="caption" noWrap sx={{ flex: 1 }}>
            Replying to <strong>{replyTo.sender.name}</strong>: {replyTo.body || "Photo"}
          </Typography>
          <IconButton size="small" aria-label="Cancel reply" onClick={onCancelReply}>
            <CloseIcon fontSize="inherit" />
          </IconButton>
        </Stack>
      )}
      {(error || problem) && (
        <Alert severity="error" sx={{ mb: 0.5, py: 0 }} data-testid="composer-error">
          {problem || error}
        </Alert>
      )}
      {previews.length > 0 && (
        <Stack direction="row" spacing={1} sx={{ mb: 0.5, flexWrap: "wrap" }} useFlexGap data-testid="attachment-previews">
          {previews.map((p, i) => (
            <Box key={p.url} sx={{ position: "relative" }}>
              <Box component="img" src={p.url} alt={`Attachment ${i + 1}`} sx={{ height: 56, borderRadius: 1, display: "block" }} />
              <IconButton
                size="small"
                aria-label={`Remove attachment ${i + 1}`}
                onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))}
                sx={{ position: "absolute", top: -8, right: -8, bgcolor: "background.paper", p: 0.25 }}
              >
                <CloseIcon fontSize="inherit" />
              </IconButton>
            </Box>
          ))}
        </Stack>
      )}
      <Stack direction="row" spacing={0.5} alignItems="flex-end">
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          hidden
          data-testid="file-input"
          onChange={(e) => addFiles(e.target.files)}
        />
        <Tooltip title={`Attach pictures (up to ${MAX_IMAGES}, shrunk to 1 MB each)`}>
          <span>
            <IconButton aria-label="Attach pictures" disabled={disabled || files.length >= MAX_IMAGES} onClick={() => input.current && input.current.click()}>
              <AttachFileIcon />
            </IconButton>
          </span>
        </Tooltip>
        <TextField
          fullWidth
          multiline
          maxRows={5}
          size="small"
          placeholder="Write a message"
          value={text}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          inputProps={{ "data-testid": "message-input", "aria-label": "Message" }}
        />
        <Tooltip title={urgent ? "Marked urgent" : "Mark urgent"}>
          <IconButton aria-label="Mark urgent" aria-pressed={urgent} color={urgent ? "error" : "default"} onClick={() => setUrgent((u) => !u)} data-testid="urgent-toggle">
            <PriorityHighIcon />
          </IconButton>
        </Tooltip>
        <IconButton color="primary" aria-label="Send" disabled={!canSend} onClick={submit} data-testid="send-button">
          <SendIcon />
        </IconButton>
      </Stack>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.25, px: 0.5 }}>
        {urgent && <Chip size="small" color="error" label="Urgent" />}
        {text.length > MAX_BODY - 500 && (
          <Typography variant="caption" color={text.length > MAX_BODY ? "error" : "text.secondary"}>
            {text.length}/{MAX_BODY}
          </Typography>
        )}
      </Stack>
    </Box>
  );
}
