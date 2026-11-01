import { useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { getValidToken } from "../../utils/auth";
import { REMINDERS, dueToIso } from "./cosignHelpers";

// Asks how to sign: just sign, or sign and ask someone to co-sign. With requestOnly the note is
// already signed and the dialog only collects the request (used from Note History).
export default function SignDialog({ open, onClose, onConfirm, saving, requestOnly = false }) {
  const [mode, setMode] = useState("sign");
  const [people, setPeople] = useState([]);
  const [cosigner, setCosigner] = useState("");
  const [due, setDue] = useState("");
  const [reminder, setReminder] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!open) return undefined;
    let live = true;
    setMode(requestOnly ? "request" : "sign");
    setCosigner("");
    setDue("");
    setReminder("");
    setMessage("");
    (async () => {
      try {
        const token = await getValidToken();
        const headers = token ? { Authorization: `Bearer ${token.access_token || token}` } : {};
        const res = await api.get(apiEndpoints.clinicalNoteCosigners, { headers });
        if (live) setPeople(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        if (live) setPeople([]);
      }
    })();
    return () => {
      live = false;
    };
  }, [open, requestOnly]);

  const asking = mode === "request";
  const canConfirm = !saving && (!asking || cosigner);
  const confirm = () =>
    onConfirm(
      asking
        ? {
            cosigner: Number(cosigner),
            message: message.trim(),
            due_at: dueToIso(due),
            reminder_minutes: due && reminder !== "" ? Number(reminder) : null,
          }
        : null
    );

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>{requestOnly ? "Request co-signature" : "Sign this note"}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          {!requestOnly && (
            <FormControl>
              <RadioGroup value={mode} onChange={(e) => setMode(e.target.value)}>
                <FormControlLabel value="sign" control={<Radio />} label="Sign only" />
                <FormControlLabel
                  value="request"
                  control={<Radio />}
                  disabled={people.length === 0}
                  label="Sign and request co-signature"
                />
              </RadioGroup>
            </FormControl>
          )}
          {people.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              No one else here holds the co-sign right. An admin can grant it under Rights.
            </Typography>
          )}
          {asking && (
            <>
              <Typography variant="body2" color="text.secondary">
                The note goes into the chart as soon as it is signed, marked "Awaiting co-signature".
              </Typography>
              <TextField
                select
                label="Co-signer"
                value={cosigner}
                onChange={(e) => setCosigner(e.target.value)}
                fullWidth
                required
              >
                {people.map((p) => (
                  <MenuItem key={p.id} value={p.id}>
                    {p.name} ({p.role})
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="Needed by"
                type="datetime-local"
                value={due}
                onChange={(e) => setDue(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                fullWidth
              />
              <TextField
                select
                label="Reminder"
                value={reminder}
                onChange={(e) => setReminder(e.target.value)}
                disabled={!due}
                fullWidth
              >
                {REMINDERS.map((r) => (
                  <MenuItem key={r.value} value={r.value}>
                    {r.label}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="Message to the co-signer (optional)"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                multiline
                minRows={2}
                fullWidth
              />
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button variant="contained" color="success" onClick={confirm} disabled={!canConfirm}>
          {requestOnly ? "Send request" : asking ? "Sign & request" : "Sign & Lock"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
