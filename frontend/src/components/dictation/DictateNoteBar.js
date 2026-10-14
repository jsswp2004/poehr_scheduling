import { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import MicIcon from "@mui/icons-material/Mic";
import StopIcon from "@mui/icons-material/Stop";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { authHeader } from "../patientHeader/headerApi";
import { useDictationConfig } from "./DictationContext";
import { appendText } from "./commands";
import useDictation from "./useDictation";

const TEXT_TYPES = new Set(["text", "textarea"]);

/** The value as a person would read it: option labels, not option codes. */
export function describeValue(field, value) {
  if (Array.isArray(value)) {
    return value.map((v) => (field.options || []).find((o) => o.value === v)?.label || v).join(", ");
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  const option = (field.options || []).find((o) => o.value === value);
  return option ? option.label : String(value);
}

/**
 * Turn an accepted proposal into the value to store. Text is added after what is already written;
 * everything else replaces the current answer.
 */
export function mergeValue(field, existing, proposed) {
  if (TEXT_TYPES.has(field.field_type)) {
    return existing && String(existing).trim() ? `${String(existing).replace(/\s+$/, "")}\n${proposed}` : proposed;
  }
  return proposed;
}

function ReviewDialog({ open, transcript, result, fields, getValue, onApply, onClose }) {
  const byKey = useMemo(() => Object.fromEntries(fields.map((f) => [f.key, f])), [fields]);
  const keys = Object.keys(result?.fields || {});
  const [accepted, setAccepted] = useState(() => Object.fromEntries(keys.map((k) => [k, true])));
  const count = keys.filter((k) => accepted[k]).length;

  const apply = () => {
    const values = {};
    keys.forEach((k) => {
      if (accepted[k]) values[k] = mergeValue(byKey[k], getValue(k), result.fields[k]);
    });
    onApply(values);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth aria-labelledby="dictation-review-title">
      <DialogTitle id="dictation-review-title">
        Review AI cleanup
        <Typography variant="body2" color="text.secondary">
          Nothing is added to the note until you apply it. If something was not said, its field stays empty.
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        <Stack direction={{ xs: "column", md: "row" }} spacing={3}>
          <Box sx={{ flex: "0 0 32%", minWidth: 0 }}>
            <Typography variant="overline" color="text.secondary">
              What you said
            </Typography>
            <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
              {transcript}
            </Typography>
          </Box>
          <Stack spacing={1.5} sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="overline" color="text.secondary">
              Proposed note
            </Typography>
            {keys.length === 0 && <Alert severity="info">No note fields could be filled from this dictation.</Alert>}
            {keys.map((k) => (
              <Paper key={k} variant="outlined" sx={{ p: 1.5 }}>
                <Stack direction="row" alignItems="center">
                  <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
                    {byKey[k].label}
                  </Typography>
                  <FormControlLabel
                    control={<Checkbox size="small" checked={!!accepted[k]} onChange={(e) => setAccepted((a) => ({ ...a, [k]: e.target.checked }))} />}
                    label="Accept"
                  />
                </Stack>
                <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                  {describeValue(byKey[k], result.fields[k])}
                </Typography>
                {TEXT_TYPES.has(byKey[k].field_type) && String(getValue(k) || "").trim() && (
                  <Typography variant="caption" color="text.secondary">
                    Will be added after what is already in this field.
                  </Typography>
                )}
              </Paper>
            ))}
            {result.uncertain.length > 0 && (
              <Alert severity="warning">
                Please check what you meant:
                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 0.5 }}>
                  {result.uncertain.map((u) => (
                    <Chip key={u} size="small" label={u} />
                  ))}
                </Stack>
              </Alert>
            )}
            {result.unplaced.length > 0 && (
              <Alert severity="info">
                Not applied because no field fit:
                {result.unplaced.map((u) => (
                  <Typography key={u} variant="body2">
                    "{u}"
                  </Typography>
                ))}
              </Alert>
            )}
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Discard</Button>
        <Button variant="contained" onClick={apply} disabled={count === 0}>
          Apply {count} accepted {count === 1 ? "field" : "fields"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * "Dictate whole note": speak freely, then let AI cleanup propose values for the note's fields.
 *   fields      [{ key, label, field_type, options }]  the fields the AI may fill
 *   getValue    (key) => current value, so accepted text can be added after what is there
 *   onApply     ({ key: value }) => void
 * Renders nothing unless dictation and AI cleanup are both on for this organization.
 */
export default function DictateNoteBar({ fields, getValue, onApply, disabled }) {
  const { enabled, cleanup } = useDictationConfig();
  const [transcript, setTranscript] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [result, setResult] = useState(null);

  const dictation = useDictation({ onText: (text) => setTranscript((t) => appendText(t, text)) });

  if (!enabled || !cleanup || !dictation.supported) return null;

  const listening = dictation.status === "listening";
  const connecting = dictation.status === "connecting";

  const runCleanup = async () => {
    setProblem("");
    setBusy(true);
    try {
      if (listening) await dictation.stop();
      const { data } = await api.post(
        apiEndpoints.dictationCleanup,
        { transcript, fields },
        { headers: await authHeader() }
      );
      setResult(data);
    } catch (err) {
      const status = err?.response?.status;
      setProblem(
        status === 503
          ? "AI cleanup is not available right now. Your dictation is kept below."
          : status === 400
          ? "That dictation is too long to clean up in one go. Clean up part of it at a time."
          : "AI cleanup failed. Your dictation is kept below; you can try again."
      );
    } finally {
      setBusy(false);
    }
  };

  const finish = (values) => {
    onApply(values);
    setResult(null);
    setTranscript("");
  };

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={1.5}>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
          <Button
            variant={listening ? "contained" : "outlined"}
            color={listening ? "error" : "primary"}
            startIcon={connecting ? <CircularProgress size={16} /> : listening ? <StopIcon /> : <MicIcon />}
            onClick={dictation.toggle}
            disabled={disabled || connecting || busy}
          >
            {listening ? "Stop" : "Dictate whole note"}
          </Button>
          <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>
            {listening
              ? dictation.partial
                ? `${dictation.partial} ...`
                : "Listening... say \"new paragraph\" or \"stop dictation\""
              : "Speak freely, then clean up and structure it into the fields below."}
          </Typography>
        </Stack>
        {dictation.error && <Alert severity="error">{dictation.error}</Alert>}
        {problem && <Alert severity="error">{problem}</Alert>}
        {(transcript || listening) && (
          <>
            <TextField
              label="Dictation (you can edit this before cleanup)"
              multiline
              minRows={3}
              fullWidth
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              disabled={busy}
            />
            <Stack direction="row" spacing={1}>
              <Button variant="contained" onClick={runCleanup} disabled={busy || !transcript.trim() || connecting}>
                {busy ? "Cleaning up..." : "Clean up & structure"}
              </Button>
              <Button onClick={() => setTranscript("")} disabled={busy || listening}>
                Clear
              </Button>
            </Stack>
          </>
        )}
      </Stack>
      {result && (
        <ReviewDialog
          open
          transcript={transcript}
          result={result}
          fields={fields}
          getValue={getValue}
          onApply={finish}
          onClose={() => setResult(null)}
        />
      )}
    </Paper>
  );
}
