import { useEffect, useState } from "react";
import {
  Autocomplete,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  TextField,
} from "@mui/material";

// New message, or Forward (the subject is fixed and the box is a note above the quoted thread).
export default function ComposeDialog({ open, onClose, onSend, people, saving, forwardOf = null, aboutPatient = null }) {
  const [to, setTo] = useState([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [about, setAbout] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTo([]);
    setSubject(forwardOf ? `Fwd: ${forwardOf.title}` : "");
    setBody("");
    setAbout(false);
  }, [open, forwardOf]);

  const ready = to.length > 0 && (forwardOf || (subject.trim() && body.trim()));
  const send = () =>
    onSend({
      to: to.map((p) => p.id),
      subject: subject.trim(),
      body: body.trim(),
      note: body.trim(),
      patient: about && aboutPatient ? aboutPatient.id : null,
    });

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>{forwardOf ? "Forward message" : "New message"}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <Autocomplete
            multiple
            options={people}
            value={to}
            onChange={(e, v) => setTo(v)}
            getOptionLabel={(p) => p.name}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            renderInput={(params) => <TextField {...params} label="To" required />}
          />
          <TextField label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} disabled={!!forwardOf} fullWidth required />
          <TextField
            label={forwardOf ? "Add a note (optional)" : "Message"}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            multiline
            minRows={4}
            fullWidth
            required={!forwardOf}
          />
          {aboutPatient && !forwardOf && (
            <FormControlLabel
              control={<Checkbox checked={about} onChange={(e) => setAbout(e.target.checked)} />}
              label={`This message is about ${aboutPatient.name}`}
            />
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button variant="contained" onClick={send} disabled={saving || !ready}>
          {forwardOf ? "Forward" : "Send"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
